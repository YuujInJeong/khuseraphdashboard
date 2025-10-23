import * as vscode from 'vscode';
import { SSHManager } from './sshManager';

export interface RemoteFile {
    name: string;
    path: string;
    isDirectory: boolean;
    size?: number;
    modified?: Date;
}

export class FileExplorer {
    private panel: vscode.WebviewPanel | undefined;
    private disposables: vscode.Disposable[] = [];
    private currentPath: string = '';

    constructor(
        private context: vscode.ExtensionContext,
        private sshManager: SSHManager
    ) {}

    public show(): void {
        if (this.panel) {
            this.panel.reveal();
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'seraphFileExplorer',
            'Seraph File Explorer',
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

        // Load initial directory
        this.loadDirectory('/');
    }

    private async handleMessage(message: any): Promise<void> {
        switch (message.type) {
            case 'navigate':
                await this.loadDirectory(message.path);
                break;
            case 'refresh':
                await this.loadDirectory(this.currentPath);
                break;
            case 'upload':
                await this.uploadFile(message.localPath, message.remotePath);
                break;
            case 'download':
                await this.downloadFile(message.remotePath, message.localPath);
                break;
            case 'delete':
                await this.deleteFile(message.path);
                break;
        }
    }

    private async loadDirectory(path: string): Promise<void> {
        if (!this.sshManager.isConnected()) {
            this.panel?.webview.postMessage({
                type: 'error',
                message: 'Not connected to server'
            });
            return;
        }

        try {
            this.currentPath = path;
            
            // List directory contents
            const result = await this.sshManager.executeCommand(`ls -la "${path}"`);
            
            if (result.code !== 0) {
                throw new Error(`Failed to list directory: ${result.stderr}`);
            }

            const files = this.parseDirectoryListing(result.stdout, path);
            
            this.panel?.webview.postMessage({
                type: 'updateDirectory',
                path: path,
                files: files
            });

        } catch (error) {
            this.panel?.webview.postMessage({
                type: 'error',
                message: `Failed to load directory: ${error}`
            });
        }
    }

    private parseDirectoryListing(output: string, basePath: string): RemoteFile[] {
        const lines = output.split('\n').filter(line => line.trim());
        const files: RemoteFile[] = [];

        for (const line of lines) {
            // Skip total line and hidden files starting with .
            if (line.startsWith('total') || line.includes('..')) {
                continue;
            }

            const parts = line.trim().split(/\s+/);
            if (parts.length >= 9) {
                const permissions = parts[0];
                const size = parts[4];
                const date = parts[5] + ' ' + parts[6] + ' ' + parts[7];
                const name = parts.slice(8).join(' ');

                // Skip current directory
                if (name === '.') {
                    continue;
                }

                const isDirectory = permissions.startsWith('d');
                const fullPath = basePath === '/' ? `/${name}` : `${basePath}/${name}`;

                files.push({
                    name: name,
                    path: fullPath,
                    isDirectory: isDirectory,
                    size: isDirectory ? undefined : parseInt(size),
                    modified: new Date(date)
                });
            }
        }

        // Sort: directories first, then files
        return files.sort((a, b) => {
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;
            return a.name.localeCompare(b.name);
        });
    }

    private async uploadFile(localPath: string, remotePath: string): Promise<void> {
        // This would be implemented using the file sync manager
        this.panel?.webview.postMessage({
            type: 'uploadResult',
            success: true,
            message: `Uploaded ${localPath} to ${remotePath}`
        });
    }

    private async downloadFile(remotePath: string, localPath: string): Promise<void> {
        // This would be implemented using the file sync manager
        this.panel?.webview.postMessage({
            type: 'downloadResult',
            success: true,
            message: `Downloaded ${remotePath} to ${localPath}`
        });
    }

    private async deleteFile(path: string): Promise<void> {
        try {
            const result = await this.sshManager.executeCommand(`rm -rf "${path}"`);
            
            if (result.code === 0) {
                this.panel?.webview.postMessage({
                    type: 'deleteResult',
                    success: true,
                    message: `Deleted ${path}`
                });
                // Refresh current directory
                await this.loadDirectory(this.currentPath);
            } else {
                throw new Error(result.stderr);
            }
        } catch (error) {
            this.panel?.webview.postMessage({
                type: 'deleteResult',
                success: false,
                message: `Failed to delete ${path}: ${error}`
            });
        }
    }

    private getWebviewContent(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Seraph File Explorer</title>
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
            height: 100vh;
            display: flex;
            flex-direction: column;
        }

        .header {
            background-color: var(--vscode-titleBar-activeBackground);
            color: var(--vscode-titleBar-activeForeground);
            padding: 12px 20px;
            border-bottom: 1px solid var(--vscode-panel-border);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .header h1 {
            font-size: 18px;
            font-weight: 600;
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

        .breadcrumb {
            background-color: var(--vscode-panel-background);
            padding: 10px 20px;
            border-bottom: 1px solid var(--vscode-panel-border);
            font-size: 14px;
        }

        .breadcrumb-item {
            color: var(--vscode-textLink-foreground);
            cursor: pointer;
            text-decoration: none;
        }

        .breadcrumb-item:hover {
            text-decoration: underline;
        }

        .file-list {
            flex: 1;
            overflow-y: auto;
            padding: 10px;
        }

        .file-item {
            display: flex;
            align-items: center;
            padding: 8px 12px;
            cursor: pointer;
            border-radius: 4px;
            margin-bottom: 2px;
        }

        .file-item:hover {
            background-color: var(--vscode-list-hoverBackground);
        }

        .file-icon {
            margin-right: 10px;
            font-size: 16px;
        }

        .file-name {
            flex: 1;
            font-size: 14px;
        }

        .file-size {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin-right: 20px;
            min-width: 80px;
            text-align: right;
        }

        .file-date {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            min-width: 120px;
        }

        .file-actions {
            display: flex;
            gap: 5px;
            opacity: 0;
            transition: opacity 0.2s;
        }

        .file-item:hover .file-actions {
            opacity: 1;
        }

        .action-btn {
            background: none;
            border: none;
            color: var(--vscode-button-foreground);
            cursor: pointer;
            padding: 4px;
            border-radius: 2px;
            font-size: 12px;
        }

        .action-btn:hover {
            background-color: var(--vscode-button-hoverBackground);
        }

        .error-message {
            background-color: var(--vscode-inputValidation-errorBackground);
            border: 1px solid var(--vscode-inputValidation-errorBorder);
            color: var(--vscode-inputValidation-errorForeground);
            padding: 15px;
            border-radius: 4px;
            margin: 20px;
        }

        .loading {
            text-align: center;
            padding: 40px;
            color: var(--vscode-descriptionForeground);
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
        <h1>📁 Seraph File Explorer</h1>
        <div class="controls">
            <button class="btn" onclick="refresh()">🔄 Refresh</button>
            <button class="btn" onclick="goHome()">🏠 Home</button>
        </div>
    </div>

    <div class="breadcrumb" id="breadcrumb">
        <span class="breadcrumb-item" onclick="navigateTo('/')">/</span>
    </div>

    <div class="file-list" id="fileList">
        <div class="loading">Loading directory...</div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let currentPath = '/';

        function navigateTo(path) {
            currentPath = path;
            vscode.postMessage({ type: 'navigate', path: path });
        }

        function refresh() {
            vscode.postMessage({ type: 'refresh' });
        }

        function goHome() {
            navigateTo('/');
        }

        function downloadFile(path) {
            // For now, just show a message
            alert('Download functionality will be implemented');
        }

        function deleteFile(path) {
            if (confirm('Are you sure you want to delete this file/folder?')) {
                vscode.postMessage({ type: 'delete', path: path });
            }
        }

        function getFileIcon(file) {
            if (file.isDirectory) {
                return '📁';
            }
            
            const ext = file.name.split('.').pop().toLowerCase();
            switch (ext) {
                case 'py': return '🐍';
                case 'js': case 'ts': return '📜';
                case 'json': return '📋';
                case 'md': return '📝';
                case 'txt': return '📄';
                case 'jpg': case 'jpeg': case 'png': case 'gif': return '🖼️';
                case 'zip': case 'tar': case 'gz': return '📦';
                default: return '📄';
            }
        }

        function formatFileSize(size) {
            if (!size) return '';
            if (size < 1024) return size + ' B';
            if (size < 1024 * 1024) return (size / 1024).toFixed(1) + ' KB';
            return (size / (1024 * 1024)).toFixed(1) + ' MB';
        }

        function formatDate(date) {
            if (!date) return '';
            return new Date(date).toLocaleDateString() + ' ' + new Date(date).toLocaleTimeString();
        }

        function updateBreadcrumb(path) {
            const breadcrumb = document.getElementById('breadcrumb');
            const parts = path.split('/').filter(p => p);
            
            let html = '<span class="breadcrumb-item" onclick="navigateTo(\'/\')">/</span>';
            
            let currentPath = '';
            parts.forEach(part => {
                currentPath += '/' + part;
                html += ' / <span class="breadcrumb-item" onclick="navigateTo(\'' + currentPath + '\')">' + part + '</span>';
            });
            
            breadcrumb.innerHTML = html;
        }

        function renderFileList(files) {
            const fileList = document.getElementById('fileList');
            
            if (files.length === 0) {
                fileList.innerHTML = '<div class="empty-state">This directory is empty</div>';
                return;
            }

            let html = '';
            files.forEach(file => {
                const icon = getFileIcon(file);
                const size = formatFileSize(file.size);
                const date = formatDate(file.modified);
                
                html += \`
                    <div class="file-item" onclick="\${file.isDirectory ? 'navigateTo(\\'' + file.path + '\\')' : 'downloadFile(\\'' + file.path + '\\')'}">
                        <div class="file-icon">\${icon}</div>
                        <div class="file-name">\${file.name}</div>
                        <div class="file-size">\${size}</div>
                        <div class="file-date">\${date}</div>
                        <div class="file-actions">
                            \${!file.isDirectory ? '<button class="action-btn" onclick="event.stopPropagation(); downloadFile(\\'' + file.path + '\\')" title="Download">⬇️</button>' : ''}
                            <button class="action-btn" onclick="event.stopPropagation(); deleteFile(\\'' + file.path + '\\')" title="Delete">🗑️</button>
                        </div>
                    </div>
                \`;
            });
            
            fileList.innerHTML = html;
        }

        // Message handling
        window.addEventListener('message', event => {
            const message = event.data;

            switch (message.type) {
                case 'updateDirectory':
                    currentPath = message.path;
                    updateBreadcrumb(message.path);
                    renderFileList(message.files);
                    break;
                case 'error':
                    document.getElementById('fileList').innerHTML = \`
                        <div class="error-message">\${message.message}</div>
                    \`;
                    break;
                case 'uploadResult':
                case 'downloadResult':
                case 'deleteResult':
                    alert(message.message);
                    if (message.success) {
                        refresh();
                    }
                    break;
            }
        });
    </script>
</body>
</html>`;
    }

    private dispose(): void {
        this.disposables.forEach(d => d.dispose());
        this.panel = undefined;
    }
}
