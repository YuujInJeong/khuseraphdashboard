import * as vscode from 'vscode';
import { FileSyncManager, SyncDirection, SyncOptions } from './fileSyncManager';
import { SSHManager } from './sshManager';

export class SyncUI {
    constructor(
        private fileSyncManager: FileSyncManager,
        private sshManager: SSHManager
    ) {}

    async showSyncDialog(): Promise<void> {
        if (!this.sshManager.isConnected()) {
            vscode.window.showErrorMessage('Please connect to the server first');
            return;
        }

        const direction = await this.selectSyncDirection();
        if (!direction) {
            return;
        }

        const options = await this.getSyncOptions();
        if (!options) {
            return;
        }

        await this.performSync(direction, options);
    }

    async syncLocalToRemote(): Promise<void> {
        if (!this.sshManager.isConnected()) {
            vscode.window.showErrorMessage('Please connect to the server first');
            return;
        }

        await this.performSync(SyncDirection.LocalToRemote);
    }

    async syncRemoteToLocal(): Promise<void> {
        if (!this.sshManager.isConnected()) {
            vscode.window.showErrorMessage('Please connect to the server first');
            return;
        }

        await this.performSync(SyncDirection.RemoteToLocal);
    }

    async syncBothWays(): Promise<void> {
        if (!this.sshManager.isConnected()) {
            vscode.window.showErrorMessage('Please connect to the server first');
            return;
        }

        const confirmation = await vscode.window.showWarningMessage(
            'Bidirectional sync will overwrite files based on modification time. Continue?',
            'Yes', 'No'
        );

        if (confirmation === 'Yes') {
            await this.performSync(SyncDirection.Both);
        }
    }

    private async selectSyncDirection(): Promise<SyncDirection | undefined> {
        const items = [
            {
                label: '$(cloud-upload) Upload (Local → Remote)',
                description: 'Upload local files to server',
                direction: SyncDirection.LocalToRemote
            },
            {
                label: '$(cloud-download) Download (Remote → Local)',
                description: 'Download files from server',
                direction: SyncDirection.RemoteToLocal
            },
            {
                label: '$(sync) Bidirectional Sync',
                description: 'Sync both ways based on modification time',
                direction: SyncDirection.Both
            }
        ];

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select sync direction'
        });

        return selected?.direction;
    }

    private async getSyncOptions(): Promise<Partial<SyncOptions> | undefined> {
        const options: Partial<SyncOptions> = {};

        // Include hidden files?
        const includeHidden = await vscode.window.showQuickPick(
            ['No', 'Yes'],
            { placeHolder: 'Include hidden files (.gitignore, .vscode, etc.)?' }
        );

        if (includeHidden === undefined) {
            return undefined;
        }

        options.includeHidden = includeHidden === 'Yes';

        // Additional exclude patterns
        const additionalExcludes = await vscode.window.showInputBox({
            prompt: 'Additional exclude patterns (comma-separated, optional)',
            placeHolder: '*.log, temp/**, *.cache'
        });

        if (additionalExcludes !== undefined) {
            options.excludePatterns = additionalExcludes
                .split(',')
                .map(p => p.trim())
                .filter(p => p.length > 0);
        }

        return options;
    }

    private async performSync(direction: SyncDirection, options?: Partial<SyncOptions>): Promise<void> {
        return vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: this.getSyncTitle(direction),
            cancellable: false
        }, async (progress) => {
            let lastProgress = 0;

            const progressDisposable = this.fileSyncManager.onSyncProgress(syncProgress => {
                const increment = syncProgress.percentage - lastProgress;
                lastProgress = syncProgress.percentage;

                progress.report({
                    increment,
                    message: `${syncProgress.current}/${syncProgress.total} - ${path.basename(syncProgress.currentFile)}`
                });
            });

            try {
                await this.fileSyncManager.syncFiles(direction, options);
            } finally {
                progressDisposable.dispose();
            }
        });
    }

    private getSyncTitle(direction: SyncDirection): string {
        switch (direction) {
            case SyncDirection.LocalToRemote:
                return 'Uploading files to server...';
            case SyncDirection.RemoteToLocal:
                return 'Downloading files from server...';
            case SyncDirection.Both:
                return 'Synchronizing files...';
            default:
                return 'Syncing files...';
        }
    }
}

const path = require('path');