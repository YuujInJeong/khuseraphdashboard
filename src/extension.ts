import * as vscode from 'vscode';
import { SSHManager } from './sshManager';
import { StatusBarManager } from './statusBarManager';
import { GPUManager } from './gpuManager';
import { GPUDashboard } from './gpuDashboard';
import { JobManager } from './jobManager';
import { JobTreeProvider, JobTreeItem } from './jobTreeProvider';
import { JobLogViewer } from './jobLogViewer';
import { FileSyncManager } from './fileSyncManager';
import { SyncUI } from './syncUI';
import { DatasetManager } from './datasetManager';
import { MainDashboard } from './mainDashboard';

let sshManager: SSHManager;
let statusBarManager: StatusBarManager;
let gpuManager: GPUManager;
let gpuDashboard: GPUDashboard;
let jobManager: JobManager;
let jobTreeProvider: JobTreeProvider;
let jobLogViewer: JobLogViewer;
let fileSyncManager: FileSyncManager;
let syncUI: SyncUI;
let datasetManager: DatasetManager;
let mainDashboard: MainDashboard;

export function activate(context: vscode.ExtensionContext) {
    console.log('Seraph Manager activated');
    
    // Initialize managers
    sshManager = new SSHManager();
    statusBarManager = new StatusBarManager(sshManager);
    gpuManager = new GPUManager(sshManager);
    gpuDashboard = new GPUDashboard(context, sshManager, gpuManager);
    jobManager = new JobManager(sshManager);
    jobTreeProvider = new JobTreeProvider(jobManager);
    jobLogViewer = new JobLogViewer(sshManager);
    fileSyncManager = new FileSyncManager(sshManager);
    syncUI = new SyncUI(fileSyncManager, sshManager);
    datasetManager = new DatasetManager(sshManager);
    mainDashboard = new MainDashboard(context, sshManager, gpuManager, jobManager, fileSyncManager, datasetManager);
    
    // Register TreeView
    vscode.window.createTreeView('seraphJobs', {
        treeDataProvider: jobTreeProvider,
        showCollapseAll: true
    });
    
    // Connection commands
    const configureConnectionDisposable = vscode.commands.registerCommand('seraph.configureConnection', async () => {
        await configureConnection();
    });
    
    const toggleConnectionDisposable = vscode.commands.registerCommand('seraph.toggleConnection', async () => {
        await sshManager.toggleConnection();
    });
    
    // Main Dashboard command
    const showMainDashboardDisposable = vscode.commands.registerCommand('seraph.showDashboard', () => {
        mainDashboard.show();
    });
    
    // Legacy GPU command (redirect to main dashboard)
    const showGPUDashboardDisposable = vscode.commands.registerCommand('seraph.showGPUDashboard', () => {
        mainDashboard.show();
    });
    
    // Job commands
    const submitJobDisposable = vscode.commands.registerCommand('seraph.submitJob', async () => {
        await jobManager.submitJob();
    });
    
    const refreshJobsDisposable = vscode.commands.registerCommand('seraph.refreshJobs', async () => {
        await jobManager.refreshJobs();
    });
    
    const viewJobLogDisposable = vscode.commands.registerCommand('seraph.viewJobLog', async (item: JobTreeItem) => {
        const job = jobTreeProvider.getJobFromTreeItem(item);
        if (job) {
            await jobLogViewer.showJobLog(job);
        }
    });
    
    const cancelJobDisposable = vscode.commands.registerCommand('seraph.cancelJob', async (item: JobTreeItem) => {
        const job = jobTreeProvider.getJobFromTreeItem(item);
        if (job) {
            const confirmation = await vscode.window.showWarningMessage(
                `Are you sure you want to cancel job "${job.name}" (${job.jobId})?`,
                'Yes', 'No'
            );
            if (confirmation === 'Yes') {
                await jobManager.cancelJob(job.jobId);
            }
        }
    });
    
    const copyJobIdDisposable = vscode.commands.registerCommand('seraph.copyJobId', async (item: JobTreeItem) => {
        const job = jobTreeProvider.getJobFromTreeItem(item);
        if (job) {
            await vscode.env.clipboard.writeText(job.jobId);
            vscode.window.showInformationMessage(`Job ID ${job.jobId} copied to clipboard`);
        }
    });
    
    // File sync commands
    const showSyncMenuDisposable = vscode.commands.registerCommand('seraph.showSyncMenu', async () => {
        await syncUI.showSyncDialog();
    });
    
    const syncLocalToRemoteDisposable = vscode.commands.registerCommand('seraph.syncLocalToRemote', async () => {
        await syncUI.syncLocalToRemote();
    });
    
    const syncRemoteToLocalDisposable = vscode.commands.registerCommand('seraph.syncRemoteToLocal', async () => {
        await syncUI.syncRemoteToLocal();
    });
    
    const syncBothWaysDisposable = vscode.commands.registerCommand('seraph.syncBothWays', async () => {
        await syncUI.syncBothWays();
    });
    
    // Dataset management commands
    const manageDatasetDisposable = vscode.commands.registerCommand('seraph.manageDatasets', async () => {
        await datasetManager.showDatasetDashboard();
    });
    
    // Start auto-refresh for jobs when connected
    sshManager.onStatusChanged(status => {
        if (status === 'Connected') {
            jobManager.startAutoRefresh();
            jobManager.refreshJobs();
        } else {
            jobManager.stopAutoRefresh();
        }
    });
    
    context.subscriptions.push(
        configureConnectionDisposable,
        toggleConnectionDisposable,
        showMainDashboardDisposable,
        showGPUDashboardDisposable,
        submitJobDisposable,
        refreshJobsDisposable,
        viewJobLogDisposable,
        cancelJobDisposable,
        copyJobIdDisposable,
        showSyncMenuDisposable,
        syncLocalToRemoteDisposable,
        syncRemoteToLocalDisposable,
        syncBothWaysDisposable,
        manageDatasetDisposable,
        statusBarManager
    );
    
    vscode.window.showInformationMessage('Seraph Manager activated');
}

