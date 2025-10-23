import * as vscode from 'vscode';
import { NodeSSH } from 'node-ssh';
import * as fs from 'fs';

export enum ConnectionStatus {
    NotConnected = 'Not Connected',
    Connecting = 'Connecting...',
    Connected = 'Connected',
    Failed = 'Failed'
}

export class SSHManager {
    private ssh: NodeSSH;
    private _status: ConnectionStatus = ConnectionStatus.NotConnected;
    private _onStatusChanged: vscode.EventEmitter<ConnectionStatus> = new vscode.EventEmitter<ConnectionStatus>();
    public readonly onStatusChanged: vscode.Event<ConnectionStatus> = this._onStatusChanged.event;
    private cachedPassword: string | null = null;

    constructor() {
        this.ssh = new NodeSSH();
    }

    get status(): ConnectionStatus {
        return this._status;
    }

    private setStatus(status: ConnectionStatus) {
        this._status = status;
        this._onStatusChanged.fire(status);
    }

    async connect(): Promise<boolean> {
        const config = vscode.workspace.getConfiguration('seraph');
        const host = config.get<string>('host');
        const port = config.get<number>('port', 22);
        const username = config.get<string>('username');
        const privateKeyPath = config.get<string>('privateKeyPath');

        if (!host || !username) {
            vscode.window.showErrorMessage('Please configure host and username first');
            return false;
        }

        this.setStatus(ConnectionStatus.Connecting);

        try {
            const connectionConfig: any = {
                host,
                port,
                username
            };

            if (privateKeyPath && fs.existsSync(privateKeyPath)) {
                connectionConfig.privateKey = fs.readFileSync(privateKeyPath);
                console.log(`Using private key: ${privateKeyPath}`);
            } else {
                console.log('No private key found, requesting password');
                
                // Use cached password if available
                let password = this.cachedPassword;
                
                if (!password) {
                    const inputPassword = await vscode.window.showInputBox({
                        prompt: 'Enter SSH password (will be cached for this session)',
                        password: true
                    });
                    
                    if (!inputPassword) {
                        this.setStatus(ConnectionStatus.NotConnected);
                        return false;
                    }
                    
                    password = inputPassword;
                    // Cache password for this session
                    this.cachedPassword = password;
                }
                
                connectionConfig.password = password;
            }

            await this.ssh.connect(connectionConfig);
            this.setStatus(ConnectionStatus.Connected);
            vscode.window.showInformationMessage('Connected to Seraph server');
            return true;
        } catch (error) {
            this.setStatus(ConnectionStatus.Failed);
            vscode.window.showErrorMessage(`Connection failed: ${error}`);
            return false;
        }
    }

    async disconnect(): Promise<void> {
        if (this.ssh.isConnected()) {
            this.ssh.dispose();
        }
        // Clear cached password for security
        this.cachedPassword = null;
        this.setStatus(ConnectionStatus.NotConnected);
    }

    async toggleConnection(): Promise<void> {
        if (this._status === ConnectionStatus.Connected) {
            await this.disconnect();
        } else if (this._status === ConnectionStatus.NotConnected || this._status === ConnectionStatus.Failed) {
            await this.connect();
        }
    }

    async testConnection(): Promise<boolean> {
        const wasConnected = this._status === ConnectionStatus.Connected;
        
        if (!wasConnected) {
            const connected = await this.connect();
            if (!connected) {
                return false;
            }
        }

        try {
            const result = await this.ssh.execCommand('echo "Connection test successful"');
            if (result.code === 0) {
                vscode.window.showInformationMessage('Connection test successful');
                return true;
            } else {
                vscode.window.showErrorMessage('Connection test failed');
                return false;
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Connection test failed: ${error}`);
            return false;
        }
    }

    async executeCommand(command: string): Promise<{ stdout: string; stderr: string; code: number | null }> {
        if (!this.ssh.isConnected()) {
            throw new Error('Not connected to server');
        }

        return await this.ssh.execCommand(command);
    }

    isConnected(): boolean {
        return this.ssh.isConnected();
    }
}