import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

// --- Types ---
type HighlightMode = 'text' | 'whole' | 'regex';

interface HighlightDetails {
    color: string;
    mode: HighlightMode;
}

interface AdaptiveColor {
    dark: string;
    light: string;
}

// --- Adaptive Color Palette ---
const PALETTE: Record<string, AdaptiveColor> = {
    'Neon Yellow':   { dark: 'rgba(255, 255, 0, 0.8)',    light: 'rgba(204, 204, 0, 0.6)' },
    'Neon Green':    { dark: 'rgba(57, 255, 20, 0.8)',    light: 'rgba(0, 128, 0, 0.5)' },
    'Cyan':          { dark: 'rgba(0, 255, 255, 0.8)',    light: 'rgba(0, 139, 139, 0.5)' },
    'Magenta':       { dark: 'rgba(255, 0, 255, 0.8)',    light: 'rgba(139, 0, 139, 0.5)' },
    'Bright Orange': { dark: 'rgba(255, 165, 0, 0.8)',    light: 'rgba(255, 140, 0, 0.5)' },
    'Hot Pink':      { dark: 'rgba(255, 105, 180, 0.8)',  light: 'rgba(199, 21, 133, 0.5)' },
    'Red':           { dark: 'rgba(255, 0, 0, 0.8)',      light: 'rgba(220, 20, 60, 0.5)' },
    'Lime':          { dark: 'rgba(124, 252, 0, 0.8)',    light: 'rgba(50, 205, 50, 0.5)' },
    'Dodger Blue':   { dark: 'rgba(30, 144, 255, 0.8)',   light: 'rgba(0, 0, 255, 0.4)' },
    'Purple':        { dark: 'rgba(186, 85, 211, 0.8)',   light: 'rgba(128, 0, 128, 0.5)' },
    'Teal':          { dark: 'rgba(64, 224, 208, 0.8)',   light: 'rgba(0, 128, 128, 0.5)' },
    'Gold':          { dark: 'rgba(255, 215, 0, 0.8)',    light: 'rgba(184, 134, 11, 0.5)' },
    'Salmon':        { dark: 'rgba(250, 128, 114, 0.8)',  light: 'rgba(165, 42, 42, 0.5)' },
    'Sky Blue':      { dark: 'rgba(135, 206, 235, 0.8)',  light: 'rgba(70, 130, 180, 0.5)' },
    'Orchid':        { dark: 'rgba(218, 112, 214, 0.8)',  light: 'rgba(148, 0, 211, 0.5)' },
    'Spring Green':  { dark: 'rgba(0, 255, 127, 0.8)',    light: 'rgba(34, 139, 34, 0.5)' },
    'Tomato':        { dark: 'rgba(255, 99, 71, 0.8)',    light: 'rgba(178, 34, 34, 0.5)' },
    'Khaki':         { dark: 'rgba(240, 230, 140, 0.8)',  light: 'rgba(189, 183, 107, 0.5)' },
    'Lavender':      { dark: 'rgba(230, 230, 250, 0.8)',  light: 'rgba(100, 100, 100, 0.3)' },
    'Slate Blue':    { dark: 'rgba(106, 90, 205, 0.8)',   light: 'rgba(72, 61, 139, 0.5)' }
};

