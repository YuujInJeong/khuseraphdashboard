import * as vscode from 'vscode';
import { SSHManager, ConnectionStatus } from './sshManager';

export class StatusBarManager implements vscode.Disposable {
    private statusBarItem: vscode.StatusBarItem;
    private syncButtonItem: vscode.StatusBarItem;
    private disposables: vscode.Disposable[] = [];

    constructor(private sshManager: SSHManager) {
        // Connection status item
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        this.statusBarItem.command = 'seraph.toggleConnection';
        this.statusBarItem.show();

        // Sync button item
        this.syncButtonItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
        this.syncButtonItem.text = '$(sync) Sync';
        this.syncButtonItem.tooltip = 'Synchronize files with server';
        this.syncButtonItem.command = 'seraph.showSyncMenu';
        
        this.disposables.push(
            this.statusBarItem,
            this.syncButtonItem,
            sshManager.onStatusChanged(this.updateStatusBar, this)
        );

        this.updateStatusBar(sshManager.status);
    }

    private updateStatusBar(status: ConnectionStatus): void {
        switch (status) {
            case ConnectionStatus.NotConnected:
                this.statusBarItem.text = '$(circle-outline) Seraph: Not Connected';
                this.statusBarItem.backgroundColor = undefined;
                this.statusBarItem.color = undefined;
                this.syncButtonItem.hide();
                break;
            case ConnectionStatus.Connecting:
                this.statusBarItem.text = '$(loading~spin) Seraph: Connecting...';
                this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
                this.statusBarItem.color = undefined;
                this.syncButtonItem.hide();
                break;
            case ConnectionStatus.Connected:
                this.statusBarItem.text = '$(check) Seraph: Connected';
                this.statusBarItem.backgroundColor = undefined;
                this.statusBarItem.color = new vscode.ThemeColor('statusBar.foreground');
                this.syncButtonItem.show();
                break;
            case ConnectionStatus.Failed:
                this.statusBarItem.text = '$(error) Seraph: Failed';
                this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
                this.statusBarItem.color = undefined;
                this.syncButtonItem.hide();
                break;
        }
    }

    dispose(): void {
        this.disposables.forEach(d => d.dispose());
    }
}