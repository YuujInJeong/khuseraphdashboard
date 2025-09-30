import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { SSHManager } from './sshManager';

export interface JobConfig {
    name: string;
    gpuCount: number;
    gpuNode?: string;
    cpuPerGpu: number;
    memoryPerGpu: string;
    partition: string;
    timeLimit: string;
    scriptPath: string;
    outputPath?: string;
    errorPath?: string;
}

export interface JobInfo {
    jobId: string;
    name: string;
    status: string;
    gpuNode: string;
    submitTime: Date;
    startTime?: Date;
    endTime?: Date;
    partition: string;
    timeLimit: string;
}

export class JobManager {
    private _onJobStatusChanged: vscode.EventEmitter<JobInfo[]> = new vscode.EventEmitter<JobInfo[]>();
    public readonly onJobStatusChanged: vscode.Event<JobInfo[]> = this._onJobStatusChanged.event;
    
    private runningJobs: JobInfo[] = [];
    private completedJobs: JobInfo[] = [];
    private refreshInterval: NodeJS.Timer | undefined;

    constructor(private sshManager: SSHManager) {}

    async submitJob(): Promise<void> {
        if (!this.sshManager.isConnected()) {
            vscode.window.showErrorMessage('Not connected to server');
            return;
        }

        const jobConfig = await this.getJobConfiguration();
        if (!jobConfig) {
            return;
        }

        try {
            const scriptContent = this.generateScriptContent(jobConfig);
            const scriptPath = await this.saveScript(scriptContent, jobConfig.name);
            
            // Upload script to server
            await this.uploadScript(scriptPath, jobConfig.scriptPath);
            
            // Submit job
            const result = await this.sshManager.executeCommand(`cd ${path.dirname(jobConfig.scriptPath)} && sbatch ${path.basename(jobConfig.scriptPath)}`);
            
            if (result.code === 0) {
                const jobId = this.extractJobId(result.stdout);
                vscode.window.showInformationMessage(`Job submitted successfully. Job ID: ${jobId}`);
                await this.refreshJobs();
            } else {
                vscode.window.showErrorMessage(`Job submission failed: ${result.stderr}`);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to submit job: ${error}`);
        }
    }

    private async getJobConfiguration(): Promise<JobConfig | undefined> {
        // Get job name
        const jobName = await vscode.window.showInputBox({
            prompt: 'Enter job name',
            placeHolder: 'my-training-job'
        });
        if (!jobName) return undefined;

        // Get GPU count
        const gpuCountStr = await vscode.window.showQuickPick(
            ['1', '2', '4', '8'],
            { placeHolder: 'Select number of GPUs' }
        );
        if (!gpuCountStr) return undefined;

        // Get selected GPU node from dashboard
        const selectedGPU = vscode.workspace.getConfiguration().get<string>('seraph.selectedGPU');
        let gpuNode = selectedGPU;
        
        if (!gpuNode) {
            gpuNode = await vscode.window.showInputBox({
                prompt: 'Enter GPU node (or select from dashboard first)',
                placeHolder: 'aurora-g1'
            });
        }

        // Get CPU per GPU
        const cpuPerGpuStr = await vscode.window.showQuickPick(
            ['4', '8', '16', '32'],
            { placeHolder: 'Select CPU cores per GPU' }
        );
        if (!cpuPerGpuStr) return undefined;

        // Get memory per GPU
        const memoryPerGpu = await vscode.window.showQuickPick(
            ['16G', '32G', '64G', '128G'],
            { placeHolder: 'Select memory per GPU' }
        );
        if (!memoryPerGpu) return undefined;

        // Get partition
        const partition = await vscode.window.showQuickPick(
            ['debug_ugrad', 'batch_ugrad', 'gpu_ugrad', 'cpu_ugrad'],
            { placeHolder: 'Select partition' }
        );
        if (!partition) return undefined;

        // Get time limit
        const timeLimit = await vscode.window.showInputBox({
            prompt: 'Enter time limit (format: D-HH:MM:SS)',
            placeHolder: '1-00:00:00',
            value: '1-00:00:00'
        });
        if (!timeLimit) return undefined;

        // Get Python script path
        const scriptPath = await vscode.window.showInputBox({
            prompt: 'Enter Python script path to execute',
            placeHolder: '/data/username/repos/train.py'
        });
        if (!scriptPath) return undefined;

        const config = vscode.workspace.getConfiguration('seraph');
        const remotePath = config.get<string>('remotePath', '');

        return {
            name: jobName,
            gpuCount: parseInt(gpuCountStr),
            gpuNode,
            cpuPerGpu: parseInt(cpuPerGpuStr),
            memoryPerGpu,
            partition,
            timeLimit,
            scriptPath: `${remotePath}/${jobName}.sh`,
            outputPath: `${remotePath}/${jobName}.out`,
            errorPath: `${remotePath}/${jobName}.err`
        };
    }

    private generateScriptContent(config: JobConfig): string {
        return `#!/bin/bash
#SBATCH --job-name=${config.name}
#SBATCH --output=${config.outputPath}
#SBATCH --error=${config.errorPath}
#SBATCH --partition=${config.partition}
#SBATCH --nodes=1
#SBATCH --ntasks=1
#SBATCH --gres=gpu:${config.gpuCount}
#SBATCH --cpus-per-task=${config.cpuPerGpu * config.gpuCount}
#SBATCH --mem=${parseInt(config.memoryPerGpu) * config.gpuCount}G
#SBATCH --time=${config.timeLimit}
${config.gpuNode ? `#SBATCH --nodelist=${config.gpuNode}` : ''}

# Job information
echo "Job started at: $(date)"
echo "Running on node: $(hostname)"
echo "CUDA devices: $CUDA_VISIBLE_DEVICES"

# Activate conda environment (modify as needed)
# source ~/miniconda3/etc/profile.d/conda.sh
# conda activate your-env

# Run the Python script
python ${config.scriptPath}

echo "Job completed at: $(date)"
`;
    }

    private async saveScript(content: string, jobName: string): Promise<string> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            throw new Error('No workspace folder found');
        }

        const scriptPath = path.join(workspaceFolder.uri.fsPath, `${jobName}.sh`);
        fs.writeFileSync(scriptPath, content);
        
        // Open the script file for editing
        const document = await vscode.workspace.openTextDocument(scriptPath);
        await vscode.window.showTextDocument(document);
        
        return scriptPath;
    }

    private async uploadScript(localPath: string, remotePath: string): Promise<void> {
        // For now, we'll use scp command through SSH
        // In a real implementation, you might use SFTP
        const content = fs.readFileSync(localPath, 'utf8');
        
        // Create the script on remote server
        const command = `cat > ${remotePath} << 'EOF'\n${content}\nEOF\nchmod +x ${remotePath}`;
        const result = await this.sshManager.executeCommand(command);
        
        if (result.code !== 0) {
            throw new Error(`Failed to upload script: ${result.stderr}`);
        }
    }

    private extractJobId(output: string): string {
        const match = output.match(/Submitted batch job (\d+)/);
        return match ? match[1] : 'unknown';
    }

    async refreshJobs(): Promise<void> {
        if (!this.sshManager.isConnected()) {
            return;
        }

        try {
            const config = vscode.workspace.getConfiguration('seraph');
            const username = config.get<string>('username');
            
            if (!username) {
                return;
            }

            const result = await this.sshManager.executeCommand(`squeue -u ${username} --format="%.10i %.20j %.8T %.15P %.10M %.15l %.6D %.20S %.20e %.20N" --noheader`);
            
            if (result.code === 0) {
                this.runningJobs = this.parseJobQueue(result.stdout);
                this._onJobStatusChanged.fire(this.runningJobs);
            }
        } catch (error) {
            console.error('Failed to refresh jobs:', error);
        }
    }

    private parseJobQueue(output: string): JobInfo[] {
        const lines = output.split('\n').filter(line => line.trim());
        const jobs: JobInfo[] = [];

        for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 6) {
                jobs.push({
                    jobId: parts[0],
                    name: parts[1],
                    status: parts[2],
                    partition: parts[3],
                    timeLimit: parts[5] || '',
                    gpuNode: parts[9] || '',
                    submitTime: new Date() // This would need proper parsing in real implementation
                });
            }
        }

        return jobs;
    }

    async cancelJob(jobId: string): Promise<void> {
        try {
            const result = await this.sshManager.executeCommand(`scancel ${jobId}`);
            if (result.code === 0) {
                vscode.window.showInformationMessage(`Job ${jobId} cancelled successfully`);
                await this.refreshJobs();
            } else {
                vscode.window.showErrorMessage(`Failed to cancel job ${jobId}: ${result.stderr}`);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to cancel job: ${error}`);
        }
    }

    getRunningJobs(): JobInfo[] {
        return this.runningJobs;
    }

    startAutoRefresh(): void {
        if (this.refreshInterval) {
            return;
        }
        
        this.refreshInterval = setInterval(() => {
            this.refreshJobs();
        }, 10000); // 10 seconds
    }

    stopAutoRefresh(): void {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = undefined;
        }
    }
}