import * as vscode from 'vscode';
import { SSHManager } from './sshManager';

export interface LibraryInfo {
    name: string;
    version: string;
    location: string;
    description?: string;
}

export class LibraryManager {
    private panel: vscode.WebviewPanel | undefined;
    private disposables: vscode.Disposable[] = [];

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
            'seraphLibraries',
            'Installed Libraries',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        this.panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.type) {
                    case 'refresh':
                        await this.loadLibraries();
                        break;
                    case 'installPackage':
                        await this.installPackage(message.packageName);
                        break;
                    case 'uninstallPackage':
                        await this.uninstallPackage(message.packageName);
                        break;
                }
            },
            undefined,
            this.disposables
        );

        this.panel.onDidDispose(() => {
            this.dispose();
        }, null, this.disposables);

        this.loadLibraries();
    }

    private async loadLibraries(): Promise<void> {
        if (!this.panel || !this.sshManager.isConnected()) {
            return;
        }

        try {
            // Get Python packages
            const pipResult = await this.sshManager.executeCommand('pip list --format=json');
            const condaResult = await this.sshManager.executeCommand('conda list --json');

            let pipPackages: any[] = [];
            let condaPackages: any[] = [];

            if (pipResult.code === 0) {
                pipPackages = JSON.parse(pipResult.stdout);
            }

            if (condaResult.code === 0) {
                condaPackages = JSON.parse(condaResult.stdout);
            }

            this.panel.webview.html = this.getWebviewContent(pipPackages, condaPackages);
        } catch (error) {
            this.panel.webview.html = this.getErrorContent(`Failed to load libraries: ${error}`);
        }
    }

    private async installPackage(packageName: string): Promise<void> {
        if (!this.sshManager.isConnected()) {
            vscode.window.showErrorMessage('Not connected to server');
            return;
        }

        try {
            const result = await this.sshManager.executeCommand(`pip install ${packageName}`);
            if (result.code === 0) {
                vscode.window.showInformationMessage(`Successfully installed ${packageName}`);
                await this.loadLibraries();
            } else {
                vscode.window.showErrorMessage(`Failed to install ${packageName}: ${result.stderr}`);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to install ${packageName}: ${error}`);
        }
    }

    private async uninstallPackage(packageName: string): Promise<void> {
        if (!this.sshManager.isConnected()) {
            vscode.window.showErrorMessage('Not connected to server');
            return;
        }

        try {
            const result = await this.sshManager.executeCommand(`pip uninstall ${packageName} -y`);
            if (result.code === 0) {
                vscode.window.showInformationMessage(`Successfully uninstalled ${packageName}`);
                await this.loadLibraries();
            } else {
                vscode.window.showErrorMessage(`Failed to uninstall ${packageName}: ${result.stderr}`);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to uninstall ${packageName}: ${error}`);
        }
    }

    private getWebviewContent(pipPackages: any[], condaPackages: any[]): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Installed Libraries</title>
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
        }

        .btn:hover {
            background-color: var(--vscode-button-hoverBackground);
        }

        .btn.danger {
            background-color: var(--vscode-inputValidation-errorBackground);
            color: var(--vscode-inputValidation-errorForeground);
        }

        .search-container {
            margin-bottom: 20px;
        }

        .search-input {
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            padding: 8px 12px;
            border-radius: 4px;
            width: 100%;
            font-size: 14px;
        }

        .tabs {
            display: flex;
            margin-bottom: 20px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }

        .tab {
            padding: 10px 20px;
            cursor: pointer;
            border-bottom: 2px solid transparent;
            transition: all 0.2s ease;
        }

        .tab.active {
            border-bottom-color: var(--vscode-focusBorder);
            background-color: var(--vscode-tab-activeBackground);
        }

        .tab-content {
            display: none;
        }

        .tab-content.active {
            display: block;
        }

        .package-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 15px;
        }

        .package-card {
            background-color: var(--vscode-panel-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            padding: 15px;
        }

        .package-name {
            font-weight: bold;
            font-size: 16px;
            margin-bottom: 5px;
            color: var(--vscode-titleBar-activeForeground);
        }

        .package-version {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 10px;
        }

        .package-actions {
            display: flex;
            gap: 8px;
        }

        .btn-small {
            padding: 4px 8px;
            font-size: 12px;
        }

        .install-section {
            background-color: var(--vscode-panel-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 20px;
        }

        .install-form {
            display: flex;
            gap: 10px;
            align-items: center;
        }

        .install-input {
            flex: 1;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            padding: 8px 12px;
            border-radius: 4px;
        }

        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin-bottom: 20px;
        }

        .stat-card {
            background-color: var(--vscode-panel-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            padding: 15px;
            text-align: center;
        }

        .stat-number {
            font-size: 24px;
            font-weight: bold;
            color: var(--vscode-button-background);
        }

        .stat-label {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin-top: 5px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>📦 Installed Libraries</h1>
        <button class="btn" onclick="refreshLibraries()">🔄 Refresh</button>
    </div>

    <div class="stats">
        <div class="stat-card">
            <div class="stat-number">${pipPackages.length}</div>
            <div class="stat-label">Pip Packages</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${condaPackages.length}</div>
            <div class="stat-label">Conda Packages</div>
        </div>
    </div>

    <div class="install-section">
        <h3>Install New Package</h3>
        <div class="install-form">
            <input type="text" class="install-input" id="packageInput" placeholder="Enter package name (e.g., torch, numpy, pandas)">
            <button class="btn" onclick="installPackage()">📦 Install</button>
        </div>
    </div>

    <div class="tabs">
        <div class="tab active" onclick="switchTab('pip')">Pip Packages</div>
        <div class="tab" onclick="switchTab('conda')">Conda Packages</div>
    </div>

    <div class="search-container">
        <input type="text" class="search-input" id="searchInput" placeholder="Search packages..." onkeyup="filterPackages()">
    </div>

    <div class="tab-content active" id="pip-content">
        <div class="package-grid" id="pip-packages">
            ${this.generatePackageCards(pipPackages, 'pip')}
        </div>
    </div>

    <div class="tab-content" id="conda-content">
        <div class="package-grid" id="conda-packages">
            ${this.generatePackageCards(condaPackages, 'conda')}
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let currentTab = 'pip';

        function switchTab(tab) {
            currentTab = tab;
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            
            event.target.classList.add('active');
            document.getElementById(tab + '-content').classList.add('active');
        }

        function refreshLibraries() {
            vscode.postMessage({ type: 'refresh' });
        }

        function installPackage() {
            const packageName = document.getElementById('packageInput').value.trim();
            if (!packageName) {
                alert('Please enter a package name');
                return;
            }
            
            vscode.postMessage({ type: 'installPackage', packageName });
            document.getElementById('packageInput').value = '';
        }

        function uninstallPackage(packageName) {
            if (confirm('Are you sure you want to uninstall ' + packageName + '?')) {
                vscode.postMessage({ type: 'uninstallPackage', packageName });
            }
        }

        function filterPackages() {
            const searchTerm = document.getElementById('searchInput').value.toLowerCase();
            const packages = document.querySelectorAll('.package-card');
            
            packages.forEach(package => {
                const name = package.querySelector('.package-name').textContent.toLowerCase();
                if (name.includes(searchTerm)) {
                    package.style.display = 'block';
                } else {
                    package.style.display = 'none';
                }
            });
        }

        // Allow Enter key to install package
        document.getElementById('packageInput').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                installPackage();
            }
        });
    </script>
