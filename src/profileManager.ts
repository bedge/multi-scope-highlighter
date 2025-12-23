import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { HighlightState } from './state';
import { HighlightDetails } from './types';
import { HighlightMode } from './utils';

/**
 * Saved profile item structure (supports legacy formats)
 */
interface SavedProfileItem {
    word?: string;      // Legacy format
    pattern?: string;   // Current format
    color: string;
    mode?: HighlightMode;
}

/**
 * Manages profile save/load operations and file I/O
 */
export class ProfileManager {
    constructor(
        private context: vscode.ExtensionContext,
        private state: HighlightState,
        private addHighlightCallback: (pattern: string, details?: Partial<HighlightDetails>) => void,
        private clearAllCallback: () => void,
        private triggerUpdateCallback: () => void
    ) {}

    /**
     * Get the save path for workspace profiles
     */
    private getSavePath(): string | undefined {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            vscode.window.showErrorMessage('Please open a workspace to manage profiles.');
            return undefined;
        }
        const savePath = path.join(workspaceFolders[0].uri.fsPath, '.vscode', 'highlights');
        if (!fs.existsSync(savePath)) {
            fs.mkdirSync(savePath, { recursive: true });
        }
        return savePath;
    }

    /**
     * Save current highlights as a profile
     */
    async saveProfile(name?: string): Promise<void> {
        if (this.state.highlightMap.size === 0) {
            vscode.window.showWarningMessage('No highlights to save.');
            return;
        }

        const savePath = this.getSavePath();
        if (!savePath) {
            return;
        }

        const profileName = name || await vscode.window.showInputBox({
            prompt: 'Enter name for this highlight profile',
            value: this.state.currentProfileName || ''
        });

        if (!profileName) {
            return;
        }

        const exportData = Array.from(this.state.highlightMap.entries()).map(([pattern, details]) => ({
            pattern,
            color: details.color,
            mode: details.mode
        }));

        const filePath = path.join(savePath, `${profileName}.json`);
        fs.writeFileSync(filePath, JSON.stringify(exportData, null, 2));

        this.state.currentProfileName = profileName;
        vscode.window.showInformationMessage(`Profile saved as '${profileName}'`);
    }

    /**
     * Load a profile from file
     */
    async loadProfile(selectedFile?: string): Promise<void> {
        const savePath = this.getSavePath();
        if (!savePath) {
            return;
        }

        if (!fs.existsSync(savePath)) {
            vscode.window.showErrorMessage('No highlight profiles found.');
            return;
        }

        const files = fs.readdirSync(savePath).filter(f => f.endsWith('.json'));
        if (files.length === 0) {
            return;
        }

        const selected = selectedFile || await vscode.window.showQuickPick(files, {
            placeHolder: 'Select a profile to load'
        });

        if (!selected) {
            return;
        }

        const filePath = path.join(savePath, selected);
        const content = fs.readFileSync(filePath, 'utf-8');

        try {
            const data: SavedProfileItem[] = JSON.parse(content);
            this.clearAllCallback();

            data.forEach(item => {
                const pattern = item.pattern || item.word || '';
                if (pattern) {
                    this.addHighlightCallback(pattern, { color: item.color, mode: item.mode || 'text' });
                }
            });

            this.state.currentProfileName = selected.replace('.json', '');
            this.triggerUpdateCallback();
            vscode.window.showInformationMessage(`Profile '${this.state.currentProfileName}' loaded.`);
        } catch (e) {
            vscode.window.showErrorMessage('Failed to parse profile.');
        }
    }

    /**
     * Delete a profile file
     */
    async deleteProfile(): Promise<void> {
        const savePath = this.getSavePath();
        if (!savePath) {
            return;
        }

        const files = fs.readdirSync(savePath).filter(f => f.endsWith('.json'));
        if (files.length === 0) {
            return;
        }

        const selected = await vscode.window.showQuickPick(files, {
            placeHolder: 'Select a profile to DELETE'
        });

        if (!selected) {
            return;
        }

        try {
            fs.unlinkSync(path.join(savePath, selected));
            const deletedName = selected.replace('.json', '');
            if (this.state.currentProfileName === deletedName) {
                this.state.currentProfileName = undefined;
            }
            vscode.window.showInformationMessage(`Profile '${deletedName}' deleted.`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to delete: ${error}`);
        }
    }

    /**
     * List all available profiles
     * Returns array of profile file names
     */
    async listProfiles(): Promise<string[]> {
        const savePath = this.getSavePath();
        if (!savePath || !fs.existsSync(savePath)) {
            return [];
        }

        return fs.readdirSync(savePath).filter(f => f.endsWith('.json'));
    }
}
