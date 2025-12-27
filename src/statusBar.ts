import * as vscode from 'vscode';
import { HighlightState } from './state';
import { debugLog } from './utils';

/**
 * Manages the status bar items that display highlight count and profile indicators
 */
export class StatusBarManager {
    private mainStatusBar: vscode.StatusBarItem;
    private profileStatusBars: Map<string, vscode.StatusBarItem> = new Map();
    private disposables: vscode.Disposable[] = [];
    private isUpdating: boolean = false;

    constructor(
        private state: HighlightState,
        private getProfileMetadata?: (profileName: string) => { color?: string } | undefined,
        private getAllProfiles?: () => Promise<Array<{ name: string; scope: 'workspace' | 'global'; color?: string }>>
    ) {
        this.mainStatusBar = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100
        );
        this.mainStatusBar.command = 'multiScopeHighlighter.showMenu';
        this.mainStatusBar.tooltip = "Multi-Scope Highlighter\n\nClick: Main Menu\nCtrl+Alt+Q: Profile Menu";
        this.update();
    }

    /**
     * Convert hex color to closest colored circle emoji
     */
    private getColorEmoji(hexColor?: string): string {
        if (!hexColor) {
            return '⚪';
        }

        // Map hex colors to their closest emoji representation
        const colorMap: { [key: string]: string } = {
            '#FF5555': '🔴',
            '#FF9955': '🟠',
            '#FFFF55': '🟡',
            '#55FF55': '🟢',
            '#5555FF': '🔵',
            '#FF55FF': '🟣',
            '#AA7744': '🟤',
            '#AAAAAA': '⚫'
        };

        return colorMap[hexColor.toUpperCase()] || '⚪';
    }

