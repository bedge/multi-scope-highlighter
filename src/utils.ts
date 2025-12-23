// Utility functions extracted for testability

export type HighlightMode = 'text' | 'whole' | 'regex';

export interface AdaptiveColor {
    dark: string;
    light: string;
    text: string; // High contrast text color (Black/White)
}

export const PALETTE: Record<string, AdaptiveColor> = {
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

export const PALETTE_KEYS = Object.keys(PALETTE);

/**
 * Strips unmatched delimiters from a word.
 * Handles pairs like (), [], {}, "", '', etc.
 */
export function stripUnmatchedDelimiters(word: string): string {
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

/**
 * Applies opacity to an rgba color string.
 */
export function applyOpacity(rgbaColor: string, opacity: number): string {
    return rgbaColor.replace(/[\d.]+\)$/, `${opacity})`);
}

/**
 * Gets the color value for a given color key based on theme mode.
 */
export function getColorValue(colorKey: string, isLightTheme: boolean): string {
    if (PALETTE[colorKey]) {
        return isLightTheme ? PALETTE[colorKey].light : PALETTE[colorKey].dark;
    }
    return colorKey;
}

/**
 * Checks if a word is a noise word based on the excluded list.
 */
export function isNoiseWord(word: string, excludeNoiseWords: string[]): boolean {
    if (!word || word.length === 0) {
        return true;
    }
    return excludeNoiseWords.includes(word);
}

/**
 * Gets the next color key from the palette based on an index.
 */
export function getNextColorKey(colorIndex: number): string {
    return PALETTE_KEYS[colorIndex % PALETTE_KEYS.length];
}

/**
 * Creates a regex for highlighting based on mode.
 */
export function createHighlightRegex(pattern: string, mode: HighlightMode): RegExp | null {
    try {
        if (mode === 'regex') {
            return new RegExp(pattern, 'g');
        } else if (mode === 'whole') {
            const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            return new RegExp(`\\b${escaped}\\b`, 'g');
        }
    } catch (e) {
        return null;
    }
    return null;
}

/**
 * Parses noise words from a configuration string.
 */
export function parseNoiseWords(noiseWordsStr: string): string[] {
    return noiseWordsStr.split(/\s+/).filter(w => w.length > 0);
}

/**
 * Gets the mode label for display.
 */
export function getModeLabel(mode: HighlightMode): string {
    if (mode === 'regex') {
        return 'Regex';
    }
    if (mode === 'whole') {
        return 'Whole Word';
    }
    return 'Text';
}

/**
 * Cycles to the next highlight mode.
 */
export function getNextMode(currentMode: HighlightMode): HighlightMode {
    if (currentMode === 'text') {
        return 'whole';
    } else if (currentMode === 'whole') {
        return 'regex';
    }
    return 'text';
}
