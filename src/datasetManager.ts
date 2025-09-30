import * as vscode from 'vscode';
import * as path from 'path';
import { SSHManager } from './sshManager';

export interface DatasetInfo {
    name: string;
    path: string;
    size: string;
    lastModified: Date;
    isExtracted: boolean;
    extractedNodes: string[];
}

export interface ExtractionProgress {
    dataset: string;
    node: string;
    progress: number;
    status: 'pending' | 'extracting' | 'completed' | 'failed';
    message?: string;
}

export class DatasetManager {
    private _onExtractionProgress: vscode.EventEmitter<ExtractionProgress> = new vscode.EventEmitter<ExtractionProgress>();
    public readonly onExtractionProgress: vscode.Event<ExtractionProgress> = this._onExtractionProgress.event;

    constructor(private sshManager: SSHManager) {}

    async showDatasetDashboard(): Promise<void> {
        if (!this.sshManager.isConnected()) {
            vscode.window.showErrorMessage('Not connected to server');
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'seraphDatasets',
            'Dataset Management',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        panel.webview.html = await this.getWebviewContent();

        panel.webview.onDidReceiveMessage(async message => {
            switch (message.type) {
                case 'refresh':
                    panel.webview.html = await this.getWebviewContent();
                    break;
                case 'extractDataset':
                    await this.extractDatasetToNode(message.dataset, message.node, panel);
                    break;
                case 'deleteDataset':
                    await this.deleteDataset(message.dataset, panel);
                    break;
                case 'checkExtractionStatus':
                    await this.checkExtractionStatus(message.dataset, panel);
                    break;
            }
        });
    }

    private async getWebviewContent(): Promise<string> {
        const datasets = await this.getDatasetList();
        const gpuNodes = await this.getGPUNodes();

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dataset Management</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            padding: 20px;
        }

        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }

        .btn {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            margin-left: 10px;
        }

        .btn:hover {
            background-color: var(--vscode-button-hoverBackground);
        }

        .btn.danger {
            background-color: var(--vscode-inputValidation-errorBackground);
            color: var(--vscode-inputValidation-errorForeground);
        }

