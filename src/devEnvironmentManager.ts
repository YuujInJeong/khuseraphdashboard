import * as vscode from 'vscode';
import { SSHManager } from './sshManager';

export interface EnvironmentTemplate {
    name: string;
    description: string;
    pythonVersion: string;
    packages: string[];
    condaEnv: boolean;
}

export class DevEnvironmentManager {
    private panel: vscode.WebviewPanel | undefined;
    private disposables: vscode.Disposable[] = [];

    private templates: EnvironmentTemplate[] = [
        {
            name: 'Deep Learning (PyTorch)',
            description: 'PyTorch 기반 딥러닝 환경',
            pythonVersion: '3.8',
            packages: ['torch', 'torchvision', 'torchaudio', 'numpy', 'pandas', 'matplotlib', 'jupyter'],
            condaEnv: true
        },
        {
            name: 'Deep Learning (TensorFlow)',
            description: 'TensorFlow 기반 딥러닝 환경',
            pythonVersion: '3.8',
            packages: ['tensorflow', 'tensorflow-gpu', 'numpy', 'pandas', 'matplotlib', 'jupyter'],
            condaEnv: true
        },
        {
            name: 'Data Science',
            description: '데이터 분석 및 시각화 환경',
            pythonVersion: '3.8',
            packages: ['numpy', 'pandas', 'matplotlib', 'seaborn', 'scikit-learn', 'jupyter', 'plotly'],
            condaEnv: true
        },
        {
            name: 'Computer Vision',
            description: '컴퓨터 비전 및 이미지 처리',
            pythonVersion: '3.8',
            packages: ['opencv-python', 'pillow', 'scikit-image', 'torch', 'torchvision', 'albumentations'],
            condaEnv: true
        },
        {
            name: 'NLP (Natural Language Processing)',
            description: '자연어 처리 환경',
            pythonVersion: '3.8',
            packages: ['transformers', 'torch', 'nltk', 'spacy', 'datasets', 'tokenizers'],
            condaEnv: true
        },
        {
            name: 'Custom Environment',
            description: '사용자 정의 환경',
            pythonVersion: '3.8',
            packages: [],
            condaEnv: true
        }
    ];

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
            'seraphDevEnvironment',
            'Development Environment Setup',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        this.panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.type) {
                    case 'createEnvironment':
                        await this.createEnvironment(message.template, message.envName);
                        break;
                    case 'listEnvironments':
                        await this.listEnvironments();
                        break;
                    case 'deleteEnvironment':
                        await this.deleteEnvironment(message.envName);
                        break;
                }
            },
            undefined,
            this.disposables
        );

        this.panel.onDidDispose(() => {
            this.dispose();
        }, null, this.disposables);

        this.loadContent();
    }

    private loadContent(): void {
        if (!this.panel) return;
        this.panel.webview.html = this.getWebviewContent();
    }

    private async createEnvironment(template: EnvironmentTemplate, envName: string): Promise<void> {
        if (!this.sshManager.isConnected()) {
            vscode.window.showErrorMessage('Not connected to server');
            return;
        }

        try {
            vscode.window.showInformationMessage(`Creating environment: ${envName}...`);

            // Create conda environment
            const createCmd = `conda create -n ${envName} python=${template.pythonVersion} -y`;
            const createResult = await this.sshManager.executeCommand(createCmd);
            
            if (createResult.code !== 0) {
                throw new Error(`Failed to create conda environment: ${createResult.stderr}`);
            }

            // Install packages
            if (template.packages.length > 0) {
                const packagesStr = template.packages.join(' ');
                const installCmd = `conda run -n ${envName} pip install ${packagesStr}`;
                const installResult = await this.sshManager.executeCommand(installCmd);
                
                if (installResult.code !== 0) {
                    vscode.window.showWarningMessage(`Environment created but some packages failed to install: ${installResult.stderr}`);
                }
            }

            vscode.window.showInformationMessage(`Successfully created environment: ${envName}`);
            await this.listEnvironments();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to create environment: ${error}`);
        }
    }

    private async listEnvironments(): Promise<void> {
        if (!this.sshManager.isConnected()) {
            return;
        }

        try {
            const result = await this.sshManager.executeCommand('conda env list --json');
            if (result.code === 0) {
                const environments = JSON.parse(result.stdout);
                this.panel?.webview.postMessage({
                    type: 'environmentsList',
                    environments: environments.envs || []
                });
            }
        } catch (error) {
            console.error('Failed to list environments:', error);
        }
    }

    private async deleteEnvironment(envName: string): Promise<void> {
        if (!this.sshManager.isConnected()) {
            vscode.window.showErrorMessage('Not connected to server');
            return;
        }

        try {
            const result = await this.sshManager.executeCommand(`conda env remove -n ${envName} -y`);
            if (result.code === 0) {
                vscode.window.showInformationMessage(`Successfully deleted environment: ${envName}`);
                await this.listEnvironments();
            } else {
                vscode.window.showErrorMessage(`Failed to delete environment: ${result.stderr}`);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to delete environment: ${error}`);
        }
    }

    private getWebviewContent(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Development Environment Setup</title>
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

        .btn.secondary {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }

        .section {
            background-color: var(--vscode-panel-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 20px;
        }

        .section-title {
            font-size: 18px;
            font-weight: bold;
            margin-bottom: 15px;
            color: var(--vscode-titleBar-activeForeground);
        }

        .template-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 15px;
        }

        .template-card {
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            padding: 15px;
            cursor: pointer;
            transition: all 0.3s ease;
        }

        .template-card:hover {
            border-color: var(--vscode-focusBorder);
            background-color: var(--vscode-list-hoverBackground);
        }

        .template-card.selected {
            border-color: var(--vscode-button-background);
            background-color: var(--vscode-list-activeSelectionBackground);
        }

        .template-name {
            font-weight: bold;
            font-size: 16px;
            margin-bottom: 5px;
        }

        .template-description {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 10px;
        }

        .template-packages {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }

        .form-group {
            margin-bottom: 15px;
        }

        .form-label {
            display: block;
            margin-bottom: 5px;
            font-weight: 600;
        }

        .form-input {
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            padding: 8px 12px;
            border-radius: 4px;
            width: 100%;
            font-size: 14px;
        }

        .form-input:focus {
            border-color: var(--vscode-focusBorder);
            outline: none;
        }

        .environment-list {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
            gap: 10px;
        }

        .environment-item {
            background-color: var(--vscode-list-inactiveSelectionBackground);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            padding: 10px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .environment-name {
            font-weight: 600;
        }

        .environment-actions {
            display: flex;
            gap: 5px;
        }

        .btn-small {
            padding: 4px 8px;
            font-size: 11px;
        }

        .loading {
            text-align: center;
            padding: 40px;
            color: var(--vscode-descriptionForeground);
        }

        .empty-state {
            text-align: center;
            padding: 40px;
            color: var(--vscode-descriptionForeground);
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🔧 Development Environment Setup</h1>
        <button class="btn" onclick="refreshEnvironments()">🔄 Refresh</button>
    </div>

    <!-- Create New Environment -->
    <div class="section">
        <h2 class="section-title">Create New Environment</h2>
        
        <div class="form-group">
            <label class="form-label">Environment Name</label>
            <input type="text" class="form-input" id="envName" placeholder="my-project-env">
        </div>

        <div class="form-group">
            <label class="form-label">Select Template</label>
            <div class="template-grid" id="templateGrid">
                ${this.generateTemplateCards()}
            </div>
        </div>

        <button class="btn" onclick="createEnvironment()" id="createBtn" disabled>🚀 Create Environment</button>
    </div>

    <!-- Existing Environments -->
    <div class="section">
        <h2 class="section-title">Existing Environments</h2>
        <div id="environmentsList" class="loading">Loading environments...</div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let selectedTemplate = null;
        let environments = [];

        function selectTemplate(templateName) {
            selectedTemplate = templateName;
            document.querySelectorAll('.template-card').forEach(card => {
                card.classList.remove('selected');
            });
            event.target.closest('.template-card').classList.add('selected');
            
            document.getElementById('createBtn').disabled = false;
        }

        function createEnvironment() {
            const envName = document.getElementById('envName').value.trim();
            if (!envName) {
                alert('Please enter environment name');
                return;
            }
            
            if (!selectedTemplate) {
                alert('Please select a template');
                return;
            }

            const template = ${JSON.stringify(this.templates)}.find(t => t.name === selectedTemplate);
            if (!template) {
                alert('Template not found');
                return;
            }

            vscode.postMessage({
                type: 'createEnvironment',
                template: template,
                envName: envName
            });

            // Reset form
            document.getElementById('envName').value = '';
            selectedTemplate = null;
            document.querySelectorAll('.template-card').forEach(card => {
                card.classList.remove('selected');
            });
            document.getElementById('createBtn').disabled = true;
        }

        function deleteEnvironment(envName) {
            if (confirm('Are you sure you want to delete environment: ' + envName + '?')) {
                vscode.postMessage({
                    type: 'deleteEnvironment',
                    envName: envName
                });
            }
        }

        function refreshEnvironments() {
            vscode.postMessage({ type: 'listEnvironments' });
        }

        // Listen for messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            
            switch (message.type) {
                case 'environmentsList':
                    environments = message.environments;
                    updateEnvironmentsList();
                    break;
            }
        });

        function updateEnvironmentsList() {
            const container = document.getElementById('environmentsList');
            
            if (environments.length === 0) {
                container.innerHTML = '<div class="empty-state">No environments found</div>';
                return;
            }

            const html = environments.map(env => {
                const envName = env.split('/').pop() || env;
                return \`
                    <div class="environment-item">
                        <span class="environment-name">\${envName}</span>
                        <div class="environment-actions">
                            <button class="btn btn-small danger" onclick="deleteEnvironment('\${envName}')">🗑️ Delete</button>
                        </div>
                    </div>
                \`;
            }).join('');

            container.innerHTML = \`<div class="environment-list">\${html}</div>\`;
        }

        // Load environments on startup
        refreshEnvironments();
    </script>
</body>
</html>`;
    }

    private generateTemplateCards(): string {
        return this.templates.map(template => `
            <div class="template-card" onclick="selectTemplate('${template.name}')">
                <div class="template-name">${template.name}</div>
                <div class="template-description">${template.description}</div>
                <div class="template-packages">
                    <strong>Packages:</strong> ${template.packages.join(', ')}
                </div>
            </div>
        `).join('');
    }

    private dispose(): void {
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
        this.panel = undefined;
    }
}
