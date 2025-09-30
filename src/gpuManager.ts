import * as vscode from 'vscode';
import { SSHManager } from './sshManager';

export interface GPUNode {
    name: string;
    gpuStatus: string[];
    cpuUsage?: number;
    memoryUsage?: number;
    availableGPUs: number;
    totalGPUs: number;
}

export interface GPUStatus {
    nodes: GPUNode[];
    lastUpdated: Date;
}

export class GPUManager {
    private _onGPUStatusChanged: vscode.EventEmitter<GPUStatus> = new vscode.EventEmitter<GPUStatus>();
    public readonly onGPUStatusChanged: vscode.Event<GPUStatus> = this._onGPUStatusChanged.event;
    
    private lastStatus: GPUStatus | null = null;

    constructor(private sshManager: SSHManager) {}

    async getGPUStatus(): Promise<GPUStatus> {
        if (!this.sshManager.isConnected()) {
            throw new Error('Not connected to server');
        }

        try {
            const result = await this.sshManager.executeCommand('slurm-gres-viz -i');
            
            if (result.code !== 0) {
                throw new Error(`Command failed: ${result.stderr}`);
            }

            const status = this.parseGPUStatus(result.stdout);
            this.lastStatus = status;
            this._onGPUStatusChanged.fire(status);
            
            return status;
        } catch (error) {
            throw new Error(`Failed to get GPU status: ${error}`);
        }
    }

    private parseGPUStatus(output: string): GPUStatus {
        const lines = output.split('\n').filter(line => line.trim());
        const nodes: GPUNode[] = [];

        let currentNode: GPUNode | null = null;

        for (const line of lines) {
            const trimmedLine = line.trim();
            
            // Check for node header (e.g., "aurora-g1:")
            const nodeMatch = trimmedLine.match(/^(aurora-g\d+):/);
            if (nodeMatch) {
                if (currentNode) {
                    nodes.push(currentNode);
                }
                
                currentNode = {
                    name: nodeMatch[1],
                    gpuStatus: [],
                    availableGPUs: 0,
                    totalGPUs: 0
                };
                continue;
            }

            if (!currentNode) {
                continue;
            }

            // Parse GPU status line (e.g., "GPU: [#][-][-][-][-][-][-][-]")
            const gpuMatch = trimmedLine.match(/GPU:\s*(.+)/);
            if (gpuMatch) {
                const gpuString = gpuMatch[1];
                const gpuArray = Array.from(gpuString.matchAll(/\[(.)\]/g)).map(match => match[1]);
                currentNode.gpuStatus = gpuArray;
                currentNode.totalGPUs = gpuArray.length;
                currentNode.availableGPUs = gpuArray.filter(status => status === '-').length;
                continue;
            }

            // Parse CPU usage (e.g., "CPU: 45%")
            const cpuMatch = trimmedLine.match(/CPU:\s*(\d+)%/);
            if (cpuMatch) {
                currentNode.cpuUsage = parseInt(cpuMatch[1]);
                continue;
            }

            // Parse memory usage (e.g., "MEM: 67%")
            const memMatch = trimmedLine.match(/MEM:\s*(\d+)%/);
            if (memMatch) {
                currentNode.memoryUsage = parseInt(memMatch[1]);
                continue;
            }
        }

        // Add the last node if exists
        if (currentNode) {
            nodes.push(currentNode);
        }

        return {
            nodes,
            lastUpdated: new Date()
        };
    }

    getLastStatus(): GPUStatus | null {
        return this.lastStatus;
    }

    async refreshStatus(): Promise<void> {
        try {
            await this.getGPUStatus();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to refresh GPU status: ${error}`);
        }
    }
}