async function configureConnection() {
    const config = vscode.workspace.getConfiguration('seraph');
    
    const items = [
        { label: 'Host', key: 'host', current: config.get<string>('host', '') },
        { label: 'Port', key: 'port', current: config.get<number>('port', 22).toString() },
        { label: 'Username', key: 'username', current: config.get<string>('username', '') },
        { label: 'Remote Path', key: 'remotePath', current: config.get<string>('remotePath', '') },
        { label: 'Private Key Path', key: 'privateKeyPath', current: config.get<string>('privateKeyPath', '') }
    ];
    
    const selectedItem = await vscode.window.showQuickPick(
        items.map(item => ({
            label: item.label,
            description: item.current || 'Not set',
            key: item.key
        })),
        { placeHolder: 'Select setting to configure' }
    );
    
    if (!selectedItem) {
        return;
    }
    
    const newValue = await vscode.window.showInputBox({
        prompt: `Enter ${selectedItem.label}`,
        value: items.find(item => item.key === selectedItem.key)?.current
    });
    
    if (newValue !== undefined) {
        const value = selectedItem.key === 'port' ? parseInt(newValue) : newValue;
        await config.update(selectedItem.key, value, vscode.ConfigurationTarget.Workspace);
        vscode.window.showInformationMessage(`${selectedItem.label} updated successfully`);
        
        if (await vscode.window.showQuickPick(['Yes', 'No'], { 
            placeHolder: 'Test connection now?' 
        }) === 'Yes') {
            await sshManager.testConnection();
        }
    }
}

export function deactivate() {
    if (sshManager) {
        sshManager.disconnect();
    }
    if (jobManager) {
        jobManager.stopAutoRefresh();
    }
    if (jobLogViewer) {
        jobLogViewer.disposeAll();
    }
}