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
    source?: { type: 'manual' | 'profile'; profileName?: string };  // NEW: Source tracking
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
                mode: details.mode,
                source: details.source  // NEW: Include source
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
     * Activate a profile from file (load and set as active for editing)
     */
    async activateProfile(selectedFile?: string): Promise<void> {
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
            placeHolder: 'Select a profile to activate'
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

            const profileName = selected.replace('.json', '');
            this.clearAllCallback();
            
            // Set this as the active profile BEFORE adding highlights
            this.state.activeProfileName = profileName;

            highlights.forEach(item => {
                const pattern = item.pattern || item.word || '';
                if (pattern) {
                    // Load with source from file, or assign profile source for legacy files
                    const source = item.source || { type: 'profile', profileName };
                    this.addHighlightCallback(pattern, { 
                        color: item.color, 
                        mode: item.mode || 'text',
                        source 
                    });
                }
            });

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
            vscode.window.showInformationMessage(`Profile '${profileName}' activated.`);
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
     * List all available profiles with metadata
     * Returns array of ProfileMetadata objects
     */
    async listProfiles(): Promise<ProfileMetadata[]> {
        const savePath = this.getSavePath();
        if (!savePath || !fs.existsSync(savePath)) {
            return [];
        }

        const files = fs.readdirSync(savePath).filter(f => f.endsWith('.json'));
        const profiles: ProfileMetadata[] = [];

        for (const file of files) {
            try {
                const filePath = path.join(savePath, file);
                const stats = fs.statSync(filePath);
                const name = file.replace('.json', '');
                
                profiles.push({
                    name,
                    path: filePath,
                    scope: 'workspace',
                    lastModified: stats.mtime
                });
            } catch (error) {
                // Skip files that can't be read
                continue;
            }
        }

        // Sort by last modified (most recent first)
        return profiles.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
    }

    /**
     * Switch to a different profile
     * Shows QuickPick of available profiles and loads the selected one
     */
    async switchProfile(): Promise<void> {
        const profiles = await this.listProfiles();
        
        if (profiles.length === 0) {
            vscode.window.showInformationMessage('No saved profiles found. Create one with Save Profile command.');
            return;
        }

        // Format profile list for QuickPick
        const items = profiles.map(profile => ({
            label: profile.name,
            description: profile.lastModified.toLocaleString(),
            detail: profile.name === this.state.currentProfile?.name ? '✓ Currently loaded' : '',
            profile
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a profile to load'
        });

        if (!selected) {
            return;
        }

        // Load the selected profile
        await this.activateProfile(selected.profile.name + '.json');
        vscode.window.showInformationMessage(`Loaded profile: ${selected.profile.name}`);
    }

    /**
     * Start a new profile by clearing all highlights
     */
    async newProfile(): Promise<void> {
        const choice = await vscode.window.showWarningMessage(
            'Clear all current highlights and start a new profile?',
            { modal: true },
            'Yes',
            'No'
        );

        if (choice !== 'Yes') {
            return;
        }

        // Clear all highlights
        this.clearAllCallback();
        
        vscode.window.showInformationMessage('New profile started. Add highlights and save when ready.');
    }

    /**
     * Merge highlights from another profile into the current highlightMap
     * Does not replace existing highlights - only adds new ones
     */
    async mergeProfile(): Promise<void> {
        const profiles = await this.listProfiles();
        
        if (profiles.length === 0) {
            vscode.window.showInformationMessage('No saved profiles found to merge.');
            return;
        }

        // Format profile list for QuickPick
        const items = profiles.map(profile => ({
            label: profile.name,
            description: profile.lastModified.toLocaleString(),
            profile
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a profile to merge into current highlights'
        });

        if (!selected) {
            return;
        }

        try {
            const filePath = selected.profile.path;
            const content = fs.readFileSync(filePath, 'utf-8');
            const data = JSON.parse(content);
            
            // Handle both new format (with metadata) and legacy format (array)
            const highlights = Array.isArray(data) ? data : data.highlights;
            
            if (!highlights || highlights.length === 0) {
                vscode.window.showInformationMessage('Profile is empty, nothing to merge.');
                return;
            }

            let addedCount = 0;
            let skippedCount = 0;

            // Add highlights that don't already exist
            for (const item of highlights) {
                if (!this.state.highlightMap.has(item.pattern)) {
                    this.addHighlightCallback(item.pattern, {
                        color: item.color,
                        mode: item.mode || 'text'
                    });
                    addedCount++;
                } else {
                    skippedCount++;
                }
            }

            this.triggerUpdateCallback();

            const message = skippedCount > 0
                ? `Merged ${addedCount} highlight(s) from "${selected.profile.name}" (skipped ${skippedCount} duplicate(s))`
                : `Merged ${addedCount} highlight(s) from "${selected.profile.name}"`;
            
            vscode.window.showInformationMessage(message);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to merge profile: ${error}`);
        }
    }

    /**
     * Duplicate an existing profile with a new name
     */
    async duplicateProfile(): Promise<void> {
        const profiles = await this.listProfiles();
        
        if (profiles.length === 0) {
            vscode.window.showInformationMessage('No saved profiles found to duplicate.');
            return;
        }

        // Select profile to duplicate
        const items = profiles.map(profile => ({
            label: profile.name,
            description: profile.lastModified.toLocaleString(),
            profile
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a profile to duplicate'
        });

        if (!selected) {
            return;
        }

        // Get new name
        const newName = await vscode.window.showInputBox({
            prompt: 'Enter name for the duplicated profile',
            value: `${selected.profile.name}-copy`,
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return 'Profile name cannot be empty';
                }
                if (value.includes('/') || value.includes('\\')) {
                    return 'Profile name cannot contain / or \\ characters';
                }
                return null;
            }
        });

        if (!newName) {
            return;
        }

        try {
            const savePath = this.getSavePath();
            if (!savePath) {
                return;
            }

            const sourcePath = selected.profile.path;
            const destPath = path.join(savePath, `${newName}.json`);

            // Read source profile
            const content = fs.readFileSync(sourcePath, 'utf-8');
            const data = JSON.parse(content);

            // Update metadata if present
            if (data.metadata) {
                data.metadata.created = new Date().toISOString();
                data.metadata.modified = new Date().toISOString();
            }

            // Write to new file
            fs.writeFileSync(destPath, JSON.stringify(data, null, 2));
            
            vscode.window.showInformationMessage(`Profile duplicated as "${newName}"`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to duplicate profile: ${error}`);
        }
    }

    /**
     * Load a built-in template profile
     */
    async loadTemplate(): Promise<void> {
        const templates = [
            {
                label: '📝 TODO Markers',
                description: 'Common task annotations',
                highlights: [
                    { pattern: 'TODO', color: 'yellow', mode: 'whole' },
                    { pattern: 'FIXME', color: 'red', mode: 'whole' },
                    { pattern: 'HACK', color: 'orange', mode: 'whole' },
                    { pattern: 'NOTE', color: 'blue', mode: 'whole' },
                    { pattern: 'XXX', color: 'pink', mode: 'whole' }
                ]
            },
            {
                label: '🐛 Error & Debugging',
                description: 'Error handling and debug statements',
                highlights: [
                    { pattern: 'console.log', color: 'cyan', mode: 'text' },
                    { pattern: 'console.error', color: 'red', mode: 'text' },
                    { pattern: 'console.warn', color: 'orange', mode: 'text' },
                    { pattern: 'debugger', color: 'pink', mode: 'whole' },
                    { pattern: 'ERROR', color: 'red', mode: 'whole' },
                    { pattern: 'WARNING', color: 'orange', mode: 'whole' }
                ]
            },
            {
                label: '⚠️ Security & Performance',
                description: 'Potential issues to review',
                highlights: [
                    { pattern: 'SECURITY', color: 'red', mode: 'whole' },
                    { pattern: 'PERFORMANCE', color: 'yellow', mode: 'whole' },
                    { pattern: 'DEPRECATED', color: 'orange', mode: 'whole' },
                    { pattern: 'REVIEW', color: 'purple', mode: 'whole' }
                ]
            }
        ];

        const selected = await vscode.window.showQuickPick(templates, {
            placeHolder: 'Select a template to load'
        });

        if (!selected) {
            return;
        }

        // Ask if they want to replace or merge
        const action = await vscode.window.showQuickPick(
            [
                { label: '➕ Merge', description: 'Add to current highlights', value: 'merge' },
                { label: '🔄 Replace', description: 'Clear all and use only template', value: 'replace' }
            ],
            { placeHolder: 'How do you want to load this template?' }
        );

        if (!action) {
            return;
        }

        // Clear if replacing
        if (action.value === 'replace') {
            this.clearAllCallback();
        }

        // Add template highlights
        let addedCount = 0;
        for (const item of selected.highlights) {
            if (!this.state.highlightMap.has(item.pattern)) {
                this.addHighlightCallback(item.pattern, {
                    color: item.color,
                    mode: item.mode as HighlightMode
                });
                addedCount++;
            }
        }

        this.triggerUpdateCallback();
        
        const actionText = action.value === 'replace' ? 'Loaded' : 'Merged';
        vscode.window.showInformationMessage(`${actionText} template: ${selected.label.substring(2)} (${addedCount} highlight(s))`);
    }
}