/**
     * Update status bar items to show highlight count and clickable profile indicators
     */
    async update(): Promise<void> {
        // Prevent concurrent updates
        if (this.isUpdating) {
            debugLog('[StatusBar] Update skipped: Already updating');
            return;
        }
        this.isUpdating = true;

        try {
            const count = this.state.highlightMap.size;
            debugLog(`[StatusBar] Starting update. Active highlights: ${count}. Disabled? ${this.state.highlightsDisabled}`);
            
            const countText = count > 0 ? ` ${count}` : '';
            
            // Update main status bar (count + rainbow icon)
            this.mainStatusBar.text = `🌈${countText}`;
            this.mainStatusBar.command = this.state.highlightsDisabled 
                ? 'multiScopeHighlighter.toggleDisableAll'
                : 'multiScopeHighlighter.showMenu';
            this.mainStatusBar.tooltip = this.state.highlightsDisabled
                ? "Multi-Scope Highlighter (Disabled)\n\nClick to enable highlighting"
                : "Multi-Scope Highlighter\n\nClick: Main Menu\nCtrl+Alt+Q: Profile Menu";
            this.mainStatusBar.show();
            
            // Dispose old profile status bars
            this.profileStatusBars.forEach(item => item.dispose());
            this.profileStatusBars.clear();
            
            // Get all profiles if available
            if (!this.getAllProfiles) {
                debugLog('[StatusBar] getAllProfiles callback not defined');
                return;
            }

            const allProfiles = await this.getAllProfiles();
            debugLog(`[StatusBar] Raw profiles fetched: ${allProfiles.length}`, allProfiles.map(p => `${p.name} (${p.scope})`));
            
            // Show all profiles when highlighting is enabled, hide all when globally disabled
            const profilesToShow = this.state.highlightsDisabled 
                ? []
                : allProfiles;
            
            // Separate into workspace (local) and global profiles
            const workspaceProfiles = profilesToShow.filter(p => p.scope === 'workspace');
            const globalProfiles = profilesToShow.filter(p => p.scope === 'global');
            
            debugLog(`[StatusBar] Render list -> Global: ${globalProfiles.length}, Workspace: ${workspaceProfiles.length}`);

            // Priority counter - global profiles on the right (higher priority), workspace on the left (lower priority)
            let priority = 99;
            
            // Show global profiles first (they appear on the right)
            globalProfiles.forEach(profile => {
                debugLog(`[StatusBar] Rendering GLOBAL profile: ${profile.name}`);
                
                const isActive = this.state.activeProfileName === profile.name;
                const isEnabled = this.state.enabledProfiles.has(profile.name);
                
                const colorEmoji = this.getColorEmoji(profile.color);
                const symbol = isActive ? '◆' : (isEnabled ? '●' : '○');
                
                // Create main profile indicator (color + symbol)
                const mainBar = vscode.window.createStatusBarItem(
                    vscode.StatusBarAlignment.Right,
                    priority
                );
                mainBar.text = `${colorEmoji}${symbol}`;
                
                // --- DEBUGGING COLOR ASSIGNMENT ---
                mainBar.backgroundColor = undefined; 
                mainBar.color = new vscode.ThemeColor('statusBarItem.remoteBackground');
                // ----------------------------------
                
                const statusText = isActive ? 'Active' : (isEnabled ? 'Enabled' : 'Available');
                mainBar.tooltip = `${statusText} [Global]: ${profile.name}\n[MANAGE]`;
                mainBar.command = {
                    command: 'multiScopeHighlighter.manageProfile',
                    title: 'Manage Profile',
                    arguments: [profile.name, isActive]
                };                
                mainBar.show();
                this.profileStatusBars.set(`global:${profile.name}`, mainBar);
                
                // Create toggle button (appears immediately to the left)
                const toggleBar = vscode.window.createStatusBarItem(
                    vscode.StatusBarAlignment.Right,
                    priority - 0.5
                );
                const toggleText = isActive ? '[A]' : (isEnabled ? '[E]' : '[·]');
                toggleBar.text = toggleText;

                // --- DEBUGGING COLOR ASSIGNMENT ---
                toggleBar.backgroundColor = undefined;
                toggleBar.color = new vscode.ThemeColor('statusBarItem.remoteBackground');
                // ----------------------------------

                toggleBar.tooltip = isActive 
                    ? `Active [Global]: ${profile.name}\n[DISABLE]`
                    : (isEnabled 
                        ? `Enabled [Global]: ${profile.name}\n[DISABLE]`
                        : `Available [Global]: ${profile.name}\n[ENABLE]`);
                toggleBar.command = {
                    command: 'multiScopeHighlighter.quickToggleProfile',
                    title: 'Toggle Profile',
                    arguments: [profile.name, isActive, isEnabled]
                };                
                toggleBar.show();
                this.profileStatusBars.set(`global:${profile.name}:toggle`, toggleBar);
                
                priority -= 1;
            });
            
            // Show workspace profiles (they appear on the left)
            workspaceProfiles.forEach(profile => {
                // debugLog(`[StatusBar] Rendering WORKSPACE profile: ${profile.name}`);
                // ... (existing workspace logic)
                 const isActive = this.state.activeProfileName === profile.name;
                const isEnabled = this.state.enabledProfiles.has(profile.name);
                
                const colorEmoji = this.getColorEmoji(profile.color);
                const symbol = isActive ? '◆' : (isEnabled ? '●' : '○');
                
                // Create main profile indicator (color + symbol)
                const mainBar = vscode.window.createStatusBarItem(
                    vscode.StatusBarAlignment.Right,
                    priority
                );
                mainBar.text = `${colorEmoji}${symbol}`;
                // No background color for workspace profiles (default)
                
                const statusText = isActive ? 'Active' : (isEnabled ? 'Enabled' : 'Available');
                mainBar.tooltip = `${statusText} [Workspace]: ${profile.name}\n[MANAGE]`;
                mainBar.command = {
                    command: 'multiScopeHighlighter.manageProfile',
                    title: 'Manage Profile',
                    arguments: [profile.name, isActive]
                };
                mainBar.show();
                this.profileStatusBars.set(`workspace:${profile.name}`, mainBar);
                
                // Create toggle button (appears immediately to the left)
                const toggleBar = vscode.window.createStatusBarItem(
                    vscode.StatusBarAlignment.Right,
                    priority - 0.5
                );
                const toggleText = isActive ? '[A]' : (isEnabled ? '[E]' : '[·]');
                toggleBar.text = toggleText;
                toggleBar.tooltip = isActive 
                    ? `Active [Workspace]: ${profile.name}\n[DISABLE]`
                    : (isEnabled 
                        ? `Enabled [Workspace]: ${profile.name}\n[DISABLE]`
                        : `Available [Workspace]: ${profile.name}\n[ENABLE]`);
                toggleBar.command = {
                    command: 'multiScopeHighlighter.quickToggleProfile',
                    title: 'Toggle Profile',
                    arguments: [profile.name, isActive, isEnabled]
                };
                toggleBar.show();
                this.profileStatusBars.set(`workspace:${profile.name}:toggle`, toggleBar);
                
                priority -= 1;
            });

        } catch (e) {
            console.error('[StatusBar] Error during update:', e);
        } finally {
            this.isUpdating = false;
        }
    }

    /**
     * Get all status bar items for registration with context.subscriptions
     */
    getStatusBarItems(): vscode.StatusBarItem[] {
        return [this.mainStatusBar, ...Array.from(this.profileStatusBars.values())];
    }

    /**
     * Dispose of all status bar items
     */
    dispose(): void {
        this.mainStatusBar.dispose();
        this.profileStatusBars.forEach(item => item.dispose());
        this.profileStatusBars.clear();
        this.disposables.forEach(d => d.dispose());
    }
}
