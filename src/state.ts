import * as vscode from 'vscode';
import {
    StyleMode,
    HighlightDetails,
    HistoryState,
    ProfileMetadata,
    DecorationMap,
    HighlightMap
} from './types';

/**
 * Centralized state management for the extension
 * Handles all mutable state including decorations, highlights, and undo/redo
 */
export class HighlightState {
    // Core state
    decorationMap: DecorationMap = new Map();
    highlightMap: HighlightMap = new Map();

    isGlobalScope: boolean = false;
    styleMode: StyleMode = 'hybrid';
    colorIndex: number = 0; // Legacy - kept for backward compatibility
    currentProfile: ProfileMetadata | null = null; // New metadata tracking
    currentProfileName?: string;
    activeProfileName?: string; // The profile being actively edited
    enabledProfiles: Set<string> = new Set(); // Profiles currently visible (read-only overlays)
    highlightsDisabled: boolean = false; // Global toggle to hide all highlights

    // Performance optimization: debounce timer
    updateTimeout?: NodeJS.Timeout;

    // Undo/Redo state
    private historyStack: HistoryState[] = [];
    private historyIndex: number = -1;
    private readonly MAX_HISTORY = 50;

    /**
     * Capture current state snapshot for undo/redo
     */
    captureState(): HistoryState {
        return {
            highlightMap: new Map(this.highlightMap),
            colorIndex: this.colorIndex
        };
    }

    /**
     * Push current state to history stack
     */
    pushHistory(): void {
        // Remove any redo history if we're not at the end
        if (this.historyIndex < this.historyStack.length - 1) {
            this.historyStack = this.historyStack.slice(0, this.historyIndex + 1);
        }

        // Add current state to history
        this.historyStack.push(this.captureState());

        // Limit history size
        if (this.historyStack.length > this.MAX_HISTORY) {
            this.historyStack.shift();
        } else {
            this.historyIndex++;
        }
    }

    /**
     * Restore state from history (used by undo/redo)
     * Note: Caller is responsible for refreshing decorations after restore
     */
    restoreState(state: HistoryState): void {
        // Clear current decorations
        this.decorationMap.forEach(dec => dec.dispose());
        this.decorationMap.clear();

        // Restore highlight map and color index
        this.highlightMap = new Map(state.highlightMap);
        this.colorIndex = state.colorIndex;
    }

    /**
     * Undo to previous state
     * Returns true if undo was performed, false if nothing to undo
     */
    undo(): boolean {
        if (this.historyIndex > 0) {
            this.historyIndex--;
            this.restoreState(this.historyStack[this.historyIndex]);
            return true;
        }
        return false;
    }

    /**
     * Redo to next state
     * Returns true if redo was performed, false if nothing to redo
     */
    redo(): boolean {
        if (this.historyIndex < this.historyStack.length - 1) {
            this.historyIndex++;
            this.restoreState(this.historyStack[this.historyIndex]);
            return true;
        }
        return false;
    }

    /**
     * Check if undo is available
     */
    canUndo(): boolean {
        return this.historyIndex > 0;
    }

    /**
     * Check if redo is available
     */
    canRedo(): boolean {
        return this.historyIndex < this.historyStack.length - 1;
    }

    /**
     * Clear all state and dispose decorations
     */
    clear(): void {
        this.decorationMap.forEach(d => d.dispose());
        this.decorationMap.clear();
        this.highlightMap.clear();
        this.colorIndex = 0;
        this.currentProfileName = undefined;
        this.historyStack = [];
        this.historyIndex = -1;
    }

    /**
     * Dispose of all resources
     */
    dispose(): void {
        if (this.updateTimeout) {
            clearTimeout(this.updateTimeout);
        }
        this.decorationMap.forEach(d => d.dispose());
        this.decorationMap.clear();
    }
}
