import * as vscode from 'vscode';
import { HighlightState } from './state';
import { HighlightDetails } from './types';
import {
    HighlightMode,
    PALETTE,
    applyOpacity,
    createHighlightRegex,
    getNextColorKey as getNextColorKeyUtil,
    parseNoiseWords
} from './utils';

/**
 * Configuration values from workspace settings
 */
interface HighlightConfig {
    opacity: number;
    contrast: string;
    maxLines: number;
    excludeNoiseWords: string[];
}

/**
 * Manages all highlighting operations including decoration creation,
 * pattern matching, and visual updates
 */
export class HighlightManager {
    constructor(
        private state: HighlightState,
        private statusBarUpdateCallback: () => void
    ) {}

    /**
     * Get current configuration from workspace settings
     */
    private getConfiguration(): HighlightConfig {
        const config = vscode.workspace.getConfiguration('multiScopeHighlighter');
        const noiseWordsStr = config.get<string>('excludeNoiseWords', '');
        const excludeNoiseWords = parseNoiseWords(noiseWordsStr);
        return {
            opacity: config.get<number>('fillOpacity', 0.35),
            contrast: config.get<string>('textContrast', 'inherit'),
            maxLines: config.get<number>('maxLinesForWholeFile', 10000),
            excludeNoiseWords: excludeNoiseWords
        };
    }

    /**
     * Get the next color key from the palette
     */
    private getNextColorKey(): string {
        const key = getNextColorKeyUtil(this.state.colorIndex);
        this.state.colorIndex++;
        return key;
    }

    /**
     * Debounced update trigger - applies decorations after a short delay
     */
    triggerUpdate(): void {
        if (this.state.updateTimeout) {
            clearTimeout(this.state.updateTimeout);
        }
        this.state.updateTimeout = setTimeout(() => {
            if (this.state.isGlobalScope) {
                vscode.window.visibleTextEditors.forEach(editor => this.applyDecorations(editor));
            } else {
                const activeEditor = vscode.window.activeTextEditor;
                if (activeEditor) {
                    this.applyDecorations(activeEditor);
                }
            }
        }, 75); // 75ms wait time
    }

    /**
     * Apply decorations to a specific editor
     * Handles large file optimization by only scanning visible ranges
     */
    applyDecorations(editor: vscode.TextEditor): void {
        const config = this.getConfiguration();

        // Large File Optimization:
        // If file is huge, only scan visible ranges. This kills lag but disables overview ruler for off-screen text.
        const isLargeFile = config.maxLines > 0 && editor.document.lineCount > config.maxLines;

        let text: string;
        let visibleOffset = 0;

        if (isLargeFile) {
            // Only get text for visible ranges (approximate for simplicity + small buffer)
            const ranges = editor.visibleRanges;
            // For simplicity in this optimization, we just handle the first primary range extended
            // Handling discontiguous ranges is complex for indexes, so we just take the full extent of visibility
            if (ranges.length === 0) {
                return;
            }

            const startLine = Math.max(0, ranges[0].start.line - 5);
            const endLine = Math.min(editor.document.lineCount - 1, ranges[ranges.length - 1].end.line + 5);
            const scanRange = new vscode.Range(startLine, 0, endLine, 1000);

            text = editor.document.getText(scanRange);
            visibleOffset = editor.document.offsetAt(scanRange.start);
        } else {
            text = editor.document.getText();
        }

        this.state.decorationMap.forEach((decorationType, pattern) => {
            const details = this.state.highlightMap.get(pattern);
            if (!details) {
                return;
            }

            const ranges: vscode.Range[] = [];

            // Optimization: Use indexOf for plain text (no regex overhead)
            if (details.mode === 'text') {
                const len = pattern.length;
                if (len === 0) {
                    return;
                }

                let index = text.indexOf(pattern);
                while (index !== -1) {
                    const startPos = editor.document.positionAt(visibleOffset + index);
                    const endPos = editor.document.positionAt(visibleOffset + index + len);
                    ranges.push(new vscode.Range(startPos, endPos));

                    // Move forward
                    index = text.indexOf(pattern, index + len);
                }

            } else {
                // Regex / Whole Word Mode
                // Use cached regex if available
                const regex = details.cachedRegex;
                if (regex) {
                    // Reset lastIndex because 'g' regexes are stateful
                    regex.lastIndex = 0;

                    let match;
                    while ((match = regex.exec(text))) {
                        const startPos = editor.document.positionAt(visibleOffset + match.index);
                        const endPos = editor.document.positionAt(visibleOffset + match.index + match[0].length);
                        ranges.push(new vscode.Range(startPos, endPos));
                    }
                }
            }

            editor.setDecorations(decorationType, ranges);
        });
    }

