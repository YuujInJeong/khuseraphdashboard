import * as vscode from 'vscode';
import { JobManager, JobInfo } from './jobManager';

export class JobTreeProvider implements vscode.TreeDataProvider<JobTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<JobTreeItem | undefined | null | void> = new vscode.EventEmitter<JobTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<JobTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private runningJobs: JobInfo[] = [];
    private completedJobs: JobInfo[] = [];

    constructor(private jobManager: JobManager) {
        this.jobManager.onJobStatusChanged(jobs => {
            this.runningJobs = jobs;
            this.refresh();
        });
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: JobTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: JobTreeItem): Thenable<JobTreeItem[]> {
        if (!element) {
            // Root level - show categories
            return Promise.resolve([
                new JobTreeItem('Running Jobs', `${this.runningJobs.length} jobs`, vscode.TreeItemCollapsibleState.Expanded, 'category'),
                new JobTreeItem('Completed Jobs', `${this.completedJobs.length} jobs`, vscode.TreeItemCollapsibleState.Collapsed, 'category')
            ]);
        }

        if (element.contextValue === 'category') {
            if (element.label === 'Running Jobs') {
                return Promise.resolve(this.runningJobs.map(job => this.createJobTreeItem(job, 'running')));
            } else if (element.label === 'Completed Jobs') {
                return Promise.resolve(this.completedJobs.map(job => this.createJobTreeItem(job, 'completed')));
            }
        }

        return Promise.resolve([]);
    }

    private createJobTreeItem(job: JobInfo, type: 'running' | 'completed'): JobTreeItem {
        const label = `${job.name} (${job.jobId})`;
        const description = `${job.status} • ${job.gpuNode || job.partition}`;
        
        const item = new JobTreeItem(
            label,
            description,
            vscode.TreeItemCollapsibleState.None,
            type === 'running' ? 'runningJob' : 'completedJob'
        );

        item.jobInfo = job;
        item.tooltip = this.createJobTooltip(job);
        
        // Set icon based on status
        item.iconPath = this.getJobIcon(job.status);

        return item;
    }

    private createJobTooltip(job: JobInfo): string {
        return `Job ID: ${job.jobId}
Name: ${job.name}
Status: ${job.status}
Partition: ${job.partition}
Node: ${job.gpuNode || 'N/A'}
Time Limit: ${job.timeLimit}
Submit Time: ${job.submitTime.toLocaleString()}`;
    }

    private getJobIcon(status: string): vscode.ThemeIcon {
        switch (status.toLowerCase()) {
            case 'running':
                return new vscode.ThemeIcon('play', new vscode.ThemeColor('charts.green'));
            case 'pending':
                return new vscode.ThemeIcon('clock', new vscode.ThemeColor('charts.yellow'));
            case 'completed':
                return new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.blue'));
            case 'failed':
                return new vscode.ThemeIcon('error', new vscode.ThemeColor('charts.red'));
            case 'cancelled':
                return new vscode.ThemeIcon('circle-slash', new vscode.ThemeColor('charts.orange'));
            default:
                return new vscode.ThemeIcon('circle-outline');
        }
    }

    getJobFromTreeItem(item: JobTreeItem): JobInfo | undefined {
        return item.jobInfo;
    }
}

export class JobTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly description: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly contextValue: string
    ) {
        super(label, collapsibleState);
        this.description = description;
        this.contextValue = contextValue;
    }

    public jobInfo?: JobInfo;
}