import * as vscode from 'vscode';
import { HighlightMode } from './utils';

/**
 * Shared type definitions for the multi-scope-highlighter extension
 */

/** Visual style mode for highlights */
export type StyleMode = 'fill' | 'box' | 'hybrid';

/** Track the origin of a highlight */
export interface HighlightSource {
    type: 'manual' | 'profile';
    profileName?: string;  // Set when type === 'profile'
}

/** Details about a single highlight pattern */
export interface HighlightDetails {
    color: string;
    mode: HighlightMode;
    /** Optimization: Cache the regex so we don't rebuild it on every keystroke */
    cachedRegex?: RegExp | null;
    /** Track where this highlight came from (manual edit or profile) */
    source?: HighlightSource;
}

/** State snapshot for undo/redo functionality */
export interface HistoryState {
    highlightMap: Map<string, HighlightDetails>;
    colorIndex: number;
}

/** Metadata about a saved profile */
export interface ProfileMetadata {
    name: string;
    path: string;
    scope: 'workspace' | 'global';
    lastModified: Date;
    color?: string;  // User-assigned color for UI identification
}

/** Decoration map type for managing VS Code decorations */
export type DecorationMap = Map<string, vscode.TextEditorDecorationType>;

/** Highlight map type for tracking highlight configurations */
export type HighlightMap = Map<string, HighlightDetails>;
