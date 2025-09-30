import * as vscode from 'vscode';
import { SSHManager, ConnectionStatus } from './sshManager';
import { GPUManager, GPUStatus } from './gpuManager';
import { JobManager, JobInfo } from './jobManager';
import { FileSyncManager, SyncDirection } from './fileSyncManager';
import { DatasetManager } from './datasetManager';

export class MainDashboard {
    private panel: vscode.WebviewPanel | undefined;
    private disposables: vscode.Disposable[] = [];
    private autoRefreshInterval: NodeJS.Timer | undefined;

    constructor(
        private context: vscode.ExtensionContext,
        private sshManager: SSHManager,
        private gpuManager: GPUManager,
        private jobManager: JobManager,
        private fileSyncManager: FileSyncManager,
        private datasetManager: DatasetManager
    ) {}

    public show(): void {
        if (this.panel) {
            this.panel.reveal();
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'seraphMainDashboard',
            'Seraph Manager Dashboard',
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

        // Start with connection status update
        this.updateConnectionStatus();
        
        // Set up auto refresh if connected
        if (this.sshManager.isConnected()) {
            this.startAutoRefresh();
            this.loadAllData();
        }

        // Listen to connection changes
        this.sshManager.onStatusChanged(status => {
            this.updateConnectionStatus();
            if (status === ConnectionStatus.Connected) {
                this.startAutoRefresh();
                this.loadAllData();
            } else {
                this.stopAutoRefresh();
            }
        });
    }

    private async handleMessage(message: any): Promise<void> {
        switch (message.type) {
            // Connection
            case 'toggleConnection':
                await this.sshManager.toggleConnection();
                break;
            case 'configureConnection':
                await vscode.commands.executeCommand('seraph.configureConnection');
                break;

            // Navigation
            case 'switchTab':
                await this.switchTab(message.tab);
                break;

            // GPU
            case 'refreshGPU':
                await this.loadGPUData();
                break;
            case 'selectGPU':
                const config = vscode.workspace.getConfiguration('seraph');
                await config.update('selectedGPU', message.node, vscode.ConfigurationTarget.Workspace);
                await this.loadGPUData(); // Refresh to show selection
                break;
            case 'toggleAutoRefresh':
                this.toggleAutoRefresh();
                break;

            // Jobs
            case 'refreshJobs':
                await this.loadJobData();
                break;
            case 'submitJob':
                await this.submitJobFromDashboard(message.jobData);
                break;
            case 'showJobForm':
                this.showJobSubmissionForm();
                break;
            case 'viewJobLog':
                // Will implement job log in dashboard later
                break;
            case 'cancelJob':
                await this.jobManager.cancelJob(message.jobId);
                await this.loadJobData();
                break;

            // File Sync
            case 'syncFiles':
                await this.performSync(message.direction, message.options);
                break;

            // Datasets
            case 'refreshDatasets':
                await this.loadDatasetData();
                break;
            case 'extractDataset':
                // Will handle dataset operations
                break;
            case 'deleteDataset':
                // Will handle dataset deletion
                break;
        }
    }

    private async switchTab(tabName: string): Promise<void> {
        this.panel?.webview.postMessage({
            type: 'switchedTab',
            tab: tabName
        });

        // Load data for the selected tab
        switch (tabName) {
            case 'gpu':
                await this.loadGPUData();
                break;
            case 'jobs':
                await this.loadJobData();
                break;
            case 'sync':
                // File sync doesn't need data loading
                break;
            case 'datasets':
                await this.loadDatasetData();
                break;
        }
    }

    private async loadAllData(): Promise<void> {
        await Promise.all([
            this.loadGPUData(),
            this.loadJobData(),
            this.loadDatasetData()
        ]);
    }

    private async loadGPUData(): Promise<void> {
        if (!this.sshManager.isConnected()) return;

        try {
            const gpuStatus = await this.gpuManager.getGPUStatus();
            const config = vscode.workspace.getConfiguration('seraph');
            const selectedGPU = config.get<string>('selectedGPU', '');

            this.panel?.webview.postMessage({
                type: 'updateGPU',
                data: { ...gpuStatus, selectedGPU }
            });
        } catch (error) {
            this.panel?.webview.postMessage({
                type: 'error',
                section: 'gpu',
                message: `Failed to load GPU data: ${error}`
            });
        }
    }

    private async loadJobData(): Promise<void> {
        if (!this.sshManager.isConnected()) return;

        try {
            await this.jobManager.refreshJobs();
            const jobs = this.jobManager.getRunningJobs();

            this.panel?.webview.postMessage({
                type: 'updateJobs',
                data: jobs
            });
        } catch (error) {
            this.panel?.webview.postMessage({
                type: 'error',
                section: 'jobs',
                message: `Failed to load job data: ${error}`
            });
        }
    }

    private async loadDatasetData(): Promise<void> {
        if (!this.sshManager.isConnected()) return;

        try {
            // We'll need to expose dataset methods from DatasetManager
            this.panel?.webview.postMessage({
                type: 'updateDatasets',
                data: [] // Will implement dataset data loading
            });
        } catch (error) {
            this.panel?.webview.postMessage({
                type: 'error',
                section: 'datasets',
                message: `Failed to load dataset data: ${error}`
            });
        }
    }

    private updateConnectionStatus(): void {
        this.panel?.webview.postMessage({
            type: 'updateConnection',
            status: this.sshManager.status,
            isConnected: this.sshManager.isConnected()
        });
    }

    private async performSync(direction: SyncDirection, options: any): Promise<void> {
        try {
            this.panel?.webview.postMessage({
                type: 'syncStarted',
                direction
            });

            await this.fileSyncManager.syncFiles(direction, options);

            this.panel?.webview.postMessage({
                type: 'syncCompleted',
                direction
            });
        } catch (error) {
            this.panel?.webview.postMessage({
                type: 'syncFailed',
                direction,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }

    private startAutoRefresh(): void {
        if (this.autoRefreshInterval) return;

        this.autoRefreshInterval = setInterval(() => {
            if (this.sshManager.isConnected()) {
                this.loadGPUData();
                this.loadJobData();
            }
        }, 30000); // 30 seconds
    }

    private stopAutoRefresh(): void {
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
            this.autoRefreshInterval = undefined;
        }
    }

    private toggleAutoRefresh(): void {
        if (this.autoRefreshInterval) {
            this.stopAutoRefresh();
        } else {
            this.startAutoRefresh();
        }

        this.panel?.webview.postMessage({
            type: 'autoRefreshToggled',
            enabled: !!this.autoRefreshInterval
        });
    }

    private getWebviewContent(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Seraph Manager Dashboard</title>
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
            flex-shrink: 0;
        }

        .header h1 {
            font-size: 18px;
            font-weight: 600;
        }

        .connection-status {
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .status-indicator {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            display: inline-block;
        }

        .status-indicator.connected { background-color: #28a745; }
        .status-indicator.connecting { background-color: #ffc107; animation: pulse 1s infinite; }
        .status-indicator.disconnected { background-color: #6c757d; }
        .status-indicator.failed { background-color: #dc3545; }

        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
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

        .btn.secondary {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }

        .nav-tabs {
            background-color: var(--vscode-panel-background);
            border-bottom: 1px solid var(--vscode-panel-border);
            display: flex;
            flex-shrink: 0;
        }

        .nav-tab {
            padding: 12px 20px;
            cursor: pointer;
            border-bottom: 2px solid transparent;
            transition: all 0.2s ease;
            font-size: 14px;
        }

        .nav-tab:hover {
            background-color: var(--vscode-list-hoverBackground);
        }

        .nav-tab.active {
            border-bottom-color: var(--vscode-focusBorder);
            background-color: var(--vscode-tab-activeBackground);
            color: var(--vscode-tab-activeForeground);
        }

        .content {
            flex: 1;
            padding: 20px;
            overflow-y: auto;
        }

        .tab-panel {
            display: none;
        }

        .tab-panel.active {
            display: block;
        }

        .section-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
        }

        .section-title {
            font-size: 20px;
            font-weight: 600;
            color: var(--vscode-titleBar-activeForeground);
        }

        .card {
            background-color: var(--vscode-panel-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 20px;
        }

        .card-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
        }

        .card-title {
            font-size: 16px;
            font-weight: 600;
        }

        .grid {
            display: grid;
            gap: 20px;
        }

        .grid-2 {
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
        }

        .grid-3 {
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
        }

        .error-message {
            background-color: var(--vscode-inputValidation-errorBackground);
            border: 1px solid var(--vscode-inputValidation-errorBorder);
            color: var(--vscode-inputValidation-errorForeground);
            padding: 15px;
            border-radius: 4px;
            margin-bottom: 20px;
        }

        .empty-state {
            text-align: center;
            padding: 60px 20px;
            color: var(--vscode-descriptionForeground);
        }

        .loading {
            text-align: center;
            padding: 40px;
            color: var(--vscode-descriptionForeground);
        }

        /* GPU specific styles */
        .gpu-card {
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

        .gpu-status-bar {
            display: flex;
            gap: 2px;
            margin: 10px 0;
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

        /* Job specific styles */
        .job-item {
            padding: 12px;
            border-left: 4px solid transparent;
            margin-bottom: 8px;
            background-color: var(--vscode-list-inactiveSelectionBackground);
            border-radius: 0 4px 4px 0;
        }

        .job-item.running {
            border-left-color: #28a745;
        }

        .job-item.pending {
            border-left-color: #ffc107;
        }

        .job-item.failed {
            border-left-color: #dc3545;
        }

        .job-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 4px;
        }

        .job-name {
            font-weight: 600;
        }

        .job-id {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }

        .job-actions {
            display: flex;
            gap: 8px;
        }

        .btn-small {
            padding: 4px 8px;
            font-size: 11px;
        }

        /* Sync specific styles */
        .sync-option {
            padding: 15px;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.2s ease;
            margin-bottom: 10px;
        }

        .sync-option:hover {
            border-color: var(--vscode-focusBorder);
            background-color: var(--vscode-list-hoverBackground);
        }

        .sync-title {
            font-weight: 600;
            margin-bottom: 4px;
        }

        .sync-description {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }

        /* Form styles */
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

        label {
            color: var(--vscode-input-foreground);
        }

        small {
            display: block;
            margin-top: 4px;
            font-size: 11px;
        }

        /* Job status styles */
        .success-message {
            background-color: var(--vscode-testing-iconPassed);
            color: white;
            padding: 12px;
            border-radius: 4px;
            margin-bottom: 15px;
        }

        .error-message {
            background-color: var(--vscode-inputValidation-errorBackground);
            border: 1px solid var(--vscode-inputValidation-errorBorder);
            color: var(--vscode-inputValidation-errorForeground);
            padding: 12px;
            border-radius: 4px;
            margin-bottom: 15px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🚀 Seraph Manager</h1>
        <div class="connection-status">
            <span class="status-indicator disconnected" id="statusIndicator"></span>
            <span id="statusText">Not Connected</span>
            <button class="btn" id="toggleConnectionBtn" onclick="toggleConnection()">Connect</button>
            <button class="btn secondary" onclick="configureConnection()">Configure</button>
        </div>
    </div>

    <nav class="nav-tabs">
        <div class="nav-tab active" onclick="switchTab('overview')">Overview</div>
        <div class="nav-tab" onclick="switchTab('gpu')">GPU Monitor</div>
        <div class="nav-tab" onclick="switchTab('jobs')">Jobs</div>
        <div class="nav-tab" onclick="switchTab('sync')">File Sync</div>
        <div class="nav-tab" onclick="switchTab('datasets')">Datasets</div>
    </nav>

    <div class="content">
        <!-- Overview Tab -->
        <div class="tab-panel active" id="overview-panel">
            <div class="section-header">
                <h2 class="section-title">Dashboard Overview</h2>
                <button class="btn" onclick="refreshAll()" id="refreshAllBtn">Refresh All</button>
            </div>
            
            <div class="grid grid-2">
                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title">Connection Status</h3>
                    </div>
                    <div id="connectionSummary">
                        <div class="empty-state">Connect to server to see overview</div>
                    </div>
                </div>
                
                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title">Quick Actions</h3>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 10px;">
                        <button class="btn" onclick="switchTab('gpu')">View GPU Dashboard</button>
                        <button class="btn" onclick="submitJob()">Submit New Job</button>
                        <button class="btn" onclick="switchTab('sync')">Sync Files</button>
                        <button class="btn" onclick="switchTab('datasets')">Manage Datasets</button>
                    </div>
                </div>
            </div>
        </div>

        <!-- GPU Tab -->
        <div class="tab-panel" id="gpu-panel">
            <div class="section-header">
                <h2 class="section-title">GPU Monitor</h2>
                <div>
                    <button class="btn" onclick="toggleAutoRefresh()" id="autoRefreshBtn">Auto Refresh</button>
                    <button class="btn" onclick="refreshGPU()">Refresh</button>
                </div>
            </div>
            <div id="gpuContent">
                <div class="loading">Connect to server to view GPU status</div>
            </div>
        </div>

        <!-- Jobs Tab -->
        <div class="tab-panel" id="jobs-panel">
            <div class="section-header">
                <h2 class="section-title">🚀 Job Management</h2>
                <div>
                    <button class="btn" onclick="showJobForm()" id="newJobBtn">➕ New Job</button>
                    <button class="btn" onclick="refreshJobs()">🔄 Refresh</button>
                </div>
            </div>
            
            <!-- Job Submission Form -->
            <div class="card" id="jobForm" style="display: none;">
                <div class="card-header">
                    <h3 class="card-title">📝 Create New Job</h3>
                    <button class="btn secondary" onclick="hideJobForm()">✖ Cancel</button>
                </div>
                
                <form id="jobSubmissionForm" style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                    <div>
                        <label style="display: block; margin-bottom: 5px; font-weight: 600;">Job Name *</label>
                        <input type="text" id="jobName" class="form-input" placeholder="my-training-job" required>
                        <small style="color: var(--vscode-descriptionForeground);">Unique identifier for your job</small>
                    </div>
                    
                    <div>
                        <label style="display: block; margin-bottom: 5px; font-weight: 600;">Python Script Path *</label>
                        <input type="text" id="pythonScript" class="form-input" placeholder="/data/username/train.py" required>
                        <small style="color: var(--vscode-descriptionForeground);">Full path to your Python script</small>
                    </div>
                    
                    <div>
                        <label style="display: block; margin-bottom: 5px; font-weight: 600;">GPU Count</label>
                        <select id="gpuCount" class="form-input">
                            <option value="1">1 GPU</option>
                            <option value="2">2 GPUs</option>
                            <option value="4">4 GPUs</option>
                            <option value="8">8 GPUs</option>
                        </select>
                        <small style="color: var(--vscode-descriptionForeground);">Number of GPUs to use</small>
                    </div>
                    
                    <div>
                        <label style="display: block; margin-bottom: 5px; font-weight: 600;">GPU Node</label>
                        <select id="gpuNode" class="form-input">
                            <option value="">Auto-select</option>
                            <option value="aurora-g1">aurora-g1</option>
                            <option value="aurora-g2">aurora-g2</option>
                            <option value="aurora-g3">aurora-g3</option>
                            <option value="aurora-g4">aurora-g4</option>
                        </select>
                        <small style="color: var(--vscode-descriptionForeground);">Specific GPU node (or auto-select)</small>
                    </div>
                    
                    <div>
                        <label style="display: block; margin-bottom: 5px; font-weight: 600;">CPU Cores per GPU</label>
                        <select id="cpuPerGpu" class="form-input">
                            <option value="4">4 cores</option>
                            <option value="8" selected>8 cores</option>
                            <option value="16">16 cores</option>
                            <option value="32">32 cores</option>
                        </select>
                        <small style="color: var(--vscode-descriptionForeground);">CPU cores allocated per GPU</small>
                    </div>
                    
                    <div>
                        <label style="display: block; margin-bottom: 5px; font-weight: 600;">Memory per GPU</label>
                        <select id="memoryPerGpu" class="form-input">
                            <option value="16G">16 GB</option>
                            <option value="32G" selected>32 GB</option>
                            <option value="64G">64 GB</option>
                            <option value="128G">128 GB</option>
                        </select>
                        <small style="color: var(--vscode-descriptionForeground);">Memory allocated per GPU</small>
                    </div>
                    
                    <div>
                        <label style="display: block; margin-bottom: 5px; font-weight: 600;">Queue/Partition</label>
                        <select id="partition" class="form-input">
                            <option value="debug_ugrad">Debug (Quick test)</option>
                            <option value="batch_ugrad" selected>Batch (Normal)</option>
                            <option value="gpu_ugrad">GPU (High priority)</option>
                            <option value="cpu_ugrad">CPU only</option>
                        </select>
                        <small style="color: var(--vscode-descriptionForeground);">Which queue to submit to</small>
                    </div>
                    
                    <div>
                        <label style="display: block; margin-bottom: 5px; font-weight: 600;">Time Limit</label>
                        <input type="text" id="timeLimit" class="form-input" value="1-00:00:00" placeholder="D-HH:MM:SS">
                        <small style="color: var(--vscode-descriptionForeground);">Max runtime (Days-Hours:Minutes:Seconds)</small>
                    </div>
                    
                    <div style="grid-column: 1 / -1;">
                        <label style="display: block; margin-bottom: 5px; font-weight: 600;">Conda Environment (Optional)</label>
                        <input type="text" id="condaEnv" class="form-input" placeholder="pytorch-env">
                        <small style="color: var(--vscode-descriptionForeground);">Conda environment to activate before running</small>
                    </div>
                    
                    <div style="grid-column: 1 / -1; display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px;">
                        <button type="button" class="btn secondary" onclick="hideJobForm()">Cancel</button>
                        <button type="submit" class="btn">🚀 Submit Job</button>
                    </div>
                </form>
            </div>
            
            <!-- Job Status Message -->
            <div id="jobStatus" style="margin-bottom: 20px;"></div>
            
            <!-- Running Jobs -->
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">🏃‍♂️ Running Jobs</h3>
                </div>
                <div id="runningJobs">
                    <div class="loading">Connect to server to view jobs</div>
                </div>
            </div>
        </div>

        <!-- Sync Tab -->
        <div class="tab-panel" id="sync-panel">
            <div class="section-header">
                <h2 class="section-title">File Synchronization</h2>
            </div>
            
            <div class="grid grid-3">
                <div class="sync-option" onclick="syncFiles('upload')">
                    <div class="sync-title">📤 Upload (Local → Remote)</div>
                    <div class="sync-description">Upload your local changes to the server</div>
                </div>
                
                <div class="sync-option" onclick="syncFiles('download')">
                    <div class="sync-title">📥 Download (Remote → Local)</div>
                    <div class="sync-description">Download server changes to your local workspace</div>
                </div>
                
                <div class="sync-option" onclick="syncFiles('both')">
                    <div class="sync-title">🔄 Bidirectional Sync</div>
                    <div class="sync-description">Smart sync based on modification times</div>
                </div>
            </div>
            
            <div id="syncStatus" style="margin-top: 20px;"></div>
        </div>

        <!-- Datasets Tab -->
        <div class="tab-panel" id="datasets-panel">
            <div class="section-header">
                <h2 class="section-title">Dataset Management</h2>
                <button class="btn" onclick="refreshDatasets()">Refresh</button>
            </div>
            <div id="datasetsContent">
                <div class="loading">Connect to server to view datasets</div>
            </div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let currentTab = 'overview';
        let isConnected = false;
        let autoRefreshEnabled = false;

        // Navigation
        function switchTab(tabName) {
            // Update tab appearance
            document.querySelectorAll('.nav-tab').forEach(tab => tab.classList.remove('active'));
            document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));
            
            event.target.classList.add('active');
            document.getElementById(tabName + '-panel').classList.add('active');
            
            currentTab = tabName;
            
            // Notify extension
            vscode.postMessage({ type: 'switchTab', tab: tabName });
        }

        // Connection
        function toggleConnection() {
            vscode.postMessage({ type: 'toggleConnection' });
        }

        function configureConnection() {
            vscode.postMessage({ type: 'configureConnection' });
        }

        // GPU
        function refreshGPU() {
            vscode.postMessage({ type: 'refreshGPU' });
        }

        function selectGPU(nodeName) {
            vscode.postMessage({ type: 'selectGPU', node: nodeName });
        }

        function toggleAutoRefresh() {
            vscode.postMessage({ type: 'toggleAutoRefresh' });
        }

        // Jobs
        function refreshJobs() {
            vscode.postMessage({ type: 'refreshJobs' });
        }

        // Job form functions
        function showJobForm() {
            document.getElementById('jobForm').style.display = 'block';
            document.getElementById('newJobBtn').style.display = 'none';
        }

        function hideJobForm() {
            document.getElementById('jobForm').style.display = 'none';
            document.getElementById('newJobBtn').style.display = 'inline-block';
            document.getElementById('jobSubmissionForm').reset();
        }

        function submitJob() {
            vscode.postMessage({ type: 'showJobForm' });
        }

        // Handle form submission
        document.addEventListener('DOMContentLoaded', function() {
            const form = document.getElementById('jobSubmissionForm');
            if (form) {
                form.addEventListener('submit', function(e) {
                    e.preventDefault();
                    
                    const formData = new FormData(form);
                    const jobData = {
                        jobName: document.getElementById('jobName').value,
                        pythonScript: document.getElementById('pythonScript').value,
                        gpuCount: document.getElementById('gpuCount').value,
                        gpuNode: document.getElementById('gpuNode').value,
                        cpuPerGpu: document.getElementById('cpuPerGpu').value,
                        memoryPerGpu: document.getElementById('memoryPerGpu').value,
                        partition: document.getElementById('partition').value,
                        timeLimit: document.getElementById('timeLimit').value,
                        condaEnv: document.getElementById('condaEnv').value
                    };

                    // Validate required fields
                    if (!jobData.jobName || !jobData.pythonScript) {
                        showJobStatus('Please fill in all required fields', 'error');
                        return;
                    }

                    vscode.postMessage({ type: 'submitJob', jobData });
                    hideJobForm();
                });
            }
        });

        function cancelJob(jobId) {
            if (confirm('Are you sure you want to cancel this job?')) {
                vscode.postMessage({ type: 'cancelJob', jobId });
            }
        }

        // Sync
        function syncFiles(direction) {
            if (!isConnected) {
                alert('Please connect to server first');
                return;
            }
            
            vscode.postMessage({ 
                type: 'syncFiles', 
                direction,
                options: {} 
            });
        }

        // Datasets
        function refreshDatasets() {
            vscode.postMessage({ type: 'refreshDatasets' });
        }

        // Utility
        function refreshAll() {
            if (!isConnected) return;
            
            refreshGPU();
            refreshJobs();
            refreshDatasets();
        }

        // Message handling
        window.addEventListener('message', event => {
            const message = event.data;

            switch (message.type) {
                case 'updateConnection':
                    updateConnectionStatus(message.status, message.isConnected);
                    break;
                case 'updateGPU':
                    updateGPUDisplay(message.data);
                    break;
                case 'updateJobs':
                    updateJobsDisplay(message.data);
                    break;
                case 'jobSubmitted':
                    showJobStatus(
                        message.message, 
                        message.success ? 'success' : 'error'
                    );
                    if (message.success) {
                        refreshJobs();
                    }
                    break;
                case 'updateDatasets':
                    updateDatasetsDisplay(message.data);
                    break;
                case 'autoRefreshToggled':
                    autoRefreshEnabled = message.enabled;
                    updateAutoRefreshButton();
                    break;
                case 'syncStarted':
                    updateSyncStatus('Syncing...', 'info');
                    break;
                case 'syncCompleted':
                    updateSyncStatus('Sync completed successfully', 'success');
                    break;
                case 'syncFailed':
                    updateSyncStatus('Sync failed: ' + message.error, 'error');
                    break;
                case 'error':
                    showError(message.section, message.message);
                    break;
            }
        });

        function updateConnectionStatus(status, connected) {
            isConnected = connected;
            const indicator = document.getElementById('statusIndicator');
            const text = document.getElementById('statusText');
            const btn = document.getElementById('toggleConnectionBtn');

            indicator.className = 'status-indicator ' + status.toLowerCase().replace(' ', '');
            text.textContent = status;
            btn.textContent = connected ? 'Disconnect' : 'Connect';
            
            // Update refresh button state
            document.getElementById('refreshAllBtn').disabled = !connected;
        }

        function updateGPUDisplay(data) {
            const content = document.getElementById('gpuContent');
            
            if (!data.nodes || data.nodes.length === 0) {
                content.innerHTML = '<div class="empty-state">No GPU nodes found</div>';
                return;
            }

            let html = '<div class="grid grid-2">';
            
            data.nodes.forEach(node => {
                const isSelected = node.name === data.selectedGPU;
                const availability = node.availableGPUs + '/' + node.totalGPUs + ' available';
                
                html += \`
                    <div class="card gpu-card \${isSelected ? 'selected' : ''}" onclick="selectGPU('\${node.name}')">
                        <div class="card-header">
                            <h3 class="card-title">\${node.name}</h3>
                            <span style="font-size: 12px; color: var(--vscode-descriptionForeground);">\${availability}</span>
                        </div>
                        <div class="gpu-status-bar">
                            \${node.gpuStatus.map(status => \`
                                <div class="gpu-slot \${status === '-' ? 'available' : 'used'}">
                                    \${status === '-' ? '-' : '#'}
                                </div>
                            \`).join('')}
                        </div>
                        \${node.cpuUsage !== undefined ? \`
                            <div style="margin-top: 10px; font-size: 12px;">
                                CPU: \${node.cpuUsage}% | Memory: \${node.memoryUsage || 'N/A'}%
                            </div>
                        \` : ''}
                    </div>
                \`;
            });
            
            html += '</div>';
            content.innerHTML = html;
        }

        function updateJobsDisplay(jobs) {
            const content = document.getElementById('runningJobs');
            
            if (!jobs || jobs.length === 0) {
                content.innerHTML = '<div class="empty-state">No running jobs</div>';
                return;
            }

            let html = '<div>';
            
            jobs.forEach(job => {
                const statusIcon = getJobStatusIcon(job.status);
                html += \`
                    <div class="job-item \${job.status.toLowerCase()}">
                        <div class="job-header">
                            <div>
                                <span class="job-name">\${statusIcon} \${job.name}</span>
                                <span class="job-id">(ID: \${job.jobId})</span>
                            </div>
                            <div class="job-actions">
                                <button class="btn btn-small" onclick="viewJobLog('\${job.jobId}')">📋 Log</button>
                                <button class="btn btn-small" onclick="cancelJob('\${job.jobId}')">❌ Cancel</button>
                            </div>
                        </div>
                        <div style="font-size: 12px; color: var(--vscode-descriptionForeground);">
                            <strong>Status:</strong> \${job.status} | 
                            <strong>Node:</strong> \${job.gpuNode || 'N/A'} | 
                            <strong>Queue:</strong> \${job.partition} |
                            <strong>Time:</strong> \${job.timeLimit || 'N/A'}
                        </div>
                    </div>
                \`;
            });
            
            html += '</div>';
            content.innerHTML = html;
        }

        function getJobStatusIcon(status) {
            switch (status.toLowerCase()) {
                case 'running': return '🟢';
                case 'pending': return '🟡';
                case 'completed': return '✅';
                case 'failed': return '❌';
                case 'cancelled': return '⛔';
                default: return '⚪';
            }
        }

        function showJobStatus(message, type) {
            const statusDiv = document.getElementById('jobStatus');
            const className = type === 'success' ? 'success-message' : 'error-message';
            statusDiv.innerHTML = \`<div class="\${className}">\${message}</div>\`;
            
            // Clear message after 5 seconds
            setTimeout(() => {
                statusDiv.innerHTML = '';
            }, 5000);
        }

        function viewJobLog(jobId) {
            // For now, show a message. Will implement log viewer later
            showJobStatus(\`Opening log for job \${jobId}...\`, 'success');
        }

        function updateDatasetsDisplay(datasets) {
            const content = document.getElementById('datasetsContent');
            
            if (!datasets || datasets.length === 0) {
                content.innerHTML = '<div class="empty-state">No datasets found</div>';
                return;
            }

            // Will implement dataset display
            content.innerHTML = '<div class="empty-state">Dataset management coming soon</div>';
        }

        function updateAutoRefreshButton() {
            const btn = document.getElementById('autoRefreshBtn');
            btn.textContent = autoRefreshEnabled ? 'Auto Refresh ON' : 'Auto Refresh OFF';
            btn.classList.toggle('secondary', !autoRefreshEnabled);
        }

        function updateSyncStatus(message, type) {
            const status = document.getElementById('syncStatus');
            status.innerHTML = \`<div class="card" style="border-left: 4px solid \${type === 'error' ? '#dc3545' : type === 'success' ? '#28a745' : '#007acc'}">\${message}</div>\`;
            
            if (type === 'success' || type === 'error') {
                setTimeout(() => {
                    status.innerHTML = '';
                }, 5000);
            }
        }

        function showError(section, message) {
            const targetId = section + 'Content';
            const target = document.getElementById(targetId);
            if (target) {
                target.innerHTML = \`<div class="error-message">Error: \${message}</div>\`;
            }
        }
    </script>
</body>
</html>`;
    }

    private async submitJobFromDashboard(jobData: any): Promise<void> {
        try {
            // Create job configuration from form data
            const config = vscode.workspace.getConfiguration('seraph');
            const remotePath = config.get<string>('remotePath', '');
            
            const jobConfig = {
                name: jobData.jobName,
                gpuCount: parseInt(jobData.gpuCount),
                gpuNode: jobData.gpuNode,
                cpuPerGpu: parseInt(jobData.cpuPerGpu),
                memoryPerGpu: jobData.memoryPerGpu,
                partition: jobData.partition,
                timeLimit: jobData.timeLimit,
                scriptPath: `${remotePath}/${jobData.jobName}.sh`,
                outputPath: `${remotePath}/${jobData.jobName}.out`,
                errorPath: `${remotePath}/${jobData.jobName}.err`,
                pythonScript: jobData.pythonScript,
                condaEnv: jobData.condaEnv
            };

            this.panel?.webview.postMessage({
                type: 'jobSubmitted',
                success: true,
                message: `Job ${jobData.jobName} submitted successfully`
            });

            // Refresh jobs after submission
            await this.loadJobData();

        } catch (error) {
            this.panel?.webview.postMessage({
                type: 'jobSubmitted',
                success: false,
                message: `Failed to submit job: ${error instanceof Error ? error.message : String(error)}`
            });
        }
    }

    private showJobSubmissionForm(): void {
        this.panel?.webview.postMessage({
            type: 'showJobForm'
        });
    }

    private dispose(): void {
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
        }

        this.disposables.forEach(d => d.dispose());
        this.panel = undefined;
    }
}