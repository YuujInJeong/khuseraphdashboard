import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
const Client = require('ssh2-sftp-client');
import { SSHManager } from './sshManager';

export enum SyncDirection {
    LocalToRemote = 'upload',
    RemoteToLocal = 'download',
    Both = 'both'
}

export interface SyncOptions {
    direction: SyncDirection;
    excludePatterns: string[];
    includeHidden: boolean;
    deleteExtraFiles: boolean;
}

export interface SyncProgress {
    current: number;
    total: number;
    currentFile: string;
    percentage: number;
}

export class FileSyncManager {
    private sftp: any;
    private _onSyncProgress: vscode.EventEmitter<SyncProgress> = new vscode.EventEmitter<SyncProgress>();
    public readonly onSyncProgress: vscode.Event<SyncProgress> = this._onSyncProgress.event;

    private defaultExcludePatterns = [
        'node_modules/**',
        '.git/**',
        '**/__pycache__/**',
        '**/*.pyc',
        '**/*.pyo',
        '.vscode/**',
        '.DS_Store',
        'Thumbs.db',
        '*.tmp',
        '*.temp',
        '**/.pytest_cache/**',
        '**/out/**',
        '**/dist/**'
    ];

    constructor(private sshManager: SSHManager) {
        this.sftp = new Client();
    }

    async syncFiles(direction: SyncDirection, options?: Partial<SyncOptions>): Promise<void> {
        if (!this.sshManager.isConnected()) {
            throw new Error('Not connected to server');
        }

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            throw new Error('No workspace folder found');
        }

        const config = vscode.workspace.getConfiguration('seraph');
        const remotePath = config.get<string>('remotePath');
        if (!remotePath) {
            throw new Error('Remote path not configured');
        }

        const syncOptions: SyncOptions = {
            direction,
            excludePatterns: [...this.defaultExcludePatterns, ...(options?.excludePatterns || [])],
            includeHidden: options?.includeHidden || false,
            deleteExtraFiles: options?.deleteExtraFiles || false
        };

        const localPath = workspaceFolder.uri.fsPath;