        .dataset-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
            gap: 20px;
        }

        .dataset-card {
            background-color: var(--vscode-panel-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            padding: 20px;
        }

        .dataset-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 15px;
        }

        .dataset-name {
            font-size: 18px;
            font-weight: bold;
            color: var(--vscode-titleBar-activeForeground);
        }

        .dataset-info {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 15px;
        }

        .extraction-status {
            margin-bottom: 15px;
        }

        .node-status {
            display: flex;
            align-items: center;
            margin-bottom: 5px;
            font-size: 12px;
        }

        .status-icon {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            margin-right: 8px;
        }

        .status-icon.extracted {
            background-color: #28a745;
        }

        .status-icon.not-extracted {
            background-color: #6c757d;
        }

        .status-icon.extracting {
            background-color: #ffc107;
            animation: pulse 1s infinite;
        }

        @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.5; }
            100% { opacity: 1; }
        }

        .extract-controls {
            display: flex;
            gap: 10px;
            align-items: center;
            margin-bottom: 10px;
        }

        .node-select {
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            padding: 6px 12px;
            border-radius: 4px;
            flex: 1;
        }

        .progress-bar {
            width: 100%;
            height: 4px;
            background-color: var(--vscode-progressBar-background);
            border-radius: 2px;
            overflow: hidden;
            margin-top: 10px;
        }

        .progress-fill {
            height: 100%;
            background-color: var(--vscode-progressBar-background);
            transition: width 0.3s ease;
        }

        .empty-state {
            text-align: center;
            padding: 60px 20px;
            color: var(--vscode-descriptionForeground);
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>Dataset Management</h1>
        <button class="btn" onclick="refreshDatasets()">Refresh</button>
    </div>

    <div id="content">
        ${datasets.length === 0 ? 
            '<div class="empty-state">No datasets found in /data/$USER/datasets/</div>' :
            this.generateDatasetCardsHTML(datasets, gpuNodes)
        }
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        function refreshDatasets() {
            vscode.postMessage({ type: 'refresh' });
        }

        function extractDataset(datasetName) {
            const nodeSelect = document.getElementById('node-select-' + datasetName);
            const selectedNode = nodeSelect.value;
            
            if (!selectedNode) {
                alert('Please select a GPU node');
                return;
            }

            vscode.postMessage({ 
                type: 'extractDataset', 
                dataset: datasetName,
                node: selectedNode
            });
        }

        function deleteDataset(datasetName) {
            if (confirm('Are you sure you want to delete ' + datasetName + '? This action cannot be undone.')) {
                vscode.postMessage({ 
                    type: 'deleteDataset', 
                    dataset: datasetName 
                });
            }
        }

        function checkStatus(datasetName) {
            vscode.postMessage({ 
                type: 'checkExtractionStatus', 
                dataset: datasetName 
            });
        }

        // Listen for progress updates
        window.addEventListener('message', event => {
            const message = event.data;
            
            switch (message.type) {
                case 'extractionProgress':
                    updateExtractionProgress(message.data);
                    break;
                case 'extractionComplete':
                    refreshDatasets();
                    break;
            }
        });

        function updateExtractionProgress(progress) {
            const progressBar = document.getElementById('progress-' + progress.dataset + '-' + progress.node);
            if (progressBar) {
                progressBar.style.width = progress.progress + '%';
            }
        }
    </script>
</body>
</html>`;
    }

    private generateDatasetCardsHTML(datasets: DatasetInfo[], gpuNodes: string[]): string {
        return `<div class="dataset-grid">
${datasets.map(dataset => `
    <div class="dataset-card">
        <div class="dataset-header">
            <div class="dataset-name">${dataset.name}</div>
            <button class="btn danger" onclick="deleteDataset('${dataset.name}')">Delete</button>
        </div>
        
        <div class="dataset-info">
            Size: ${dataset.size} | Modified: ${dataset.lastModified.toLocaleDateString()}
        </div>
        
        <div class="extraction-status">
            <strong>Extraction Status:</strong>
            ${gpuNodes.map(node => `
                <div class="node-status">
                    <div class="status-icon ${dataset.extractedNodes.includes(node) ? 'extracted' : 'not-extracted'}"></div>
                    ${node}: ${dataset.extractedNodes.includes(node) ? 'Extracted' : 'Not extracted'}
                </div>
            `).join('')}
        </div>
        
        <div class="extract-controls">
            <select class="node-select" id="node-select-${dataset.name}">
                <option value="">Select GPU node</option>
                ${gpuNodes.map(node => `<option value="${node}">${node}</option>`).join('')}
            </select>
            <button class="btn" onclick="extractDataset('${dataset.name}')">Extract</button>
            <button class="btn" onclick="checkStatus('${dataset.name}')">Check Status</button>
        </div>
        
        <div class="progress-bar">
            <div class="progress-fill" id="progress-${dataset.name}"></div>
        </div>
    </div>
`).join('')}
</div>`;
    }

    private async getDatasetList(): Promise<DatasetInfo[]> {
        try {
            const config = vscode.workspace.getConfiguration('seraph');
            const username = config.get<string>('username');
            
            if (!username) {
                throw new Error('Username not configured');
            }

            const datasetPath = `/data/${username}/datasets`;
            
            // List zip files in dataset directory
            const result = await this.sshManager.executeCommand(`ls -la ${datasetPath}/*.zip 2>/dev/null || echo "No datasets found"`);
            
            if (result.stdout.includes('No datasets found')) {
                return [];
            }

            const datasets: DatasetInfo[] = [];
            const lines = result.stdout.split('\n').filter(line => line.trim() && line.includes('.zip'));

            for (const line of lines) {
                const parts = line.trim().split(/\s+/);
                if (parts.length >= 9) {
                    const size = parts[4];
                    const fileName = parts[parts.length - 1];
                    const name = path.basename(fileName, '.zip');
                    
                    // Check which nodes have this dataset extracted
                    const extractedNodes = await this.checkExtractionOnNodes(name);
                    
                    datasets.push({
                        name,
                        path: fileName,
                        size,
                        lastModified: new Date(), // Would need proper parsing
                        isExtracted: extractedNodes.length > 0,
                        extractedNodes
                    });
                }
            }

            return datasets;
        } catch (error) {
            console.error('Failed to get dataset list:', error);
            return [];
        }
    }

    private async getGPUNodes(): Promise<string[]> {
        try {
            // Get node list from slurm
            const result = await this.sshManager.executeCommand('sinfo -N -h -p gpu_ugrad | awk \'{print $1}\' | sort | uniq');
            
            if (result.code === 0) {
                return result.stdout.split('\n').filter(node => node.trim().startsWith('aurora-g'));
            }
            
            // Fallback to common node names
            return ['aurora-g1', 'aurora-g2', 'aurora-g3', 'aurora-g4'];
        } catch (error) {
            return ['aurora-g1', 'aurora-g2', 'aurora-g3', 'aurora-g4'];
        }
    }

    private async checkExtractionOnNodes(datasetName: string): Promise<string[]> {
        const nodes = await this.getGPUNodes();
        const extractedNodes: string[] = [];
        
        const config = vscode.workspace.getConfiguration('seraph');
        const username = config.get<string>('username');
        
        for (const node of nodes) {
            try {
                const checkPath = `/local_datasets/${username}/${datasetName}`;
                const result = await this.sshManager.executeCommand(`srun --nodelist=${node} --pty test -d ${checkPath} && echo "exists" || echo "not found"`);
                
                if (result.stdout.includes('exists')) {
                    extractedNodes.push(node);
                }
            } catch (error) {
                // Node might be unavailable
            }
        }
        
        return extractedNodes;
    }

    private async extractDatasetToNode(datasetName: string, nodeName: string, panel: vscode.WebviewPanel): Promise<void> {
        try {
            const config = vscode.workspace.getConfiguration('seraph');
            const username = config.get<string>('username');
            
            const sourcePath = `/data/${username}/datasets/${datasetName}.zip`;
            const destPath = `/local_datasets/${username}`;

            this._onExtractionProgress.fire({
                dataset: datasetName,
                node: nodeName,
                progress: 0,
                status: 'pending',
                message: 'Starting extraction...'
            });

            // Create destination directory
            const mkdirResult = await this.sshManager.executeCommand(`srun --nodelist=${nodeName} --pty mkdir -p ${destPath}`);
            
            if (mkdirResult.code !== 0) {
                throw new Error(`Failed to create directory: ${mkdirResult.stderr}`);
            }

            this._onExtractionProgress.fire({
                dataset: datasetName,
                node: nodeName,
                progress: 25,
                status: 'extracting',
                message: 'Copying dataset...'
            });

            // Copy and extract dataset
            const extractCommand = `srun --nodelist=${nodeName} --pty bash -c "
                cd ${destPath} && 
                cp ${sourcePath} . && 
                echo 'Extracting...' && 
                unzip -o ${datasetName}.zip && 
                rm ${datasetName}.zip && 
                echo 'Extraction completed'
            "`;

            const extractResult = await this.sshManager.executeCommand(extractCommand);

            if (extractResult.code === 0) {
                this._onExtractionProgress.fire({
                    dataset: datasetName,
                    node: nodeName,
                    progress: 100,
                    status: 'completed',
                    message: 'Extraction completed successfully'
                });

                panel.webview.postMessage({
                    type: 'extractionComplete',
                    dataset: datasetName,
                    node: nodeName
                });

                vscode.window.showInformationMessage(`Dataset ${datasetName} extracted to ${nodeName} successfully`);
            } else {
                throw new Error(extractResult.stderr || 'Extraction failed');
            }

        } catch (error) {
            this._onExtractionProgress.fire({
                dataset: datasetName,
                node: nodeName,
                progress: 0,
                status: 'failed',
                message: `Error: ${error}`
            });

            vscode.window.showErrorMessage(`Failed to extract dataset: ${error}`);
        }
    }

    private async deleteDataset(datasetName: string, panel: vscode.WebviewPanel): Promise<void> {
        try {
            const config = vscode.workspace.getConfiguration('seraph');
            const username = config.get<string>('username');
            
            const datasetPath = `/data/${username}/datasets/${datasetName}.zip`;
            
            const result = await this.sshManager.executeCommand(`rm -f ${datasetPath}`);
            
            if (result.code === 0) {
                vscode.window.showInformationMessage(`Dataset ${datasetName} deleted successfully`);
                panel.webview.html = await this.getWebviewContent();
            } else {
                throw new Error(result.stderr || 'Delete failed');
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to delete dataset: ${error}`);
        }
    }

    private async checkExtractionStatus(datasetName: string, panel: vscode.WebviewPanel): Promise<void> {
        // Refresh the webview content to show current status
        panel.webview.html = await this.getWebviewContent();
    }
}