    /**
     * Add a new highlight pattern
     */
    addHighlight(pattern: string, details?: Partial<HighlightDetails>): void {
        const existingDecoration = this.state.decorationMap.get(pattern);
        if (existingDecoration) {
            existingDecoration.dispose();
        }

        const config = this.getConfiguration();
        const colorKey = details?.color || this.getNextColorKey();
        const mode = details?.mode || 'text';

        // Cache the Regex immediately if needed
        const cachedRegex = createHighlightRegex(pattern, mode);
        if ((mode === 'regex' || mode === 'whole') && cachedRegex === null) {
            vscode.window.showErrorMessage(`Invalid Regex: ${pattern}`);
            return;
        }

        // Setup Visuals
        const paletteItem = PALETTE[colorKey];
        const kind = vscode.window.activeColorTheme.kind;
        const isLight = (kind === vscode.ColorThemeKind.Light || kind === vscode.ColorThemeKind.HighContrastLight);
        const baseColorStr = paletteItem ? (isLight ? paletteItem.light : paletteItem.dark) : colorKey;

        const finalBgColor = applyOpacity(baseColorStr, config.opacity);
        const finalBorderColor = applyOpacity(baseColorStr, 1.0);

        let borderValue: string | undefined = undefined;
        let textColor: string | undefined = undefined;
        let effectiveBgColor = finalBgColor;

        if (this.state.styleMode === 'box') {
            effectiveBgColor = 'transparent';
            borderValue = `2px solid ${finalBorderColor}`;
        } else if (this.state.styleMode === 'hybrid') {
            borderValue = `1px solid ${finalBorderColor}`;
        } else {
            borderValue = undefined;
        }

        if (this.state.styleMode !== 'box' && config.contrast === 'force-contrast' && paletteItem) {
            textColor = paletteItem.text;
        }

        const decorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: effectiveBgColor,
            border: borderValue,
            borderRadius: '2px',
            color: textColor,
            overviewRulerColor: finalBgColor,
            overviewRulerLane: vscode.OverviewRulerLane.Right
        });

        this.state.decorationMap.set(pattern, decorationType);
        this.state.highlightMap.set(pattern, { color: colorKey, mode, cachedRegex });
        this.statusBarUpdateCallback();
    }

    /**
     * Remove a highlight pattern
     */
    removeHighlight(pattern: string): void {
        const decoration = this.state.decorationMap.get(pattern);
        if (decoration) {
            decoration.dispose();
            this.state.decorationMap.delete(pattern);
            this.state.highlightMap.delete(pattern);
            this.statusBarUpdateCallback();
        }
    }

    /**
     * Clear all highlights
     */
    clearAll(): void {
        this.state.decorationMap.forEach(d => d.dispose());
        this.state.decorationMap.clear();
        this.state.highlightMap.clear();
        this.state.colorIndex = 0;
        this.state.currentProfileName = undefined;
        this.state.currentProfile = null;
        this.statusBarUpdateCallback();
    }

    /**
     * Refresh all decorations (recreate them with current style settings)
     */
    refresh(): void {
        const entries = Array.from(this.state.highlightMap.entries());
        this.state.decorationMap.forEach(d => d.dispose());
        this.state.decorationMap.clear();
        entries.forEach(([pattern, details]) => {
            this.addHighlight(pattern, details);
        });
        this.triggerUpdate();
    }
}