const PALETTE_KEYS = Object.keys(PALETTE);

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

    // --- State Management ---
    let decorationMap: Map<string, vscode.TextEditorDecorationType> = new Map();
    let highlightMap: Map<string, HighlightDetails> = new Map();

    let isGlobalScope = false; 
    let isOutlineMode = false;
    let colorIndex = 0;
    let currentProfileName: string | undefined = undefined;

    // --- Status Bar Items ---
    
    // 1. Scope Indicator (Priority 100)
    const scopeStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    scopeStatusBar.command = 'multiScopeHighlighter.toggleScope';
    scopeStatusBar.tooltip = "Click to toggle Scope (Single File vs All Open Files)";
    context.subscriptions.push(scopeStatusBar);

    // 2. Style Indicator (Priority 99 - sits to the right of Scope)
    const styleStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
    styleStatusBar.command = 'multiScopeHighlighter.toggleStyle';
    styleStatusBar.tooltip = "Click to toggle Style (Solid Fill vs Outline Box)";
    context.subscriptions.push(styleStatusBar);

    updateStatusBars();

    // --- Helper Functions ---

    function getColorValue(colorKey: string): string {
        if (PALETTE[colorKey]) {
            const kind = vscode.window.activeColorTheme.kind;
            if (kind === vscode.ColorThemeKind.Light || kind === vscode.ColorThemeKind.HighContrastLight) {
                return PALETTE[colorKey].light;
            } else {
                return PALETTE[colorKey].dark;
            }
        }
        return colorKey;
    }

    function updateStatusBars() {
        // Scope Bar
        const scopeText = isGlobalScope ? 'All Open' : 'Single';
        scopeStatusBar.text = `$(files) Scope: ${scopeText}`;
        scopeStatusBar.show();

        // Style Bar
        const styleText = isOutlineMode ? 'Box' : 'Fill';
        styleStatusBar.text = `$(paintcan) Style: ${styleText}`;
        styleStatusBar.show();
    }

    function getNextColorKey(): string {
        const key = PALETTE_KEYS[colorIndex % PALETTE_KEYS.length];
        colorIndex++;
        return key;
    }

    function triggerUpdate() {
        if (isGlobalScope) {
            vscode.window.visibleTextEditors.forEach(editor => applyDecorations(editor));
        } else {
            const activeEditor = vscode.window.activeTextEditor;
            if (activeEditor) {
                applyDecorations(activeEditor);
            }
        }
    }

    function applyDecorations(editor: vscode.TextEditor) {
        const text = editor.document.getText();

        decorationMap.forEach((decorationType, pattern) => {
            const details = highlightMap.get(pattern);
            if (!details) return;

            const ranges: vscode.Range[] = [];
            let regex: RegExp | null = null;

            try {
                if (details.mode === 'regex') {
                    regex = new RegExp(pattern, 'g');
                } else if (details.mode === 'whole') {
                    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    regex = new RegExp(`\\b${escaped}\\b`, 'g');
                } else {
                    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    regex = new RegExp(escaped, 'g');
                }
            } catch (e) {
                return; 
            }

            if (regex) {
                let match;
                while ((match = regex.exec(text))) {
                    const startPos = editor.document.positionAt(match.index);
                    const endPos = editor.document.positionAt(match.index + match[0].length);
                    ranges.push(new vscode.Range(startPos, endPos));
                }
            }
            editor.setDecorations(decorationType, ranges);
        });
    }

    function addHighlight(pattern: string, details?: Partial<HighlightDetails>) {
        const existingDecoration = decorationMap.get(pattern);
        if (existingDecoration) {
            existingDecoration.dispose();
        }

        const colorKey = details?.color || getNextColorKey();
        const mode = details?.mode || 'text';
        const finalColor = getColorValue(colorKey);

        const decorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: isOutlineMode ? 'transparent' : finalColor,
            border: isOutlineMode ? `2px solid ${finalColor}` : undefined,
            borderRadius: isOutlineMode ? '2px' : undefined,
            overviewRulerColor: finalColor,
            overviewRulerLane: vscode.OverviewRulerLane.Right
        });

        decorationMap.set(pattern, decorationType);
        highlightMap.set(pattern, { color: colorKey, mode });
    }

    function removeHighlight(pattern: string) {
        const decoration = decorationMap.get(pattern);
        if (decoration) {
            decoration.dispose();
            decorationMap.delete(pattern);
            highlightMap.delete(pattern);
        }
    }

    function clearAllHighlights() {
        decorationMap.forEach(d => d.dispose());
        decorationMap.clear();
        highlightMap.clear();
        colorIndex = 0;
        currentProfileName = undefined;
    }

    function refreshAllDecorations() {
        const entries = Array.from(highlightMap.entries());
        decorationMap.forEach(d => d.dispose());
        decorationMap.clear();
        entries.forEach(([pattern, details]) => {
            addHighlight(pattern, details);
        });
        triggerUpdate();
    }

    function getSavePath(): string | undefined {
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

    // --- Commands ---

    const toggleHighlight = vscode.commands.registerCommand('multiScopeHighlighter.toggleHighlight', () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { return; }

        const selection = editor.selection;
        const text = editor.document.getText(selection);

        if (!text) {
            vscode.window.showInformationMessage('No text selected');
            return;
        }

        if (highlightMap.has(text)) {
            removeHighlight(text);
        } else {
            addHighlight(text);
        }
        triggerUpdate();
    });

    const clearAll = vscode.commands.registerCommand('multiScopeHighlighter.clearAll', () => {
        clearAllHighlights();
    });

    const toggleScope = vscode.commands.registerCommand('multiScopeHighlighter.toggleScope', () => {
        isGlobalScope = !isGlobalScope;
        updateStatusBars();
        if (!isGlobalScope) {
            const activeEditor = vscode.window.activeTextEditor;
            vscode.window.visibleTextEditors.forEach(editor => {
                if (editor !== activeEditor) {
                    decorationMap.forEach(dec => editor.setDecorations(dec, []));
                }
            });
            if (activeEditor) applyDecorations(activeEditor);
        } else {
            triggerUpdate();
        }
    });

    const toggleStyle = vscode.commands.registerCommand('multiScopeHighlighter.toggleStyle', () => {
        isOutlineMode = !isOutlineMode;
        updateStatusBars();
        refreshAllDecorations();
    });

    const saveProfile = vscode.commands.registerCommand('multiScopeHighlighter.saveProfile', async () => {
        if (highlightMap.size === 0) {
            vscode.window.showWarningMessage('No highlights to save.');
            return;
        }
        const savePath = getSavePath();
        if (!savePath) { return; }

        const name = await vscode.window.showInputBox({
            prompt: 'Enter name for this highlight profile',
            value: currentProfileName || ''
        });
        if (!name) { return; }

        const exportData = Array.from(highlightMap.entries()).map(([pattern, details]) => ({
            pattern,
            color: details.color,
            mode: details.mode
        }));
        
        const filePath = path.join(savePath, `${name}.json`);
        fs.writeFileSync(filePath, JSON.stringify(exportData, null, 2));

        currentProfileName = name;
        vscode.window.showInformationMessage(`Profile saved as '${name}'`);
    });

    const loadProfile = vscode.commands.registerCommand('multiScopeHighlighter.loadProfile', async () => {
        const savePath = getSavePath();
        if (!savePath) { return; }
        if (!fs.existsSync(savePath)) {
            vscode.window.showErrorMessage('No highlight profiles found.');
            return;
        }
        const files = fs.readdirSync(savePath).filter(f => f.endsWith('.json'));
        if (files.length === 0) return;

        const selected = await vscode.window.showQuickPick(files, { placeHolder: 'Select a profile to load' });
        if (!selected) { return; }

        const filePath = path.join(savePath, selected);
        const content = fs.readFileSync(filePath, 'utf-8');

        try {
            interface SavedItem { word?: string; pattern?: string; color: string; mode?: HighlightMode }
            const data: SavedItem[] = JSON.parse(content);
            clearAllHighlights();

            data.forEach(item => {
                const pat = item.pattern || item.word || '';
                if (pat) {
                    addHighlight(pat, { color: item.color, mode: item.mode || 'text' });
                }
            });

            currentProfileName = selected.replace('.json', '');
            triggerUpdate();
            vscode.window.showInformationMessage(`Profile '${currentProfileName}' loaded.`);
        } catch (e) {
            vscode.window.showErrorMessage('Failed to parse profile.');
        }
    });

    const deleteProfile = vscode.commands.registerCommand('multiScopeHighlighter.deleteProfile', async () => {
        const savePath = getSavePath();
        if (!savePath) { return; }
        const files = fs.readdirSync(savePath).filter(f => f.endsWith('.json'));
        if (files.length === 0) return;

        const selected = await vscode.window.showQuickPick(files, { placeHolder: 'Select a profile to DELETE' });
        if (!selected) return;

        try {
            fs.unlinkSync(path.join(savePath, selected));
            const deletedName = selected.replace('.json', '');
            if (currentProfileName === deletedName) currentProfileName = undefined;
            vscode.window.showInformationMessage(`Profile '${deletedName}' deleted.`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to delete: ${error}`);
        }
    });

    const manageHighlights = vscode.commands.registerCommand('multiScopeHighlighter.manageHighlights', () => {
        if (highlightMap.size === 0) {
            vscode.window.showInformationMessage('No active highlights to manage.');
            return;
        }

        const quickPick = vscode.window.createQuickPick<vscode.QuickPickItem & { pattern: string }>();
        quickPick.title = "Manage Highlights";
        quickPick.placeholder = "Click row to Color. Buttons: [Edit] [Mode] [Delete]";

        let isEditing = false;
        quickPick.onDidHide(() => {
            if (!isEditing) quickPick.dispose();
        });

        const getModeIcon = (mode: HighlightMode) => {
            if (mode === 'regex') return new vscode.ThemeIcon('regex');
            if (mode === 'whole') return new vscode.ThemeIcon('whole-word');
            return new vscode.ThemeIcon('symbol-text');
        };

        const getModeLabel = (mode: HighlightMode) => {
            if (mode === 'regex') return 'Regex';
            if (mode === 'whole') return 'Whole Word';
            return 'Text';
        };

        const refreshItems = () => {
            const items = Array.from(highlightMap.entries()).map(([pattern, details]) => {
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
            if (!selection[0]) return;
            const pattern = selection[0].pattern;
            isEditing = true;

            const usedColors = new Set<string>();
            highlightMap.forEach((details, key) => {
                if (key !== pattern) usedColors.add(details.color);
            });

            let availableKeys = PALETTE_KEYS.filter(key => !usedColors.has(key));
            if (availableKeys.length === 0) availableKeys = PALETTE_KEYS;

            const colorPicker = vscode.window.createQuickPick();
            colorPicker.title = `Pick Color for '${pattern}'`;
            
            colorPicker.items = availableKeys.map(key => ({
                label: key, 
                iconPath: getIconUri(getColorValue(key), 'circle') 
            }));

            colorPicker.onDidAccept(() => {
                const selected = colorPicker.selectedItems[0];
                if (selected) {
                    const oldDetails = highlightMap.get(pattern);
                    if (oldDetails) {
                        addHighlight(pattern, { ...oldDetails, color: selected.label });
                        triggerUpdate();
                    }
                }
                colorPicker.hide();
            });
            
            colorPicker.onDidHide(() => {
                colorPicker.dispose();
                isEditing = false;
                refreshItems();
                quickPick.show();
            });
            
            quickPick.hide();
            colorPicker.show();
            quickPick.selectedItems = [];
        });

        quickPick.onDidTriggerItemButton(async (e) => {
            const pattern = e.item.pattern;
            const details = highlightMap.get(pattern);
            if (!details) return;
            const tooltip = e.button.tooltip || '';

            if (tooltip === 'Delete') {
                removeHighlight(pattern);
                refreshItems();
                triggerUpdate();
                if (highlightMap.size === 0) { isEditing = false; quickPick.hide(); }
            
            } else if (tooltip.includes('Click to Cycle')) {
                let newMode: HighlightMode = 'text';
                if (details.mode === 'text') newMode = 'whole';
                else if (details.mode === 'whole') newMode = 'regex';
                addHighlight(pattern, { ...details, mode: newMode });
                refreshItems();
                triggerUpdate();

            } else if (tooltip === 'Edit Pattern') {
                isEditing = true;
                quickPick.hide();

                const newPattern = await vscode.window.showInputBox({
                    value: pattern,
                    prompt: `Edit pattern (${details.mode})`,
                    validateInput: (val) => {
                        if (details.mode === 'regex') {
                            try { new RegExp(val); return null; } 
                            catch (err) { return 'Invalid Regex Pattern'; }
                        }
                        return null;
                    }
                });

                if (newPattern && newPattern !== pattern) {
                    const entries = Array.from(highlightMap.entries());
                    const index = entries.findIndex(([k]) => k === pattern);
                    if (index !== -1) {
                        decorationMap.get(pattern)?.dispose();
                        decorationMap.delete(pattern);

                        const colorKey = details.color;
                        const finalColor = getColorValue(colorKey);

                        const newDec = vscode.window.createTextEditorDecorationType({
                            backgroundColor: isOutlineMode ? 'transparent' : finalColor,
                            border: isOutlineMode ? `2px solid ${finalColor}` : undefined,
                            borderRadius: isOutlineMode ? '2px' : undefined,
                            overviewRulerColor: finalColor,
                            overviewRulerLane: vscode.OverviewRulerLane.Right
                        });
                        decorationMap.set(newPattern, newDec);
                        entries[index] = [newPattern, details];
                        highlightMap.clear();
                        entries.forEach(([p, d]) => highlightMap.set(p, d));
                        triggerUpdate();
                    }
                }
                isEditing = false;
                refreshItems(); 
                quickPick.show();
            }
        });

        quickPick.show();
    });

    // --- Event Listeners ---
    
    vscode.window.onDidChangeActiveColorTheme(() => {
        refreshAllDecorations();
    }, null, context.subscriptions);

    vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor) triggerUpdate();
    }, null, context.subscriptions);

    vscode.workspace.onDidChangeTextDocument(event => {
        if (isGlobalScope) {
            const editor = vscode.window.visibleTextEditors.find(e => e.document === event.document);
            if (editor) applyDecorations(editor);
        } else {
            const activeEditor = vscode.window.activeTextEditor;
            if (activeEditor && event.document === activeEditor.document) {
                applyDecorations(activeEditor);
            }
        }
    }, null, context.subscriptions);

    vscode.window.onDidChangeVisibleTextEditors(editors => {
        if(isGlobalScope) editors.forEach(e => applyDecorations(e));
    }, null, context.subscriptions);

    context.subscriptions.push(toggleHighlight, clearAll, toggleScope, saveProfile, loadProfile, deleteProfile, manageHighlights, toggleStyle);
}

export function deactivate() {}