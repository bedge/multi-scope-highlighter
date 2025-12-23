import * as vscode from 'vscode';
import { HighlightState } from './state';

/**
 * Manages the status bar item that displays highlight count and profile name
 */
export class StatusBarManager {
    private statusBar: vscode.StatusBarItem;

    constructor(private state: HighlightState) {
        this.statusBar = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100
        );
        this.statusBar.command = 'multiScopeHighlighter.showMenu';
        this.statusBar.tooltip = "Multi-Scope Highlighter\n\nClick: Main Menu\nCtrl+Alt+Q: Profile Menu";
        this.update();
    }

    /**
     * Update the status bar text to show highlight count and profile name
     */
    update(): void {
        const count = this.state.highlightMap.size;
        const countText = count > 0 ? ` ${count}` : '';
        const profileText = this.state.currentProfile 
            ? ` (${this.state.currentProfile.name})` 
            : '';
        this.statusBar.text = `🌈${countText}${profileText}`;
        this.statusBar.show();
    }

    /**
     * Get the status bar item for registration with context.subscriptions
     */
    getStatusBarItem(): vscode.StatusBarItem {
        return this.statusBar;
    }

    /**
     * Dispose of the status bar item
     */
    dispose(): void {
        this.statusBar.dispose();
    }
}
