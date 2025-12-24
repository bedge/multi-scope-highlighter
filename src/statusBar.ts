import * as vscode from 'vscode';
import { HighlightState } from './state';

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
            return;
        }
        this.isUpdating = true;

        try {
            const count = this.state.highlightMap.size;
            const countText = count > 0 ? ` ${count}` : '';
            
            // Update main status bar (count + rainbow icon)
            this.mainStatusBar.text = `🌈${countText}`;
            this.mainStatusBar.show();
            
            // Dispose old profile status bars
            this.profileStatusBars.forEach(item => item.dispose());
            this.profileStatusBars.clear();
            
            // Get all profiles if available
            if (!this.getAllProfiles) {
                return;
            }

            const allProfiles = await this.getAllProfiles();
            
            // Show all profiles when highlighting is enabled, only active/enabled when disabled
            const profilesToShow = this.state.highlightsDisabled 
                ? allProfiles.filter(p => 
                    this.state.activeProfileName === p.name || this.state.enabledProfiles.has(p.name)
                  )
                : allProfiles;
            
            // Separate into workspace (local) and global profiles
            const workspaceProfiles = profilesToShow.filter(p => p.scope === 'workspace');
            const globalProfiles = profilesToShow.filter(p => p.scope === 'global');
            
            // Priority counter - global profiles on the right (higher priority), workspace on the left (lower priority)
            let priority = 99;
            
            // Show global profiles first (they appear on the right)
            globalProfiles.forEach(profile => {
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
                mainBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
                
                const statusText = isActive ? 'Active' : (isEnabled ? 'Enabled' : 'Available');
                mainBar.tooltip = `${statusText} [Global]: ${profile.name}\n\nClick to manage this profile`;
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
                toggleBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
                toggleBar.tooltip = isActive 
                    ? `Active [Global]: ${profile.name}\n\nClick to disable`
                    : (isEnabled 
                        ? `Enabled [Global]: ${profile.name}\n\nClick to disable`
                        : `Available [Global]: ${profile.name}\n\nClick to enable`);
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
                mainBar.tooltip = `${statusText} [Workspace]: ${profile.name}\n\nClick to manage this profile`;
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
                    ? `Active [Workspace]: ${profile.name}\n\nClick to disable`
                    : (isEnabled 
                        ? `Enabled [Workspace]: ${profile.name}\n\nClick to disable`
                        : `Available [Workspace]: ${profile.name}\n\nClick to enable`);
                toggleBar.command = {
                    command: 'multiScopeHighlighter.quickToggleProfile',
                    title: 'Toggle Profile',
                    arguments: [profile.name, isActive, isEnabled]
                };
                toggleBar.show();
                this.profileStatusBars.set(`workspace:${profile.name}:toggle`, toggleBar);
                
                priority -= 1;
            });
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
