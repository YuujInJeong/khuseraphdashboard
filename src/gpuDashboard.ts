import * as vscode from 'vscode';
import { GPUManager, GPUStatus, GPUNode } from './gpuManager';
import { SSHManager } from './sshManager';

export class GPUDashboard {
    private panel: vscode.WebviewPanel | undefined;
    private disposables: vscode.Disposable[] = [];
    private autoRefreshInterval: NodeJS.Timer | undefined;
    private isAutoRefreshEnabled = false;

    constructor(
        private context: vscode.ExtensionContext,
        private sshManager: SSHManager,
        private gpuManager: GPUManager
    ) {}

    public show(): void {
        if (this.panel) {
            this.panel.reveal();
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'seraphGPUDashboard',
            'Seraph GPU Dashboard',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        this.panel.webview.html = this.getWebviewContent();

        this.panel.webview.onDidReceiveMessage(
            message => this.handleMessage(message),
            undefined,
            this.disposables
        );

        this.panel.onDidDispose(
            () => {
                this.dispose();
            },
            undefined,
            this.disposables
        );

        // Load initial data
        this.refreshGPUData();
    }

    private async handleMessage(message: any): Promise<void> {
        switch (message.type) {
            case 'refresh':
                await this.refreshGPUData();
                break;
            case 'toggleAutoRefresh':
                this.toggleAutoRefresh();
                break;
            case 'selectGPU':
                // Store selected GPU for later use in job submission
                const config = vscode.workspace.getConfiguration('seraph');
                await config.update('selectedGPU', message.node, vscode.ConfigurationTarget.Workspace);
                vscode.window.showInformationMessage(`Selected GPU node: ${message.node}`);
                break;
            case 'connectToGPU':
                await this.gpuManager.connectToGPUNode(message.node);
                break;
        }
    }

    private async refreshGPUData(): Promise<void> {
        if (!this.panel) {
            return;
        }

        try {
            if (!this.sshManager.isConnected()) {
                this.panel.webview.postMessage({
                    type: 'error',
                    message: 'Not connected to server'
                });
                return;
            }

            const status = await this.gpuManager.getGPUStatus();
            this.panel.webview.postMessage({
                type: 'updateGPU',
                data: status
            });
        } catch (error) {
            this.panel.webview.postMessage({
                type: 'error',
                message: `Failed to refresh GPU status: ${error}`
            });
        }
    }

    private toggleAutoRefresh(): void {
        this.isAutoRefreshEnabled = !this.isAutoRefreshEnabled;

        if (this.isAutoRefreshEnabled) {
            this.autoRefreshInterval = setInterval(() => {
                this.refreshGPUData();
            }, 30000); // 30 seconds
        } else {
            if (this.autoRefreshInterval) {
                clearInterval(this.autoRefreshInterval);
                this.autoRefreshInterval = undefined;
            }
        }

        this.panel?.webview.postMessage({
            type: 'autoRefreshToggled',
            enabled: this.isAutoRefreshEnabled
        });
    }

    private getWebviewContent(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Seraph GPU Dashboard</title>
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

        .header h1 {
            color: var(--vscode-titleBar-activeForeground);
        }

        .controls {
            display: flex;
            gap: 10px;
        }

        .btn {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
        }

        .btn:hover {
            background-color: var(--vscode-button-hoverBackground);
        }

        .btn.active {
            background-color: var(--vscode-button-secondaryBackground);
        }

        .gpu-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
            gap: 20px;
        }

        .gpu-card {
            background-color: var(--vscode-panel-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            padding: 20px;
            cursor: pointer;
            transition: all 0.3s ease;
        }

        .gpu-card:hover {
            border-color: var(--vscode-focusBorder);
            transform: translateY(-2px);
        }

        .gpu-card.selected {
            border-color: var(--vscode-button-background);
            background-color: var(--vscode-list-activeSelectionBackground);
        }

        .gpu-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
        }

        .gpu-name {
            font-size: 18px;
            font-weight: bold;
            color: var(--vscode-titleBar-activeForeground);
        }

        .gpu-availability {
            font-size: 12px;
            padding: 4px 8px;
            border-radius: 12px;
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
        }

        .gpu-status {
            margin-bottom: 15px;
        }

        .gpu-status-label {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 5px;
        }

        .gpu-bar {
            display: flex;
            gap: 2px;
            margin-bottom: 10px;
        }

        .gpu-slot {
            flex: 1;
            height: 20px;
            border-radius: 2px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            font-weight: bold;
        }

        .gpu-slot.available {
            background-color: #28a745;
            color: white;
        }

        .gpu-slot.used {
            background-color: #dc3545;
            color: white;
        }

        .metrics {
            display: flex;
            gap: 20px;
        }

        .metric {
            flex: 1;
        }

        .metric-label {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 5px;
        }

        .metric-bar {
            background-color: var(--vscode-progressBar-background);
            height: 8px;
            border-radius: 4px;
            overflow: hidden;
        }

        .metric-fill {
            height: 100%;
            border-radius: 4px;
            transition: width 0.3s ease;
        }

        .metric-fill.cpu {
            background-color: #007acc;
        }

        .metric-fill.memory {
            background-color: #ff6b35;
        }

        .metric-value {
            font-size: 12px;
            color: var(--vscode-editor-foreground);
            margin-top: 5px;
        }

        .error {
            background-color: var(--vscode-inputValidation-errorBackground);
            border: 1px solid var(--vscode-inputValidation-errorBorder);
            color: var(--vscode-inputValidation-errorForeground);
            padding: 15px;
            border-radius: 4px;
            margin-bottom: 20px;
        }

        .loading {
            text-align: center;
            padding: 40px;
            color: var(--vscode-descriptionForeground);
        }

        .last-updated {
            text-align: center;
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin-top: 20px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>GPU Dashboard</h1>
        <div class="controls">
            <button class="btn" id="refreshBtn">Refresh</button>
            <button class="btn" id="autoRefreshBtn">Auto Refresh</button>
        </div>
    </div>

    <div id="content">
        <div class="loading">Loading GPU status...</div>
    </div>

    <div class="last-updated" id="lastUpdated"></div>

    <script>
        const vscode = acquireVsCodeApi();
        let selectedGPU = null;
        let autoRefreshEnabled = false;

        document.getElementById('refreshBtn').addEventListener('click', () => {
            vscode.postMessage({ type: 'refresh' });
        });

        document.getElementById('autoRefreshBtn').addEventListener('click', () => {
            vscode.postMessage({ type: 'toggleAutoRefresh' });
        });

        window.addEventListener('message', event => {
            const message = event.data;

            switch (message.type) {
                case 'updateGPU':
                    renderGPUStatus(message.data);
                    break;
                case 'error':
                    showError(message.message);
                    break;
                case 'autoRefreshToggled':
                    autoRefreshEnabled = message.enabled;
                    updateAutoRefreshButton();
                    break;
            }
        });

        function renderGPUStatus(status) {
            const content = document.getElementById('content');
            const lastUpdated = document.getElementById('lastUpdated');

            if (status.nodes.length === 0) {
                content.innerHTML = '<div class="loading">No GPU nodes found</div>';
                return;
            }

            let html = '<div class="gpu-grid">';

            status.nodes.forEach(node => {
                const availabilityText = node.availableGPUs + '/' + node.totalGPUs + ' available';
                const isSelected = selectedGPU === node.name;

                html += \`
                    <div class="gpu-card \${isSelected ? 'selected' : ''}" onclick="selectGPU('\${node.name}')">
                        <div class="gpu-header">
                            <div class="gpu-name">\${node.name}</div>
                            <div class="gpu-availability">\${availabilityText}</div>
                        </div>
                        <div style="margin-bottom: 10px;">
                            <button class="btn" onclick="event.stopPropagation(); connectToGPU('\${node.name}')" style="font-size: 12px; padding: 4px 8px;">
                                🔗 Connect to \${node.name}
                            </button>
                        </div>
                        <div class="gpu-status">
                            <div class="gpu-status-label">GPU Status</div>
                            <div class="gpu-bar">
                \`;

                node.gpuStatus.forEach((status, index) => {
                    const className = status === '-' ? 'available' : 'used';
                    const text = status === '-' ? '-' : '#';
                    html += \`<div class="gpu-slot \${className}">\${text}</div>\`;
                });

                html += \`
                            </div>
                        </div>
                        <div class="metrics">
                \`;

                if (node.cpuUsage !== undefined) {
                    html += \`
                        <div class="metric">
                            <div class="metric-label">CPU Usage</div>
                            <div class="metric-bar">
                                <div class="metric-fill cpu" style="width: \${node.cpuUsage}%"></div>
                            </div>
                            <div class="metric-value">\${node.cpuUsage}%</div>
                        </div>
                    \`;
                }

                if (node.memoryUsage !== undefined) {
                    html += \`
                        <div class="metric">
                            <div class="metric-label">Memory Usage</div>
                            <div class="metric-bar">
                                <div class="metric-fill memory" style="width: \${node.memoryUsage}%"></div>
                            </div>
                            <div class="metric-value">\${node.memoryUsage}%</div>
                        </div>
                    \`;
                }

                html += \`
                        </div>
                    </div>
                \`;
            });

            html += '</div>';
            content.innerHTML = html;

            lastUpdated.textContent = 'Last updated: ' + new Date(status.lastUpdated).toLocaleString();
        }

        function selectGPU(nodeName) {
            selectedGPU = nodeName;
            vscode.postMessage({ 
                type: 'selectGPU', 
                node: nodeName 
            });

            // Update visual selection
            document.querySelectorAll('.gpu-card').forEach(card => {
                card.classList.remove('selected');
            });
            event.target.closest('.gpu-card').classList.add('selected');
        }

        function connectToGPU(nodeName) {
            vscode.postMessage({ type: 'connectToGPU', node: nodeName });
        }

        function showError(message) {
            const content = document.getElementById('content');
            content.innerHTML = \`<div class="error">Error: \${message}</div>\`;
        }

        function updateAutoRefreshButton() {
            const btn = document.getElementById('autoRefreshBtn');
            if (autoRefreshEnabled) {
                btn.classList.add('active');
                btn.textContent = 'Auto Refresh ON';
            } else {
                btn.classList.remove('active');
                btn.textContent = 'Auto Refresh OFF';
            }
        }

        // Initialize
        updateAutoRefreshButton();
    </script>
</body>
</html>`;
    }

    private dispose(): void {
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
        }

        this.disposables.forEach(d => d.dispose());
        this.panel = undefined;
    }
}