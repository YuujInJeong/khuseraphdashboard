import * as vscode from 'vscode';
import * as path from 'path';
import { SSHManager } from './sshManager';
import { JobInfo } from './jobManager';

export class JobLogViewer {
    private activeLogPanels: Map<string, LogPanel> = new Map();

    constructor(private sshManager: SSHManager) {}

    async showJobLog(job: JobInfo): Promise<void> {
        if (!this.sshManager.isConnected()) {
            vscode.window.showErrorMessage('Not connected to server');
            return;
        }

        const panelKey = `${job.jobId}-${job.name}`;
        
        // Check if panel already exists
        let panel = this.activeLogPanels.get(panelKey);
        if (panel) {
            panel.reveal();
            return;
        }

        // Create new log panel
        panel = new LogPanel(job, this.sshManager);
        this.activeLogPanels.set(panelKey, panel);

        panel.onDidDispose(() => {
            this.activeLogPanels.delete(panelKey);
        });

        await panel.show();
    }

    disposeAll(): void {
        for (const panel of this.activeLogPanels.values()) {
            panel.dispose();
        }
        this.activeLogPanels.clear();
    }
}

class LogPanel {
    private panel: vscode.WebviewPanel;
    private disposables: vscode.Disposable[] = [];
    private followMode = false;
    private refreshInterval: NodeJS.Timer | undefined;
    private lastLogContent = '';
    private _onDidDispose = new vscode.EventEmitter<void>();

    public readonly onDidDispose = this._onDidDispose.event;

    constructor(private job: JobInfo, private sshManager: SSHManager) {
        this.panel = vscode.window.createWebviewPanel(
            'seraphJobLog',
            `Log: ${job.name} (${job.jobId})`,
            vscode.ViewColumn.Two,
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
    }

    async show(): Promise<void> {
        await this.loadLog();
    }

    reveal(): void {
        this.panel.reveal();
    }

    private async handleMessage(message: any): Promise<void> {
        switch (message.type) {
            case 'refresh':
                await this.loadLog();
                break;
            case 'toggleFollow':
                this.toggleFollowMode();
                break;
            case 'downloadLog':
                await this.downloadLog();
                break;
        }
    }

    private async loadLog(): Promise<void> {
        try {
            // Get log file path from job info or construct it
            const config = vscode.workspace.getConfiguration('seraph');
            const remotePath = config.get<string>('remotePath', '');
            const logPath = `${remotePath}/${this.job.name}.out`;

            const result = await this.sshManager.executeCommand(`cat ${logPath} 2>/dev/null || echo "Log file not found or empty"`);
            
            if (result.code === 0) {
                this.lastLogContent = result.stdout;
                this.panel.webview.postMessage({
                    type: 'updateLog',
                    content: this.lastLogContent,
                    timestamp: new Date().toLocaleString()
                });
            } else {
                this.panel.webview.postMessage({
                    type: 'error',
                    message: `Failed to load log: ${result.stderr}`
                });
            }
        } catch (error) {
            this.panel.webview.postMessage({
                type: 'error',
                message: `Error loading log: ${error}`
            });
        }
    }

    private toggleFollowMode(): void {
        this.followMode = !this.followMode;

        if (this.followMode) {
            this.startFollowing();
        } else {
            this.stopFollowing();
        }

        this.panel.webview.postMessage({
            type: 'followModeChanged',
            enabled: this.followMode
        });
    }

    private startFollowing(): void {
        if (this.refreshInterval) {
            return;
        }

        this.refreshInterval = setInterval(async () => {
            await this.loadLog();
        }, 5000); // 5 seconds
    }

    private stopFollowing(): void {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = undefined;
        }
    }

    private async downloadLog(): Promise<void> {
        try {
            const saveUri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(`${this.job.name}-${this.job.jobId}.log`),
                filters: {
                    'Log Files': ['log', 'txt'],
                    'All Files': ['*']
                }
            });