        try {
            await this.connectSFTP();

            switch (direction) {
                case SyncDirection.LocalToRemote:
                    await this.uploadFiles(localPath, remotePath, syncOptions);
                    break;
                case SyncDirection.RemoteToLocal:
                    await this.downloadFiles(remotePath, localPath, syncOptions);
                    break;
                case SyncDirection.Both:
                    await this.bidirectionalSync(localPath, remotePath, syncOptions);
                    break;
            }

            vscode.window.showInformationMessage('File synchronization completed successfully');
        } catch (error) {
            vscode.window.showErrorMessage(`Sync failed: ${error}`);
            throw error;
        } finally {
            await this.disconnectSFTP();
        }
    }

    private async connectSFTP(): Promise<void> {
        const config = vscode.workspace.getConfiguration('seraph');
        const host = config.get<string>('host');
        const port = config.get<number>('port', 22);
        const username = config.get<string>('username');
        const privateKeyPath = config.get<string>('privateKeyPath');

        if (!host || !username) {
            throw new Error('SSH configuration incomplete');
        }

        const connectionConfig: any = {
            host,
            port,
            username
        };

        if (privateKeyPath && fs.existsSync(privateKeyPath)) {
            connectionConfig.privateKey = fs.readFileSync(privateKeyPath);
        } else {
            const password = await vscode.window.showInputBox({
                prompt: 'Enter SSH password for file sync',
                password: true
            });
            
            if (!password) {
                throw new Error('Password required for file sync');
            }
            
            connectionConfig.password = password;
        }

        await this.sftp.connect(connectionConfig);
    }

    private async disconnectSFTP(): Promise<void> {
        if (this.sftp) {
            await this.sftp.end();
        }
    }

    private async uploadFiles(localPath: string, remotePath: string, options: SyncOptions): Promise<void> {
        const files = await this.getLocalFiles(localPath, options);
        let current = 0;

        // Ensure remote directory exists
        await this.ensureRemoteDirectory(remotePath);

        for (const file of files) {
            const localFilePath = path.join(localPath, file);
            const remoteFilePath = path.posix.join(remotePath, file.replace(/\\/g, '/'));

            this._onSyncProgress.fire({
                current: current + 1,
                total: files.length,
                currentFile: file,
                percentage: Math.round(((current + 1) / files.length) * 100)
            });

            // Ensure remote directory for this file exists
            const remoteDir = path.posix.dirname(remoteFilePath);
            await this.ensureRemoteDirectory(remoteDir);

            await this.sftp.put(localFilePath, remoteFilePath);
            current++;
        }
    }

    private async downloadFiles(remotePath: string, localPath: string, options: SyncOptions): Promise<void> {
        const files = await this.getRemoteFiles(remotePath, options);
        let current = 0;

        for (const file of files) {
            const remoteFilePath = path.posix.join(remotePath, file);
            const localFilePath = path.join(localPath, file.replace(/\//g, path.sep));

            this._onSyncProgress.fire({
                current: current + 1,
                total: files.length,
                currentFile: file,
                percentage: Math.round(((current + 1) / files.length) * 100)
            });

            // Ensure local directory exists
            const localDir = path.dirname(localFilePath);
            if (!fs.existsSync(localDir)) {
                fs.mkdirSync(localDir, { recursive: true });
            }

            await this.sftp.get(remoteFilePath, localFilePath);
            current++;
        }
    }

    private async bidirectionalSync(localPath: string, remotePath: string, options: SyncOptions): Promise<void> {
        // Get file lists with modification times
        const localFiles = await this.getLocalFilesWithStats(localPath, options);
        const remoteFiles = await this.getRemoteFilesWithStats(remotePath, options);

        const syncActions = this.calculateSyncActions(localFiles, remoteFiles);
        let current = 0;
        const total = syncActions.length;

        for (const action of syncActions) {
            this._onSyncProgress.fire({
                current: current + 1,
                total,
                currentFile: action.file,
                percentage: Math.round(((current + 1) / total) * 100)
            });

            switch (action.type) {
                case 'upload':
                    const localFilePath = path.join(localPath, action.file);
                    const remoteFilePath = path.posix.join(remotePath, action.file.replace(/\\/g, '/'));
                    const remoteDir = path.posix.dirname(remoteFilePath);
                    await this.ensureRemoteDirectory(remoteDir);
                    await this.sftp.put(localFilePath, remoteFilePath);
                    break;
                case 'download':
                    const remoteFile = path.posix.join(remotePath, action.file);
                    const localFile = path.join(localPath, action.file.replace(/\//g, path.sep));
                    const localDir = path.dirname(localFile);
                    if (!fs.existsSync(localDir)) {
                        fs.mkdirSync(localDir, { recursive: true });
                    }
                    await this.sftp.get(remoteFile, localFile);
                    break;
            }
            current++;
        }
    }

    private async getLocalFiles(basePath: string, options: SyncOptions): Promise<string[]> {
        const files: string[] = [];
        const glob = require('glob');

        const includePattern = options.includeHidden ? '**/*' : '**/!(.*)*';
        const allFiles = glob.sync(includePattern, { 
            cwd: basePath,
            nodir: true,
            dot: options.includeHidden
        });

        for (const file of allFiles) {
            if (!this.shouldExcludeFile(file, options.excludePatterns)) {
                files.push(file);
            }
        }

        return files;
    }

    private async getRemoteFiles(basePath: string, options: SyncOptions): Promise<string[]> {
        const files: string[] = [];
        
        const traverse = async (currentPath: string, relativePath: string = ''): Promise<void> => {
            try {
                const items = await this.sftp.list(currentPath);
                
                for (const item of items) {
                    const itemPath = path.posix.join(currentPath, item.name);
                    const relativeItemPath = relativePath ? path.posix.join(relativePath, item.name) : item.name;

                    if (item.type === 'd') {
                        // Directory
                        if (options.includeHidden || !item.name.startsWith('.')) {
                            await traverse(itemPath, relativeItemPath);
                        }
                    } else {
                        // File
                        if ((options.includeHidden || !item.name.startsWith('.')) &&
                            !this.shouldExcludeFile(relativeItemPath, options.excludePatterns)) {
                            files.push(relativeItemPath);
                        }
                    }
                }
            } catch (error) {
                // Directory might not exist or be accessible
                console.warn(`Cannot access remote directory: ${currentPath}`);
            }
        };

        await traverse(basePath);
        return files;
    }

    private async getLocalFilesWithStats(basePath: string, options: SyncOptions): Promise<Map<string, fs.Stats>> {
        const files = new Map<string, fs.Stats>();
        const fileList = await this.getLocalFiles(basePath, options);

        for (const file of fileList) {
            const fullPath = path.join(basePath, file);
            try {
                const stats = fs.statSync(fullPath);
                files.set(file, stats);
            } catch (error) {
                console.warn(`Cannot get stats for local file: ${file}`);
            }
        }

        return files;
    }

    private async getRemoteFilesWithStats(basePath: string, options: SyncOptions): Promise<Map<string, any>> {
        const files = new Map<string, any>();
        
        const traverse = async (currentPath: string, relativePath: string = ''): Promise<void> => {
            try {
                const items = await this.sftp.list(currentPath);
                
                for (const item of items) {
                    const itemPath = path.posix.join(currentPath, item.name);
                    const relativeItemPath = relativePath ? path.posix.join(relativePath, item.name) : item.name;

                    if (item.type === 'd') {
                        if (options.includeHidden || !item.name.startsWith('.')) {
                            await traverse(itemPath, relativeItemPath);
                        }
                    } else {
                        if ((options.includeHidden || !item.name.startsWith('.')) &&
                            !this.shouldExcludeFile(relativeItemPath, options.excludePatterns)) {
                            files.set(relativeItemPath, item);
                        }
                    }
                }
            } catch (error) {
                console.warn(`Cannot access remote directory: ${currentPath}`);
            }
        };

        await traverse(basePath);
        return files;
    }

    private calculateSyncActions(localFiles: Map<string, fs.Stats>, remoteFiles: Map<string, any>): Array<{type: 'upload' | 'download', file: string}> {
        const actions: Array<{type: 'upload' | 'download', file: string}> = [];
        const allFiles = new Set([...localFiles.keys(), ...remoteFiles.keys()]);

        for (const file of allFiles) {
            const localStats = localFiles.get(file);
            const remoteStats = remoteFiles.get(file);

            if (localStats && !remoteStats) {
                // File exists only locally - upload
                actions.push({ type: 'upload', file });
            } else if (!localStats && remoteStats) {
                // File exists only remotely - download
                actions.push({ type: 'download', file });
            } else if (localStats && remoteStats) {
                // File exists in both - compare modification times
                const localTime = localStats.mtime.getTime();
                const remoteTime = remoteStats.modifyTime || 0;

                if (localTime > remoteTime) {
                    actions.push({ type: 'upload', file });
                } else if (remoteTime > localTime) {
                    actions.push({ type: 'download', file });
                }
                // If times are equal, no action needed
            }
        }

        return actions;
    }

    private shouldExcludeFile(filePath: string, excludePatterns: string[]): boolean {
        const minimatch = require('minimatch');
        
        for (const pattern of excludePatterns) {
            if (minimatch(filePath, pattern)) {
                return true;
            }
        }
        return false;
    }

    private async ensureRemoteDirectory(remotePath: string): Promise<void> {
        try {
            await this.sftp.mkdir(remotePath, true);
        } catch (error) {
            // Directory might already exist
        }
    }
}