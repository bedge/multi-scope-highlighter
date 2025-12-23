import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { HighlightState } from './state';
import { HighlightDetails, ProfileMetadata } from './types';
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
 * Profile file format with metadata
 */
interface ProfileFileFormat {
    metadata?: {
        version: string;
        created?: string;
        modified?: string;
    };
    highlights: SavedProfileItem[];
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
        private triggerUpdateCallback: () => void,
        private statusBarUpdateCallback: () => void
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
            value: this.state.currentProfile?.name || this.state.currentProfileName || ''
        });

        if (!profileName) {
            return;
        }

        const filePath = path.join(savePath, `${profileName}.json`);
        const now = new Date().toISOString();
        
        // Check if file exists to preserve created date
        let createdDate = now;
        if (fs.existsSync(filePath)) {
            try {
                const existingContent = fs.readFileSync(filePath, 'utf-8');
                const existingData = JSON.parse(existingContent) as ProfileFileFormat;
                if (existingData.metadata?.created) {
                    createdDate = existingData.metadata.created;
                }
            } catch (e) {
                // Ignore parse errors, use new date
            }
        }

        const exportData: ProfileFileFormat = {
            metadata: {
                version: '0.0.19',
                created: createdDate,
                modified: now
            },
            highlights: Array.from(this.state.highlightMap.entries()).map(([pattern, details]) => ({
                pattern,
                color: details.color,
                mode: details.mode
            }))
        };

        fs.writeFileSync(filePath, JSON.stringify(exportData, null, 2));

        // Update state with profile metadata
        this.state.currentProfile = {
            name: profileName,
            path: filePath,
            scope: 'workspace',
            lastModified: new Date(now)
        };
        this.state.currentProfileName = profileName; // Legacy compatibility

        this.statusBarUpdateCallback();
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
            const parsed = JSON.parse(content);
            
            // Check if it's the new format with metadata or legacy format
            let highlights: SavedProfileItem[];
            let metadata: ProfileFileFormat['metadata'] | undefined;
            
            if (Array.isArray(parsed)) {
                // Legacy format: array of highlights
                highlights = parsed;
            } else if (parsed.highlights && Array.isArray(parsed.highlights)) {
                // New format: object with metadata and highlights
                highlights = parsed.highlights;
                metadata = parsed.metadata;
            } else {
                throw new Error('Invalid profile format');
            }

            this.clearAllCallback();

            highlights.forEach(item => {
                const pattern = item.pattern || item.word || '';
                if (pattern) {
                    this.addHighlightCallback(pattern, { color: item.color, mode: item.mode || 'text' });
                }
            });

            const profileName = selected.replace('.json', '');
            const stats = fs.statSync(filePath);
            
            // Update state with profile metadata
            this.state.currentProfile = {
                name: profileName,
                path: filePath,
                scope: 'workspace',
                lastModified: metadata?.modified ? new Date(metadata.modified) : stats.mtime
            };
            this.state.currentProfileName = profileName; // Legacy compatibility

            this.triggerUpdateCallback();
            this.statusBarUpdateCallback();
            vscode.window.showInformationMessage(`Profile '${profileName}' loaded.`);
        } catch (e) {
            vscode.window.showErrorMessage(`Failed to parse profile: ${e}`);
        }
    }

    /**
     * Delete a profile file
     */
    async deleteProfile(fileName?: string): Promise<void> {
        const savePath = this.getSavePath();
        if (!savePath) {
            return;
        }

        const files = fs.readdirSync(savePath).filter(f => f.endsWith('.json'));
        if (files.length === 0) {
            return;
        }

        let selected: string | undefined = fileName;
        
        // If no fileName provided, show QuickPick
        if (!selected) {
            selected = await vscode.window.showQuickPick(files, {
                placeHolder: 'Select a profile to DELETE'
            });
        }

        if (!selected) {
            return;
        }

        try {
            fs.unlinkSync(path.join(savePath, selected));
            const deletedName = selected.replace('.json', '');
            
            // Clear profile metadata if this was the active profile
            if (this.state.currentProfileName === deletedName || 
                this.state.currentProfile?.name === deletedName) {
                this.state.currentProfileName = undefined;
                this.state.currentProfile = null;
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