            if (saveUri) {
                await vscode.workspace.fs.writeFile(saveUri, Buffer.from(this.lastLogContent));
                vscode.window.showInformationMessage(`Log saved to ${saveUri.fsPath}`);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to save log: ${error}`);
        }
    }

    private getWebviewContent(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Job Log: ${this.job.name}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            height: 100vh;
            display: flex;
            flex-direction: column;
        }

        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px 15px;
            background-color: var(--vscode-panel-background);
            border-bottom: 1px solid var(--vscode-panel-border);
            flex-shrink: 0;
        }

        .job-info {
            font-size: 14px;
            color: var(--vscode-descriptionForeground);
        }

        .job-title {
            font-weight: bold;
            color: var(--vscode-titleBar-activeForeground);
            margin-bottom: 2px;
        }

        .controls {
            display: flex;
            gap: 10px;
        }

        .btn {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 6px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
        }

        .btn:hover {
            background-color: var(--vscode-button-hoverBackground);
        }

        .btn.active {
            background-color: var(--vscode-button-secondaryBackground);
        }

        .log-container {
            flex: 1;
            overflow: auto;
            padding: 15px;
            background-color: var(--vscode-editor-background);
        }

        .log-content {
            white-space: pre-wrap;
            word-break: break-all;
            font-size: 13px;
            line-height: 1.4;
            color: var(--vscode-editor-foreground);
            min-height: 100%;
        }

        .log-content.empty {
            color: var(--vscode-descriptionForeground);
            font-style: italic;
            text-align: center;
            padding: 50px 20px;
        }

        .error {
            background-color: var(--vscode-inputValidation-errorBackground);
            border: 1px solid var(--vscode-inputValidation-errorBorder);
            color: var(--vscode-inputValidation-errorForeground);
            padding: 15px;
            border-radius: 4px;
            margin: 15px;
        }

        .status-bar {
            background-color: var(--vscode-statusBar-background);
            color: var(--vscode-statusBar-foreground);
            padding: 5px 15px;
            font-size: 12px;
            border-top: 1px solid var(--vscode-panel-border);
            flex-shrink: 0;
        }

        /* Syntax highlighting for common log patterns */
        .log-content .error-line {
            color: var(--vscode-errorForeground);
            background-color: rgba(255, 0, 0, 0.1);
        }

        .log-content .warning-line {
            color: var(--vscode-warningForeground);
            background-color: rgba(255, 165, 0, 0.1);
        }

        .log-content .info-line {
            color: var(--vscode-textLink-foreground);
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="job-info">
            <div class="job-title">${this.job.name} (Job ID: ${this.job.jobId})</div>
            <div>Status: ${this.job.status} • Node: ${this.job.gpuNode || 'N/A'}</div>
        </div>
        <div class="controls">
            <button class="btn" id="refreshBtn">Refresh</button>
            <button class="btn" id="followBtn">Follow</button>
            <button class="btn" id="downloadBtn">Download</button>
        </div>
    </div>

    <div class="log-container">
        <div class="log-content empty" id="logContent">
            Loading log...
        </div>
    </div>

    <div class="status-bar" id="statusBar">
        Ready
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let followMode = false;

        document.getElementById('refreshBtn').addEventListener('click', () => {
            vscode.postMessage({ type: 'refresh' });
        });

        document.getElementById('followBtn').addEventListener('click', () => {
            vscode.postMessage({ type: 'toggleFollow' });
        });

        document.getElementById('downloadBtn').addEventListener('click', () => {
            vscode.postMessage({ type: 'downloadLog' });
        });

        window.addEventListener('message', event => {
            const message = event.data;

            switch (message.type) {
                case 'updateLog':
                    updateLogContent(message.content, message.timestamp);
                    break;
                case 'error':
                    showError(message.message);
                    break;
                case 'followModeChanged':
                    followMode = message.enabled;
                    updateFollowButton();
                    break;
            }
        });

        function updateLogContent(content, timestamp) {
            const logElement = document.getElementById('logContent');
            const statusBar = document.getElementById('statusBar');

            if (!content || content.trim() === '') {
                logElement.className = 'log-content empty';
                logElement.textContent = 'Log file is empty or not found';
            } else {
                logElement.className = 'log-content';
                logElement.innerHTML = highlightLog(content);
                
                // Auto-scroll to bottom if following
                if (followMode) {
                    logElement.scrollTop = logElement.scrollHeight;
                }
            }

            statusBar.textContent = \`Last updated: \${timestamp}\`;
        }

        function highlightLog(content) {
            return content
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .split('\\n')
                .map(line => {
                    if (line.toLowerCase().includes('error') || line.toLowerCase().includes('exception')) {
                        return \`<span class="error-line">\${line}</span>\`;
                    } else if (line.toLowerCase().includes('warning') || line.toLowerCase().includes('warn')) {
                        return \`<span class="warning-line">\${line}</span>\`;
                    } else if (line.toLowerCase().includes('info') || line.toLowerCase().includes('starting')) {
                        return \`<span class="info-line">\${line}</span>\`;
                    }
                    return line;
                })
                .join('\\n');
        }

        function showError(message) {
            const logElement = document.getElementById('logContent');
            logElement.innerHTML = \`<div class="error">Error: \${message}</div>\`;
        }

        function updateFollowButton() {
            const btn = document.getElementById('followBtn');
            if (followMode) {
                btn.classList.add('active');
                btn.textContent = 'Following';
            } else {
                btn.classList.remove('active');
                btn.textContent = 'Follow';
            }
        }
    </script>
</body>
</html>`;
    }

    dispose(): void {
        this.stopFollowing();
        this.disposables.forEach(d => d.dispose());
        this.panel.dispose();
        this._onDidDispose.fire();
    }
}