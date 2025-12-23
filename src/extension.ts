import * as vscode from 'vscode';
import * as path from 'path';
import { HighlightState } from './state';
import { HighlightManager } from './highlighting';
import { ProfileManager } from './profileManager';
import { StatusBarManager } from './statusBar';
import {
    HighlightMode,
    PALETTE,
    PALETTE_KEYS,
    stripUnmatchedDelimiters,
    getModeLabel as getModeLabelUtil,
    getNextMode,
    parseNoiseWords,
    isNoiseWord as isNoiseWordUtil
} from './utils';

// --- Helper: Generate SVG Icons ---
function getIconUri(color: string, shape: 'rect' | 'circle' = 'rect'): vscode.Uri {
    let svgBody = '';
    if (shape === 'rect') {
        svgBody = `<rect width="16" height="16" fill="${color}" rx="3" ry="3"/>`;
    } else {
        svgBody = `<circle cx="8" cy="8" r="7" fill="${color}"/>`;
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16">${svgBody}</svg>`;
    return vscode.Uri.parse(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`);
}

export function activate(context: vscode.ExtensionContext) {
    console.log('Extension is activating...');

    // --- Initialize Components ---
    const state = new HighlightState();
    const statusBar = new StatusBarManager(state);
    const highlightManager = new HighlightManager(state, () => statusBar.update());
    const profileManager = new ProfileManager(
        context,
        state,
        (pattern, details) => highlightManager.addHighlight(pattern, details),
        () => highlightManager.clearAll(),
        () => highlightManager.triggerUpdate(),
        () => statusBar.update()
    );

    // Register status bar for disposal
    context.subscriptions.push(statusBar.getStatusBarItem());

    // Initialize history with empty state
    state.pushHistory();

    // --- Helper Functions ---

    function getConfiguration() {
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

    function isNoiseWord(word: string): boolean {
        const config = getConfiguration();
        return isNoiseWordUtil(word, config.excludeNoiseWords);
    }

    function getColorValue(colorKey: string): string {
        const kind = vscode.window.activeColorTheme.kind;
        const isLightTheme = kind === vscode.ColorThemeKind.Light || kind === vscode.ColorThemeKind.HighContrastLight;
        const paletteItem = PALETTE[colorKey];
        return paletteItem ? (isLightTheme ? paletteItem.light : paletteItem.dark) : colorKey;
    }

    // --- Commands ---

    const showMenuWithModifiers = vscode.commands.registerCommand('multiScopeHighlighter.showMenuWithModifiers', async () => {
        // Check if Ctrl (or Cmd on Mac) was held during click
        // Note: VS Code doesn't provide modifier info directly, so we check activeTextEditor
        // as a workaround. For now, we'll use a simple toggle approach.
        // User can also access via Command Palette
        await vscode.commands.executeCommand('multiScopeHighlighter.showMenu');
    });

    const showMenu = vscode.commands.registerCommand('multiScopeHighlighter.showMenu', async () => {
        const quickPick = vscode.window.createQuickPick();
        quickPick.title = 'Multi-Scope Highlighter Menu';
        quickPick.placeholder = 'Select an action (ESC to close)';

        const generateItems = () => {
            const config = getConfiguration();
            const contrastLabel = config.contrast === 'force-contrast' ? 'B&W' : 'Auto';
            const opacityPct = Math.round(config.opacity * 100);
            const scopeLabel = state.isGlobalScope ? 'All Open Files' : 'Single File';

            let styleLabel = 'Fill';
            if (state.styleMode === 'box') {
                styleLabel = 'Box';
            }
            if (state.styleMode === 'hybrid') {
                styleLabel = 'Hybrid';
            }

            return [
                {
                    label: '🖍️ Manage Highlights',
                    description: `${state.highlightMap.size} active`,
                    detail: 'Edit text, change colors, or delete specific highlights'
                },
                {
                    label: '🔭 Scope',
                    description: scopeLabel,
                    detail: 'Toggle between highlighting the active file or all open files'
                },
                {
                    label: '🎭 Style',
                    description: styleLabel,
                    detail: 'Cycle visual style: Fill -> Hybrid -> Box'
                },
                {
                    label: '💧 Opacity',
                    description: `${opacityPct}%`,
                    detail: 'Set the transparency of the highlight background'
                },
                {
                    label: '🌗 Contrast',
                    description: contrastLabel,
                    detail: 'Toggle between syntax highlighting and high-contrast text'
                },
                {
                    label: '📁 Profiles',
                    description: state.currentProfileName ? `Current: ${state.currentProfileName}` : 'No profile loaded',
                    detail: 'Manage saved highlight profiles'
                },
                {
                    label: '⌨️ Keyboard Shortcuts',
                    description: '',
                    detail: 'View all keybindings for this extension'
                },
                {
                    label: '�️ Disable All',
                    description: state.highlightsDisabled ? 'Currently disabled' : 'Currently enabled',
                    detail: 'Temporarily hide/show all highlights without clearing data'
                },
                {
                    label: '�🔥 Clear All',
                    description: '',
                    detail: 'Remove all active highlights immediately'
                }
            ];
        };

        quickPick.items = generateItems();

        quickPick.onDidAccept(async () => {
            const selected = quickPick.selectedItems[0];
            if (!selected) {
                return;
            }

            if (selected.label.includes('Manage Highlights')) {
                quickPick.dispose();
                await vscode.commands.executeCommand('multiScopeHighlighter.manageHighlights');
                vscode.commands.executeCommand('multiScopeHighlighter.showMenu');

            } else if (selected.label.includes('Opacity')) {
                quickPick.dispose();
                await vscode.commands.executeCommand('multiScopeHighlighter.setOpacity');
                vscode.commands.executeCommand('multiScopeHighlighter.showMenu');

            } else if (selected.label.includes('Scope')) {
                vscode.commands.executeCommand('multiScopeHighlighter.toggleScope');
                quickPick.items = generateItems();

            } else if (selected.label.includes('Style')) {
                vscode.commands.executeCommand('multiScopeHighlighter.toggleStyle');
                quickPick.items = generateItems();

            } else if (selected.label.includes('Contrast')) {
                await vscode.commands.executeCommand('multiScopeHighlighter.toggleContrast');
                quickPick.items = generateItems();

            } else if (selected.label.includes('Save Profile')) {
                quickPick.dispose();
                await vscode.commands.executeCommand('multiScopeHighlighter.saveProfile');

            } else if (selected.label.includes('Profiles')) {
                quickPick.dispose();
                await vscode.commands.executeCommand('multiScopeHighlighter.showProfileMenu');

            } else if (selected.label.includes('Keyboard Shortcuts')) {
                quickPick.dispose();
                await vscode.commands.executeCommand('multiScopeHighlighter.showKeybindings');
                vscode.commands.executeCommand('multiScopeHighlighter.showMenu');

            } else if (selected.label.includes('Disable All')) {
                vscode.commands.executeCommand('multiScopeHighlighter.toggleDisableAll');
                quickPick.items = generateItems();

            } else if (selected.label.includes('Clear All')) {
                vscode.commands.executeCommand('multiScopeHighlighter.clearAll');
                quickPick.dispose();
            }
        });

        const disposable = vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('multiScopeHighlighter')) {
                quickPick.items = generateItems();
            }
        });
        quickPick.onDidHide(() => disposable.dispose());

        quickPick.show();
    });

    const showProfileMenu = vscode.commands.registerCommand('multiScopeHighlighter.showProfileMenu', async () => {
        const quickPick = vscode.window.createQuickPick();
        quickPick.title = 'Profile Management';
        quickPick.placeholder = 'Select a profile action (ESC to close)';

        const generateItems = () => [
            {
                label: '💾 Save Profile',
                description: state.currentProfileName ? `(${state.currentProfileName})` : '',
                detail: 'Save current highlights to a JSON file'
            },
            {
                label: '📂 Load Profile',
                description: '',
                detail: 'Load highlights from a saved JSON file'
            },
            {
                label: '🔄 Switch Profile',
                description: '',
                detail: 'Quick switch to a different saved profile'
            },
            {
                label: '✨ New Profile',
                description: '',
                detail: 'Clear all highlights and start a new profile'
            },
            {
                label: '➕ Merge Profile',
                description: '',
                detail: 'Add highlights from another profile to current'
            },
            {
                label: '📝 Load Template',
                description: '',
                detail: 'Load pre-configured highlight patterns'
            },
            {
                label: '📋 Duplicate Profile',
                description: '',
                detail: 'Create a copy of an existing profile'
            },
            {
                label: '🗑️ Delete Profile',
                description: '',
                detail: 'Delete a saved profile file'
            }
        ];

        quickPick.items = generateItems();

        quickPick.onDidAccept(async () => {
            const selected = quickPick.selectedItems[0];
            if (!selected) {
                return;
            }

            if (selected.label.includes('Save Profile')) {
                quickPick.dispose();
                await vscode.commands.executeCommand('multiScopeHighlighter.saveProfile');

            } else if (selected.label.includes('Load Profile')) {
                quickPick.dispose();
                await vscode.commands.executeCommand('multiScopeHighlighter.loadProfile');

            } else if (selected.label.includes('Switch Profile')) {
                quickPick.dispose();
                await vscode.commands.executeCommand('multiScopeHighlighter.switchProfile');

            } else if (selected.label.includes('New Profile')) {
                quickPick.dispose();
                await vscode.commands.executeCommand('multiScopeHighlighter.newProfile');

            } else if (selected.label.includes('Merge Profile')) {
                quickPick.dispose();
                await vscode.commands.executeCommand('multiScopeHighlighter.mergeProfile');

            } else if (selected.label.includes('Load Template')) {
                quickPick.dispose();
                await vscode.commands.executeCommand('multiScopeHighlighter.loadTemplate');

            } else if (selected.label.includes('Duplicate Profile')) {
                quickPick.dispose();
                await vscode.commands.executeCommand('multiScopeHighlighter.duplicateProfile');

            } else if (selected.label.includes('Delete Profile')) {
                quickPick.dispose();
                await vscode.commands.executeCommand('multiScopeHighlighter.deleteProfile');
            }
        });

        quickPick.show();
    });

    const toggleHighlight = vscode.commands.registerCommand('multiScopeHighlighter.toggleHighlight', () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }

        // Save state before making changes
        state.pushHistory();

        // Support column selection mode by processing all selections
        const selections = editor.selections;
        const allSelectedTexts = selections
            .map(sel => editor.document.getText(sel))
            .filter(text => text && text.trim().length > 0);

        if (allSelectedTexts.length === 0) {
            // No text selected: check if cursor is inside any highlighted range
            const cursorPosition = editor.selection.active;
            const cursorOffset = editor.document.offsetAt(cursorPosition);
            const documentText = editor.document.getText();

            // Check all highlights to see if cursor is inside any of them
            for (const [pattern, details] of state.highlightMap.entries()) {
                let foundAtCursor = false;

                if (details.mode === 'text') {
                    // Plain text search
                    const len = pattern.length;
                    if (len === 0) {
                        continue;
                    }

                    let index = documentText.indexOf(pattern);
                    while (index !== -1) {
                        const endIndex = index + len;
                        if (cursorOffset >= index && cursorOffset <= endIndex) {
                            foundAtCursor = true;
                            break;
                        }
                        index = documentText.indexOf(pattern, endIndex);
                    }
                } else {
                    // Regex / Whole Word Mode
                    const regex = details.cachedRegex;
                    if (regex) {
                        regex.lastIndex = 0;
                        let match;
                        while ((match = regex.exec(documentText))) {
                            const startIndex = match.index;
                            const endIndex = match.index + match[0].length;
                            if (cursorOffset >= startIndex && cursorOffset <= endIndex) {
                                foundAtCursor = true;
                                break;
                            }
                        }
                    }
                }

                if (foundAtCursor) {
                    highlightManager.removeHighlight(pattern);
                    vscode.window.showInformationMessage(`Removed highlight: "${pattern}"`);
                    highlightManager.triggerUpdate();
                    return;
                }
            }

            // No existing highlight found at cursor - try to get word at cursor and add it
            const wordRange = editor.document.getWordRangeAtPosition(cursorPosition);
            if (wordRange) {
                const word = editor.document.getText(wordRange);
                if (word) {
                    highlightManager.addHighlight(word);
                    vscode.window.showInformationMessage(`Highlighted: "${word}"`);
                    highlightManager.triggerUpdate();
                    return;
                }
            }

            vscode.window.showInformationMessage('No text selected');
            return;
        }

        // Text is selected: check if any selection overlaps with any existing highlight
        const documentText = editor.document.getText();

        // Build array of all selection ranges for overlap checking
        const selectionRanges = selections.map(sel => ({
            start: editor.document.offsetAt(sel.start),
            end: editor.document.offsetAt(sel.end),
            text: editor.document.getText(sel)
        }));

        // Check if any selection overlaps with existing highlights
        for (const [pattern, details] of state.highlightMap.entries()) {
            if (details.mode === 'text') {
                // Plain text search
                const len = pattern.length;
                if (len === 0) {
                    continue;
                }

                let index = documentText.indexOf(pattern);
                while (index !== -1) {
                    const highlightStart = index;
                    const highlightEnd = index + len;

                    // Check if any selection overlaps with this highlight
                    for (const range of selectionRanges) {
                        if (!(range.end < highlightStart || range.start > highlightEnd)) {
                            // Overlap detected - for column mode with multiple selections,
                            // just remove the highlight (simpler behavior)
                            highlightManager.removeHighlight(pattern);
                            vscode.window.showInformationMessage(`Removed highlight: "${pattern}"`);
                            highlightManager.triggerUpdate();
                            return;
                        }
                    }

                    index = documentText.indexOf(pattern, highlightEnd);
                }
            } else {
                // Regex / Whole Word Mode
                const regex = details.cachedRegex;
                if (regex) {
                    regex.lastIndex = 0;
                    let match;
                    while ((match = regex.exec(documentText))) {
                        const highlightStart = match.index;
                        const highlightEnd = match.index + match[0].length;

                        // Check if any selection overlaps with this highlight
                        for (const range of selectionRanges) {
                            if (!(range.end < highlightStart || range.start > highlightEnd)) {
                                // Overlap detected - remove the highlight
                                highlightManager.removeHighlight(pattern);
                                vscode.window.showInformationMessage(`Removed highlight: "${pattern}"`);
                                highlightManager.triggerUpdate();
                                return;
                            }
                        }
                    }
                }
            }
        }

        // No overlap found - add all unique selected texts as highlights (excluding noise words)
        const uniqueTexts = new Set(allSelectedTexts.map(text => stripUnmatchedDelimiters(text.trim())));
        let addedCount = 0;
        let filteredCount = 0;

        for (const cleanedText of uniqueTexts) {
            if (cleanedText && !state.highlightMap.has(cleanedText)) {
                if (isNoiseWord(cleanedText)) {
                    filteredCount++;
                } else {
                    highlightManager.addHighlight(cleanedText);
                    addedCount++;
                }
            }
        }

        if (addedCount > 0) {
            if (addedCount === 1) {
                const msg = filteredCount > 0
                    ? `Highlighted: "${Array.from(uniqueTexts).find(t => !isNoiseWord(t))}" (filtered ${filteredCount} noise word(s))`
                    : `Highlighted: "${Array.from(uniqueTexts).find(t => !isNoiseWord(t))}"`;
                vscode.window.showInformationMessage(msg);
            } else {
                const msg = filteredCount > 0
                    ? `Highlighted ${addedCount} unique text(s) (filtered ${filteredCount} noise word(s))`
                    : `Highlighted ${addedCount} unique text(s)`;
                vscode.window.showInformationMessage(msg);
            }
        } else if (filteredCount > 0) {
            vscode.window.showInformationMessage(`Filtered ${filteredCount} noise word(s) - nothing to highlight`);
        }
        highlightManager.triggerUpdate();
    });

    const highlightWords = vscode.commands.registerCommand('multiScopeHighlighter.highlightWords', () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }

        // Save state before making changes
        state.pushHistory();

        // Support column selection mode by processing all selections
        const selections = editor.selections;

        // Collect all selected text from all selections (for column mode)
        const allSelectedTexts = selections
            .map(sel => editor.document.getText(sel))
            .filter(text => text && text.trim().length > 0);

        if (allSelectedTexts.length === 0) {
            // No text selected: highlight the word at cursor position
            const cursorPosition = editor.selection.active;
            const wordRange = editor.document.getWordRangeAtPosition(cursorPosition);

            if (!wordRange) {
                vscode.window.showInformationMessage('No word found at cursor position.');
                return;
            }

            const word = editor.document.getText(wordRange);
            if (word) {
                highlightManager.addHighlight(word);
                vscode.window.showInformationMessage(`Highlighted: "${word}"`);
            }
        } else {
            // Text selected: check if any highlights exist within any selection range
            const documentText = editor.document.getText();
            const highlightsToRemove: string[] = [];

            // Build array of all selection ranges for overlap checking
            const selectionRanges = selections.map(sel => ({
                start: editor.document.offsetAt(sel.start),
                end: editor.document.offsetAt(sel.end)
            }));

            // Check all existing highlights to see if they appear in any selection
            for (const [pattern, details] of state.highlightMap.entries()) {
                let foundInSelection = false;

                if (details.mode === 'text') {
                    // Plain text search
                    const len = pattern.length;
                    if (len > 0) {
                        let index = documentText.indexOf(pattern);
                        while (index !== -1 && !foundInSelection) {
                            const highlightStart = index;
                            const highlightEnd = index + len;

                            // Check if highlight is inside any selection
                            for (const range of selectionRanges) {
                                if (highlightStart >= range.start && highlightEnd <= range.end) {
                                    foundInSelection = true;
                                    break;
                                }
                            }

                            index = documentText.indexOf(pattern, highlightEnd);
                        }
                    }
                } else {
                    // Regex / Whole Word Mode
                    const regex = details.cachedRegex;
                    if (regex) {
                        regex.lastIndex = 0;
                        let match;
                        while ((match = regex.exec(documentText)) && !foundInSelection) {
                            const highlightStart = match.index;
                            const highlightEnd = match.index + match[0].length;

                            // Check if highlight is inside any selection
                            for (const range of selectionRanges) {
                                if (highlightStart >= range.start && highlightEnd <= range.end) {
                                    foundInSelection = true;
                                    break;
                                }
                            }
                        }
                    }
                }

                if (foundInSelection) {
                    highlightsToRemove.push(pattern);
                }
            }

            // Remove all found highlights
            if (highlightsToRemove.length > 0) {
                highlightsToRemove.forEach(p => highlightManager.removeHighlight(p));
                const suffix = highlightsToRemove.length === 1
                    ? `"${highlightsToRemove[0]}"`
                    : `${highlightsToRemove.length} highlights`;
                vscode.window.showInformationMessage(`Removed ${suffix}`);
                highlightManager.triggerUpdate();
                return;
            }

            // No highlights in selection: split all text by whitespace and add each word
            const allWords = allSelectedTexts.flatMap(text => text.split(/\s+/));
            const uniqueWords = new Set(
                allWords
                    .map(w => stripUnmatchedDelimiters(w.trim()))
                    .filter(w => w.length > 0)
            );

            let addedCount = 0;
            let filteredCount = 0;

            for (const word of uniqueWords) {
                if (!state.highlightMap.has(word)) {
                    if (isNoiseWord(word)) {
                        filteredCount++;
                    } else {
                        highlightManager.addHighlight(word);
                        addedCount++;
                    }
                }
            }

            if (addedCount > 0) {
                const msg = filteredCount > 0
                    ? `Highlighted ${addedCount} word(s) (filtered ${filteredCount} noise word(s))`
                    : `Highlighted ${addedCount} word(s)`;
                vscode.window.showInformationMessage(msg);
            } else if (filteredCount > 0) {
                vscode.window.showInformationMessage(`Filtered ${filteredCount} noise word(s) - nothing to highlight`);
            }
        }
        highlightManager.triggerUpdate();
    });

    const clearAll = vscode.commands.registerCommand('multiScopeHighlighter.clearAll', () => {
        state.pushHistory();
        highlightManager.clearAll();
        highlightManager.triggerUpdate();
    });

    const undoHighlight = vscode.commands.registerCommand('multiScopeHighlighter.undo', () => {
        if (state.undo()) {
            highlightManager.refresh();
            statusBar.update();
            vscode.window.showInformationMessage('Undo highlight change');
        } else {
            vscode.window.showInformationMessage('No more undo history');
        }
    });

    const redoHighlight = vscode.commands.registerCommand('multiScopeHighlighter.redo', () => {
        if (state.redo()) {
            highlightManager.refresh();
            statusBar.update();
            vscode.window.showInformationMessage('Redo highlight change');
        } else {
            vscode.window.showInformationMessage('No more redo history');
        }
    });

    const toggleScope = vscode.commands.registerCommand('multiScopeHighlighter.toggleScope', () => {
        state.isGlobalScope = !state.isGlobalScope;
        statusBar.update();
        if (!state.isGlobalScope) {
            const activeEditor = vscode.window.activeTextEditor;
            vscode.window.visibleTextEditors.forEach(editor => {
                if (editor !== activeEditor) {
                    state.decorationMap.forEach(dec => editor.setDecorations(dec, []));
                }
            });
            if (activeEditor) {
                highlightManager.applyDecorations(activeEditor);
            }
        } else {
            highlightManager.triggerUpdate();
        }
    });

    const toggleStyle = vscode.commands.registerCommand('multiScopeHighlighter.toggleStyle', () => {
        if (state.styleMode === 'fill') {
            state.styleMode = 'hybrid';
        } else if (state.styleMode === 'hybrid') {
            state.styleMode = 'box';
        } else {
            state.styleMode = 'fill';
        }
        statusBar.update();
        highlightManager.refresh();
    });

    const setOpacity = vscode.commands.registerCommand('multiScopeHighlighter.setOpacity', async () => {
        const picks = ['0.1', '0.2', '0.35', '0.5', '0.75', '1.0'];
        const selected = await vscode.window.showQuickPick(picks, {
            placeHolder: 'Select Highlight Opacity (0.1 = Transparent, 1.0 = Solid)'
        });
        if (selected) {
            const val = parseFloat(selected);
            await vscode.workspace.getConfiguration('multiScopeHighlighter').update('fillOpacity', val, vscode.ConfigurationTarget.Global);
        }
    });

    const toggleContrast = vscode.commands.registerCommand('multiScopeHighlighter.toggleContrast', async () => {
        const config = vscode.workspace.getConfiguration('multiScopeHighlighter');
        const current = config.get<string>('textContrast', 'inherit');
        const next = current === 'inherit' ? 'force-contrast' : 'inherit';
        await config.update('textContrast', next, vscode.ConfigurationTarget.Global);
    });

    const toggleDisableAll = vscode.commands.registerCommand('multiScopeHighlighter.toggleDisableAll', () => {
        highlightManager.toggleDisableAll();
    });

    const saveProfile = vscode.commands.registerCommand('multiScopeHighlighter.saveProfile', async () => {
        await profileManager.saveProfile();
    });

    const activateProfile = vscode.commands.registerCommand('multiScopeHighlighter.loadProfile', async () => {
        await profileManager.activateProfile();
    });

    const deleteProfile = vscode.commands.registerCommand('multiScopeHighlighter.deleteProfile', async () => {
        await profileManager.deleteProfile();
    });

    const switchProfile = vscode.commands.registerCommand('multiScopeHighlighter.switchProfile', async () => {
        await profileManager.switchProfile();
    });

    const newProfile = vscode.commands.registerCommand('multiScopeHighlighter.newProfile', async () => {
        await profileManager.newProfile();
    });

    const mergeProfile = vscode.commands.registerCommand('multiScopeHighlighter.mergeProfile', async () => {
        await profileManager.mergeProfile();
    });

    const duplicateProfile = vscode.commands.registerCommand('multiScopeHighlighter.duplicateProfile', async () => {
        await profileManager.duplicateProfile();
    });

    const loadTemplate = vscode.commands.registerCommand('multiScopeHighlighter.loadTemplate', async () => {
        await profileManager.loadTemplate();
    });

    const manageHighlights = vscode.commands.registerCommand('multiScopeHighlighter.manageHighlights', () => {
        return new Promise<void>((resolve) => {
            if (state.highlightMap.size === 0) {
                vscode.window.showInformationMessage('No active highlights to manage.');
                resolve();
                return;
            }

            const quickPick = vscode.window.createQuickPick<vscode.QuickPickItem & { pattern: string }>();
            quickPick.title = "Manage Highlights";
            quickPick.placeholder = "Click row to Color. Buttons: [Edit] [Mode] [Delete]";

            let isEditing = false;

            // Resolve the promise when this menu closes
            quickPick.onDidHide(() => {
                if (!isEditing) {
                    quickPick.dispose();
                    resolve();
                }
            });

            const getModeIcon = (mode: HighlightMode) => {
                if (mode === 'regex') {
                    return new vscode.ThemeIcon('regex');
                }
                if (mode === 'whole') {
                    return new vscode.ThemeIcon('whole-word');
                }
                return new vscode.ThemeIcon('symbol-text');
            };

            const getModeLabel = getModeLabelUtil;

            const refreshItems = () => {
                const items = Array.from(state.highlightMap.entries()).map(([pattern, details]) => {
                    const visualColor = getColorValue(details.color);
                    const colorName = PALETTE[details.color] ? details.color : 'Custom';

                    return {
                        label: pattern,
                        description: `[${getModeLabel(details.mode)}] • ${colorName}`,
                        pattern: pattern,
                        iconPath: getIconUri(visualColor, 'rect'),
                        buttons: [
                            { iconPath: new vscode.ThemeIcon('edit'), tooltip: 'Edit Pattern' },
                            { iconPath: getModeIcon(details.mode), tooltip: `Current: ${getModeLabel(details.mode)}. Click to Cycle.` },
                            { iconPath: new vscode.ThemeIcon('trash'), tooltip: 'Delete' }
                        ]
                    };
                });
                quickPick.items = items;
            };

            refreshItems();

            quickPick.onDidChangeSelection(async (selection) => {
                if (!selection[0]) {
                    return;
                }
                const pattern = selection[0].pattern;
                isEditing = true; // prevent resolve on temporary hide

                const usedColors = new Set<string>();
                state.highlightMap.forEach((details, key) => {
                    if (key !== pattern) {
                        usedColors.add(details.color);
                    }
                });

                let availableKeys = PALETTE_KEYS.filter(key => !usedColors.has(key));
                if (availableKeys.length === 0) {
                    availableKeys = PALETTE_KEYS;
                }

                const colorPicker = vscode.window.createQuickPick();
                colorPicker.title = `Pick Color for '${pattern}'`;

                colorPicker.items = availableKeys.map(key => ({
                    label: key,
                    iconPath: getIconUri(getColorValue(key), 'circle')
                }));

                colorPicker.onDidAccept(() => {
                    const selected = colorPicker.selectedItems[0];
                    if (selected) {
                        const oldDetails = state.highlightMap.get(pattern);
                        if (oldDetails) {
                            highlightManager.addHighlight(pattern, { ...oldDetails, color: selected.label });
                            highlightManager.triggerUpdate();
                        }
                    }
                    colorPicker.hide();
                });

                colorPicker.onDidHide(() => {
                    colorPicker.dispose();
                    isEditing = false;
                    refreshItems();
                    quickPick.show(); // return to manager
                });

                quickPick.hide();
                colorPicker.show();
                quickPick.selectedItems = [];
            });

            quickPick.onDidTriggerItemButton(async (e) => {
                const pattern = e.item.pattern;
                const details = state.highlightMap.get(pattern);
                if (!details) {
                    return;
                }
                const tooltip = e.button.tooltip || '';

                if (tooltip === 'Delete') {
                    highlightManager.removeHighlight(pattern);
                    refreshItems();
                    highlightManager.triggerUpdate();
                    if (state.highlightMap.size === 0) {
                        isEditing = false;
                        quickPick.hide();
                        resolve();
                    }

                } else if (tooltip.includes('Click to Cycle')) {
                    const newMode = getNextMode(details.mode);
                    highlightManager.addHighlight(pattern, { ...details, mode: newMode });
                    refreshItems();
                    highlightManager.triggerUpdate();

                } else if (tooltip === 'Edit Pattern') {
                    isEditing = true;
                    quickPick.hide();

                    const newPattern = await vscode.window.showInputBox({
                        value: pattern,
                        prompt: `Edit pattern (${details.mode})`,
                        validateInput: (val) => {
                            if (details.mode === 'regex') {
                                try {
                                    new RegExp(val);
                                    return null;
                                }
                                catch (err) {
                                    return 'Invalid Regex Pattern';
                                }
                            }
                            return null;
                        }
                    });

                    if (newPattern && newPattern !== pattern) {
                        const entries = Array.from(state.highlightMap.entries());
                        const index = entries.findIndex(([k]) => k === pattern);
                        if (index !== -1) {
                            // 1. Dispose old
                            state.decorationMap.get(pattern)?.dispose();
                            state.decorationMap.delete(pattern);

                            // 2. Update Map Order
                            entries[index] = [newPattern, details];
                            state.highlightMap.clear();
                            entries.forEach(([p, d]) => state.highlightMap.set(p, d));

                            // 3. Add new decoration
                            highlightManager.addHighlight(newPattern, details);

                            highlightManager.triggerUpdate();
                        }
                    }
                    isEditing = false;
                    refreshItems();
                    quickPick.show();
                }
            });

            quickPick.show();
        });
    });

    const showKeybindings = vscode.commands.registerCommand('multiScopeHighlighter.showKeybindings', async () => {
        const isMac = process.platform === 'darwin';

        const keybindings = [
            {
                label: '$(symbol-key) Toggle Highlight',
                description: isMac ? '⌥Q' : 'Alt+Q',
                detail: 'Toggle highlight for selected text or word at cursor'
            },
            {
                label: '$(symbol-key) Highlight Words',
                description: isMac ? '⇧⌥Q' : 'Shift+Alt+Q',
                detail: 'Highlight individual words from selection (split by whitespace)'
            },
            {
                label: '$(symbol-key) Undo',
                description: isMac ? '⌘⌥Z' : 'Ctrl+Alt+Z',
                detail: 'Undo last highlight change'
            },
            {
                label: '$(symbol-key) Redo',
                description: isMac ? '⌘⌥Y' : 'Ctrl+Alt+Y',
                detail: 'Redo last highlight change'
            },
            {
                label: '$(info) Status Bar',
                description: 'Click 🌈 icon',
                detail: 'Open main menu (you are here!)'
            }
        ];

        const selected = await vscode.window.showQuickPick(keybindings, {
            title: 'Multi-Scope Highlighter - Keyboard Shortcuts',
            placeHolder: 'All available keybindings for this extension',
            matchOnDescription: true,
            matchOnDetail: true
        });

        // If user selected a keybinding item, optionally open keyboard shortcuts
        if (selected && selected.label.includes('Status Bar')) {
            // Do nothing, just informational
        }
    });

    // --- Event Listeners ---

    vscode.window.onDidChangeActiveColorTheme(() => {
        highlightManager.refresh();
    }, null, context.subscriptions);

    vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor) {
            highlightManager.triggerUpdate();
        }
    }, null, context.subscriptions);

    vscode.workspace.onDidChangeTextDocument(event => {
        if (state.isGlobalScope) {
            const editor = vscode.window.visibleTextEditors.find(e => e.document === event.document);
            if (editor) {
                highlightManager.applyDecorations(editor);
            }
        } else {
            const activeEditor = vscode.window.activeTextEditor;
            if (activeEditor && event.document === activeEditor.document) {
                highlightManager.applyDecorations(activeEditor);
            }
        }
    }, null, context.subscriptions);

    vscode.window.onDidChangeVisibleTextEditors(editors => {
        if (state.isGlobalScope) {
            editors.forEach(e => highlightManager.applyDecorations(e));
        }
    }, null, context.subscriptions);

    vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('multiScopeHighlighter')) {
            statusBar.update();
            highlightManager.refresh();
        }
    }, null, context.subscriptions);

    context.subscriptions.push(
        toggleHighlight,
        highlightWords,
        clearAll,
        undoHighlight,
        redoHighlight,
        toggleScope,
        saveProfile,
        activateProfile,
        deleteProfile,
        switchProfile,
        newProfile,
        mergeProfile,
        duplicateProfile,
        loadTemplate,
        manageHighlights,
        toggleStyle,
        setOpacity,
        toggleContrast,
        toggleDisableAll,
        showMenu,
        showMenuWithModifiers,
        showProfileMenu,
        showKeybindings
    );
}

export function deactivate() { }
