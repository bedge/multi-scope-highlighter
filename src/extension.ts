import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

// --- Types ---
type HighlightMode = 'text' | 'whole' | 'regex';
type StyleMode = 'fill' | 'box' | 'hybrid';

interface HighlightDetails {
    color: string;
    mode: HighlightMode;
    // Optimization: Cache the regex so we don't rebuild it on every keystroke
    cachedRegex?: RegExp; 
}

interface AdaptiveColor {
    dark: string;
    light: string;
    text: string; // High contrast text color (Black/White)
}

// --- Adaptive Color Palette (Optimized for Dark Mode: Neon/Bold/Primary) ---
const PALETTE: Record<string, AdaptiveColor> = {
    'Neon Yellow':   { dark: 'rgba(255, 255, 0, 0.9)',    light: 'rgba(255, 255, 0, 0.5)',   text: '#000000' },
    'Electric Lime': { dark: 'rgba(0, 255, 0, 0.9)',      light: 'rgba(0, 255, 0, 0.5)',     text: '#000000' },
    'Cyan':          { dark: 'rgba(0, 255, 255, 0.9)',    light: 'rgba(0, 255, 255, 0.5)',   text: '#000000' },
    'Hot Pink':      { dark: 'rgba(255, 20, 147, 0.9)',   light: 'rgba(255, 20, 147, 0.5)',  text: '#FFFFFF' },
    'Bright Orange': { dark: 'rgba(255, 69, 0, 0.9)',     light: 'rgba(255, 165, 0, 0.5)',   text: '#FFFFFF' },
    'Vivid Red':     { dark: 'rgba(255, 0, 0, 0.9)',      light: 'rgba(255, 0, 0, 0.5)',     text: '#FFFFFF' },
    'Deep Sky Blue': { dark: 'rgba(0, 191, 255, 0.9)',    light: 'rgba(0, 191, 255, 0.5)',   text: '#000000' },
    'Magenta':       { dark: 'rgba(255, 0, 255, 0.9)',    light: 'rgba(255, 0, 255, 0.5)',   text: '#FFFFFF' },
    'Gold':          { dark: 'rgba(255, 215, 0, 0.9)',    light: 'rgba(255, 215, 0, 0.5)',   text: '#000000' },
    'Spring Green':  { dark: 'rgba(0, 255, 127, 0.9)',    light: 'rgba(0, 255, 127, 0.5)',   text: '#000000' },
    'Dark Violet':   { dark: 'rgba(148, 0, 211, 0.9)',    light: 'rgba(148, 0, 211, 0.5)',   text: '#FFFFFF' },
    'Crimson':       { dark: 'rgba(220, 20, 60, 0.9)',    light: 'rgba(220, 20, 60, 0.5)',   text: '#FFFFFF' },
    'Turquoise':     { dark: 'rgba(64, 224, 208, 0.9)',   light: 'rgba(64, 224, 208, 0.5)',  text: '#000000' },
    'Coral':         { dark: 'rgba(255, 127, 80, 0.9)',   light: 'rgba(255, 127, 80, 0.5)',  text: '#000000' },
    'Royal Blue':    { dark: 'rgba(65, 105, 225, 0.9)',   light: 'rgba(65, 105, 225, 0.5)',  text: '#FFFFFF' },
    'Chartreuse':    { dark: 'rgba(127, 255, 0, 0.9)',    light: 'rgba(127, 255, 0, 0.5)',   text: '#000000' },
    'Fuchsia':       { dark: 'rgba(255, 0, 255, 0.9)',    light: 'rgba(255, 0, 255, 0.5)',   text: '#FFFFFF' },
    'Aquamarine':    { dark: 'rgba(127, 255, 212, 0.9)',  light: 'rgba(127, 255, 212, 0.5)', text: '#000000' },
    'Tomato':        { dark: 'rgba(255, 99, 71, 0.9)',    light: 'rgba(255, 99, 71, 0.5)',   text: '#FFFFFF' },
    'Dodger Blue':   { dark: 'rgba(30, 144, 255, 0.9)',   light: 'rgba(30, 144, 255, 0.5)',  text: '#FFFFFF' }
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
    console.log('Extension is activating...'); // <--- BREAKPOINT HERE

    // --- State Management ---
    let decorationMap: Map<string, vscode.TextEditorDecorationType> = new Map();
    let highlightMap: Map<string, HighlightDetails> = new Map();

    let isGlobalScope = false; 
    let styleMode: StyleMode = 'hybrid'; 
    let colorIndex = 0;
    let currentProfileName: string | undefined = undefined;
    
    // Performance: Debounce timer
    let updateTimeout: NodeJS.Timeout | undefined = undefined;

    // --- Status Bar Item (Single) ---
    const mainStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    mainStatusBar.command = 'multiScopeHighlighter.showMenu';
    mainStatusBar.tooltip = "Multi-Scope Highlighter Main Menu";
    context.subscriptions.push(mainStatusBar);

    updateStatusBar();

    // --- Helper Functions ---

    function getConfiguration() {
        const config = vscode.workspace.getConfiguration('multiScopeHighlighter');
        return {
            opacity: config.get<number>('fillOpacity', 0.35),
            contrast: config.get<string>('textContrast', 'inherit'),
            maxLines: config.get<number>('maxLinesForWholeFile', 10000),
            excludeNoiseWords: config.get<string[]>('excludeNoiseWords', [])
        };
    }

    function isNoiseWord(word: string): boolean {
        if (!word || word.length === 0) {
            return true;
        }
        const config = getConfiguration();
        return config.excludeNoiseWords.includes(word);
    }

    function applyOpacity(rgbaColor: string, opacity: number): string {
        return rgbaColor.replace(/[\d.]+\)$/, `${opacity})`);
    }

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

    function updateStatusBar() {
        const count = highlightMap.size;
        const countText = count > 0 ? ` ${count}` : '';
        mainStatusBar.text = `🌈${countText}`;
        mainStatusBar.show();
    }

    function getNextColorKey(): string {
        const key = PALETTE_KEYS[colorIndex % PALETTE_KEYS.length];
        colorIndex++;
        return key;
    }

    function stripUnmatchedDelimiters(word: string): string {
        if (!word) {
            return word;
        }

        const pairs: Record<string, string> = {
            '(': ')',
            '[': ']',
            '{': '}',
            '"': '"',
            "'": "'",
            '`': '`',
            '*': '*',
            '~': '~',
            '_': '_',
            '.': '.'
        };

        let result = word;
        let changed = true;

        // Keep stripping until no more unmatched delimiters are found
        while (changed) {
            changed = false;
            
            if (result.length === 0) {
                break;
            }
            
            const first = result[0];
            const last = result[result.length - 1];

            // Check if first char is a delimiter and count consecutive occurrences
            if (first && pairs[first]) {
                const expectedClosing = pairs[first];
                
                // Count consecutive opening delimiters at start
                let openCount = 0;
                for (let i = 0; i < result.length && result[i] === first; i++) {
                    openCount++;
                }
                
                // Count consecutive closing delimiters at end
                let closeCount = 0;
                for (let i = result.length - 1; i >= 0 && result[i] === expectedClosing; i--) {
                    closeCount++;
                }
                
                // For symmetric delimiters, need to ensure we're not counting the same characters
                if (first === expectedClosing && openCount + closeCount >= result.length) {
                    // All characters are the same delimiter - this is ambiguous
                    // Strip from the start
                    if (openCount > 0) {
                        result = result.substring(openCount);
                        changed = true;
                        continue;
                    }
                }
                
                // Check if they're balanced
                if (openCount > 0 && closeCount > 0 && openCount === closeCount && result.length > openCount + closeCount) {
                    // Balanced - skip to next iteration to check inner content
                    // But first check if there are other unmatched delimiters
                    const inner = result.substring(openCount, result.length - closeCount);
                    if (inner.length === 0 || !Object.keys(pairs).includes(inner[0])) {
                        // No more delimiters to strip
                        break;
                    }
                    // Continue to check inner content (will be handled in next iteration)
                } else if (openCount > closeCount) {
                    // More opening than closing - strip excess opening
                    const excess = openCount - closeCount;
                    result = result.substring(excess);
                    changed = true;
                    continue;
                } else if (closeCount > openCount) {
                    // More closing than opening - strip excess closing
                    const excess = closeCount - openCount;
                    result = result.substring(0, result.length - excess);
                    changed = true;
                    continue;
                }
            }

            // Check if last char is a closing delimiter (but first is not its opening)
            const closingDelimiters = Object.values(pairs);
            if (last && closingDelimiters.includes(last)) {
                // Find the corresponding opening delimiter
                const openingDelimiter = Object.keys(pairs).find(key => pairs[key] === last);
                if (openingDelimiter && first !== openingDelimiter) {
                    // Unmatched closing delimiter(s) at the end
                    // Count consecutive closing delimiters
                    let closeCount = 0;
                    for (let i = result.length - 1; i >= 0 && result[i] === last; i--) {
                        closeCount++;
                    }
                    result = result.substring(0, result.length - closeCount);
                    changed = true;
                    continue;
                }
            }
        }

        return result;
    }

    // Optimization: Debounce the update trigger
    function triggerUpdate() {
        if (updateTimeout) {
            clearTimeout(updateTimeout);
        }
        updateTimeout = setTimeout(() => {
            if (isGlobalScope) {
                vscode.window.visibleTextEditors.forEach(editor => applyDecorations(editor));
            } else {
                const activeEditor = vscode.window.activeTextEditor;
                if (activeEditor) {
                    applyDecorations(activeEditor);
                }
            }
        }, 75); // 75ms wait time
    }

    function applyDecorations(editor: vscode.TextEditor) {
        const config = getConfiguration();
        
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

        decorationMap.forEach((decorationType, pattern) => {
            const details = highlightMap.get(pattern);
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

    function addHighlight(pattern: string, details?: Partial<HighlightDetails>) {
        const existingDecoration = decorationMap.get(pattern);
        if (existingDecoration) {
            existingDecoration.dispose();
        }

        const config = getConfiguration();
        const colorKey = details?.color || getNextColorKey();
        const mode = details?.mode || 'text';
        
        // Cache the Regex immediately if needed
        let cachedRegex: RegExp | undefined = undefined;
        try {
            if (mode === 'regex') {
                cachedRegex = new RegExp(pattern, 'g');
            } else if (mode === 'whole') {
                const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                cachedRegex = new RegExp(`\\b${escaped}\\b`, 'g');
            }
        } catch (e) {
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

        if (styleMode === 'box') {
            effectiveBgColor = 'transparent';
            borderValue = `2px solid ${finalBorderColor}`;
        } else if (styleMode === 'hybrid') {
            borderValue = `1px solid ${finalBorderColor}`;
        } else {
            borderValue = undefined;
        }

        if (styleMode !== 'box' && config.contrast === 'force-contrast' && paletteItem) {
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

        decorationMap.set(pattern, decorationType);
        highlightMap.set(pattern, { color: colorKey, mode, cachedRegex });
        updateStatusBar();
    }

    function removeHighlight(pattern: string) {
        const decoration = decorationMap.get(pattern);
        if (decoration) {
            decoration.dispose();
            decorationMap.delete(pattern);
            highlightMap.delete(pattern);
            updateStatusBar();
        }
    }

    function clearAllHighlights() {
        decorationMap.forEach(d => d.dispose());
        decorationMap.clear();
        highlightMap.clear();
        colorIndex = 0;
        currentProfileName = undefined;
        updateStatusBar();
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

    const showMenu = vscode.commands.registerCommand('multiScopeHighlighter.showMenu', async () => {
        const quickPick = vscode.window.createQuickPick();
        quickPick.title = 'Multi-Scope Highlighter Menu';
        quickPick.placeholder = 'Select an action (ESC to close)';

        const generateItems = () => {
            const config = getConfiguration();
            const contrastLabel = config.contrast === 'force-contrast' ? 'B&W' : 'Auto';
            const opacityPct = Math.round(config.opacity * 100);
            const scopeLabel = isGlobalScope ? 'All Open Files' : 'Single File';
            
            let styleLabel = 'Fill';
            if (styleMode === 'box') {
                styleLabel = 'Box';
            }
            if (styleMode === 'hybrid') {
                styleLabel = 'Hybrid';
            }

            return [
                { 
                    label: '🖍️ Manage Highlights', 
                    description: `${highlightMap.size} active`,
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
                    label: '💾 Save Profile', 
                    description: currentProfileName ? `(${currentProfileName})` : '',
                    detail: 'Save current highlights to a JSON file'
                },
                { 
                    label: '📂 Load Profile', 
                    description: '',
                    detail: 'Load highlights from a saved JSON file'
                },
                { 
                    label: '🔥 Clear All', 
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

            } else if (selected.label.includes('Load Profile')) {
                quickPick.dispose();
                await vscode.commands.executeCommand('multiScopeHighlighter.loadProfile');
                
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

    const toggleHighlight = vscode.commands.registerCommand('multiScopeHighlighter.toggleHighlight', () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { return; }

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
            for (const [pattern, details] of highlightMap.entries()) {
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
                    removeHighlight(pattern);
                    vscode.window.showInformationMessage(`Removed highlight: "${pattern}"`);
                    triggerUpdate();
                    return;
                }
            }
            
            // No existing highlight found at cursor - try to get word at cursor and add it
            const wordRange = editor.document.getWordRangeAtPosition(cursorPosition);
            if (wordRange) {
                const word = editor.document.getText(wordRange);
                if (word) {
                    addHighlight(word);
                    vscode.window.showInformationMessage(`Highlighted: "${word}"`);
                    triggerUpdate();
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
        for (const [pattern, details] of highlightMap.entries()) {
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
                            removeHighlight(pattern);
                            vscode.window.showInformationMessage(`Removed highlight: "${pattern}"`);
                            triggerUpdate();
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
                                removeHighlight(pattern);
                                vscode.window.showInformationMessage(`Removed highlight: "${pattern}"`);
                                triggerUpdate();
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
            if (cleanedText && !highlightMap.has(cleanedText)) {
                if (isNoiseWord(cleanedText)) {
                    filteredCount++;
                } else {
                    addHighlight(cleanedText);
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
        triggerUpdate();
    });

    const highlightWords = vscode.commands.registerCommand('multiScopeHighlighter.highlightWords', () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { return; }

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
                addHighlight(word);
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
            for (const [pattern, details] of highlightMap.entries()) {
                let foundInSelection = false;
                
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
                        
                        // Check if this highlight instance overlaps with any selection
                        for (const range of selectionRanges) {
                            if (!(highlightEnd <= range.start || highlightStart >= range.end)) {
                                foundInSelection = true;
                                break;
                            }
                        }
                        
                        if (foundInSelection) {
                            break;
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
                            
                            // Check if this highlight instance overlaps with any selection
                            for (const range of selectionRanges) {
                                if (!(highlightEnd <= range.start || highlightStart >= range.end)) {
                                    foundInSelection = true;
                                    break;
                                }
                            }
                            
                            if (foundInSelection) {
                                break;
                            }
                        }
                    }
                }
                
                if (foundInSelection) {
                    highlightsToRemove.push(pattern);
                }
            }
            
            if (highlightsToRemove.length > 0) {
                // Toggle mode: remove all highlights found in any selection
                highlightsToRemove.forEach(pattern => {
                    removeHighlight(pattern);
                });
                vscode.window.showInformationMessage(`Removed ${highlightsToRemove.length} highlight(s)`);
            } else {
                // Add mode: split by whitespace and highlight each word from all selections (excluding noise)
                const allWords = new Set<string>();
                const filteredWords = new Set<string>();
                
                allSelectedTexts.forEach(selectedText => {
                    const words = selectedText.split(/\s+/)
                        .filter(w => w.length > 0)
                        .map(w => stripUnmatchedDelimiters(w))
                        .filter(w => w.length > 0);
                    words.forEach(word => {
                        if (isNoiseWord(word)) {
                            filteredWords.add(word);
                        } else {
                            allWords.add(word);
                        }
                    });
                });
                
                if (allWords.size === 0 && filteredWords.size === 0) {
                    vscode.window.showInformationMessage('No words found in selection.');
                    return;
                }
                
                if (allWords.size === 0) {
                    vscode.window.showInformationMessage(`Filtered ${filteredWords.size} noise word(s) - nothing to highlight`);
                    return;
                }
                
                allWords.forEach(word => {
                    addHighlight(word);
                });
                const wordList = Array.from(allWords);
                const msg = filteredWords.size > 0
                    ? `Highlighted ${allWords.size} word(s) (filtered ${filteredWords.size} noise): ${wordList.join(', ')}`
                    : `Highlighted ${allWords.size} word(s): ${wordList.join(', ')}`;
                vscode.window.showInformationMessage(msg);
            }
        }

        triggerUpdate();
    });

    const clearAll = vscode.commands.registerCommand('multiScopeHighlighter.clearAll', () => {
        clearAllHighlights();
    });

    const toggleScope = vscode.commands.registerCommand('multiScopeHighlighter.toggleScope', () => {
        isGlobalScope = !isGlobalScope;
        updateStatusBar(); 
        if (!isGlobalScope) {
            const activeEditor = vscode.window.activeTextEditor;
            vscode.window.visibleTextEditors.forEach(editor => {
                if (editor !== activeEditor) {
                    decorationMap.forEach(dec => editor.setDecorations(dec, []));
                }
            });
            if (activeEditor) {
                applyDecorations(activeEditor);
            }
        } else {
            triggerUpdate();
        }
    });

    const toggleStyle = vscode.commands.registerCommand('multiScopeHighlighter.toggleStyle', () => {
        if (styleMode === 'fill') {
            styleMode = 'hybrid';
        } else if (styleMode === 'hybrid') {
            styleMode = 'box';
        } else {
            styleMode = 'fill';
        }
        updateStatusBar();
        refreshAllDecorations();
    });

    // Wrapped in async so showMenu can await it
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

    // Wrapped in async so showMenu can await it
    const toggleContrast = vscode.commands.registerCommand('multiScopeHighlighter.toggleContrast', async () => {
        const config = vscode.workspace.getConfiguration('multiScopeHighlighter');
        const current = config.get<string>('textContrast', 'inherit');
        const next = current === 'inherit' ? 'force-contrast' : 'inherit';
        await config.update('textContrast', next, vscode.ConfigurationTarget.Global);
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
        if (files.length === 0) {
            return;
        }

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
        if (files.length === 0) {
            return;
        }

        const selected = await vscode.window.showQuickPick(files, { placeHolder: 'Select a profile to DELETE' });
        if (!selected) {
            return;
        }

        try {
            fs.unlinkSync(path.join(savePath, selected));
            const deletedName = selected.replace('.json', '');
            if (currentProfileName === deletedName) {
                currentProfileName = undefined;
            }
            vscode.window.showInformationMessage(`Profile '${deletedName}' deleted.`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to delete: ${error}`);
        }
    });

    // Returns a Promise so we can await its closure in showMenu
    const manageHighlights = vscode.commands.registerCommand('multiScopeHighlighter.manageHighlights', () => {
        return new Promise<void>((resolve) => {
            if (highlightMap.size === 0) {
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

            const getModeLabel = (mode: HighlightMode) => {
                if (mode === 'regex') {
                    return 'Regex';
                }
                if (mode === 'whole') {
                    return 'Whole Word';
                }
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
                if (!selection[0]) {
                    return;
                }
                const pattern = selection[0].pattern;
                isEditing = true; // prevent resolve on temporary hide

                const usedColors = new Set<string>();
                highlightMap.forEach((details, key) => {
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
                    quickPick.show(); // return to manager
                });
                
                quickPick.hide();
                colorPicker.show();
                quickPick.selectedItems = [];
            });

            quickPick.onDidTriggerItemButton(async (e) => {
                const pattern = e.item.pattern;
                const details = highlightMap.get(pattern);
                if (!details) {
                    return;
                }
                const tooltip = e.button.tooltip || '';

                if (tooltip === 'Delete') {
                    removeHighlight(pattern);
                    refreshItems();
                    triggerUpdate();
                    if (highlightMap.size === 0) { 
                        isEditing = false; 
                        quickPick.hide(); 
                        resolve(); 
                    }
                
                } else if (tooltip.includes('Click to Cycle')) {
                    let newMode: HighlightMode = 'text';
                    if (details.mode === 'text') {
                        newMode = 'whole';
                    } else if (details.mode === 'whole') {
                        newMode = 'regex';
                    }
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
                            // 1. Dispose old
                            decorationMap.get(pattern)?.dispose();
                            decorationMap.delete(pattern);

                            // 2. Update Map Order
                            entries[index] = [newPattern, details];
                            highlightMap.clear();
                            entries.forEach(([p, d]) => highlightMap.set(p, d));
                            
                            // 3. Add new decoration
                            addHighlight(newPattern, details);
                            
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
    });

    // --- Event Listeners ---
    
    vscode.window.onDidChangeActiveColorTheme(() => {
        refreshAllDecorations();
    }, null, context.subscriptions);

    vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor) {
            triggerUpdate();
        }
    }, null, context.subscriptions);

    vscode.workspace.onDidChangeTextDocument(event => {
        if (isGlobalScope) {
            const editor = vscode.window.visibleTextEditors.find(e => e.document === event.document);
            if (editor) {
                applyDecorations(editor);
            }
        } else {
            const activeEditor = vscode.window.activeTextEditor;
            if (activeEditor && event.document === activeEditor.document) {
                applyDecorations(activeEditor);
            }
        }
    }, null, context.subscriptions);

    vscode.window.onDidChangeVisibleTextEditors(editors => {
        if(isGlobalScope) {
            editors.forEach(e => applyDecorations(e));
        }
    }, null, context.subscriptions);

    vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('multiScopeHighlighter')) {
            updateStatusBar();
            refreshAllDecorations();
        }
    }, null, context.subscriptions);

    context.subscriptions.push(toggleHighlight, highlightWords, clearAll, toggleScope, saveProfile, loadProfile, deleteProfile, manageHighlights, toggleStyle, setOpacity, toggleContrast, showMenu);
}

export function deactivate() {}