</body>
</html>`;
    }

    private generatePackageCards(packages: any[], type: string): string {
        if (packages.length === 0) {
            return '<div style="text-align: center; padding: 40px; color: var(--vscode-descriptionForeground);">No packages found</div>';
        }

        return packages.map(pkg => {
            const name = pkg.name || pkg.name;
            const version = pkg.version || pkg.version || 'Unknown';
            
            return `
                <div class="package-card">
                    <div class="package-name">${name}</div>
                    <div class="package-version">v${version}</div>
                    <div class="package-actions">
                        <button class="btn btn-small danger" onclick="uninstallPackage('${name}')">🗑️ Uninstall</button>
                    </div>
                </div>
            `;
        }).join('');
    }

    private getErrorContent(message: string): string {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body {
                        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                        background-color: var(--vscode-editor-background);
                        color: var(--vscode-editor-foreground);
                        padding: 40px;
                        text-align: center;
                    }
                    .error {
                        background-color: var(--vscode-inputValidation-errorBackground);
                        border: 1px solid var(--vscode-inputValidation-errorBorder);
                        color: var(--vscode-inputValidation-errorForeground);
                        padding: 20px;
                        border-radius: 8px;
                        margin: 20px 0;
                    }
                </style>
            </head>
            <body>
                <h1>📦 Installed Libraries</h1>
                <div class="error">${message}</div>
                <button onclick="vscode.postMessage({type: 'refresh'})" style="
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 10px 20px;
                    border-radius: 4px;
                    cursor: pointer;
                ">🔄 Retry</button>
            </body>
            </html>
        `;
    }

    private dispose(): void {
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
        this.panel = undefined;
    }
}
