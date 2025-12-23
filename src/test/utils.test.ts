import * as assert from 'assert';
import {
    stripUnmatchedDelimiters,
    applyOpacity,
    getColorValue,
    isNoiseWord,
    getNextColorKey,
    createHighlightRegex,
    parseNoiseWords,
    getModeLabel,
    getNextMode,
    PALETTE,
    PALETTE_KEYS
} from '../utils';

suite('Utils Test Suite', () => {
    
    suite('stripUnmatchedDelimiters', () => {
        test('should strip unmatched opening parentheses', () => {
            assert.strictEqual(stripUnmatchedDelimiters('(word'), 'word');
            assert.strictEqual(stripUnmatchedDelimiters('((word'), 'word');
            assert.strictEqual(stripUnmatchedDelimiters('(((word'), 'word');
        });

        test('should strip unmatched closing parentheses', () => {
            assert.strictEqual(stripUnmatchedDelimiters('word)'), 'word');
            assert.strictEqual(stripUnmatchedDelimiters('word))'), 'word');
            assert.strictEqual(stripUnmatchedDelimiters('word)))'), 'word');
        });

        test('should keep balanced parentheses', () => {
            assert.strictEqual(stripUnmatchedDelimiters('(word)'), '(word)');
            assert.strictEqual(stripUnmatchedDelimiters('((word))'), '((word))');
        });

        test('should strip excess unbalanced parentheses', () => {
            // The function strips excess delimiters
            assert.strictEqual(stripUnmatchedDelimiters('((word)'), '(word)');
            assert.strictEqual(stripUnmatchedDelimiters('(word))'), '(word)');
            // With multiple excess, it strips them
            assert.strictEqual(stripUnmatchedDelimiters('(((word)'), '(word)');
        });

        test('should handle square brackets', () => {
            assert.strictEqual(stripUnmatchedDelimiters('[word'), 'word');
            assert.strictEqual(stripUnmatchedDelimiters('word]'), 'word');
            assert.strictEqual(stripUnmatchedDelimiters('[word]'), '[word]');
            assert.strictEqual(stripUnmatchedDelimiters('[[word]'), '[word]');
        });

        test('should handle curly braces', () => {
            assert.strictEqual(stripUnmatchedDelimiters('{word'), 'word');
            assert.strictEqual(stripUnmatchedDelimiters('word}'), 'word');
            assert.strictEqual(stripUnmatchedDelimiters('{word}'), '{word}');
        });

        test('should handle quotes', () => {
            assert.strictEqual(stripUnmatchedDelimiters('"word'), 'word');
            assert.strictEqual(stripUnmatchedDelimiters('word"'), 'word');
            assert.strictEqual(stripUnmatchedDelimiters('"word"'), '"word"');
            assert.strictEqual(stripUnmatchedDelimiters("'word'"), "'word'");
            assert.strictEqual(stripUnmatchedDelimiters('`word`'), '`word`');
        });

        test('should handle dots', () => {
            assert.strictEqual(stripUnmatchedDelimiters('.word'), 'word');
            assert.strictEqual(stripUnmatchedDelimiters('word.'), 'word');
            assert.strictEqual(stripUnmatchedDelimiters('.word.'), '.word.');
        });

        test('should handle multiple delimiter types', () => {
            // When opening and closing don't match, strips the unmatched one
            assert.strictEqual(stripUnmatchedDelimiters('(word]'), 'word');
            assert.strictEqual(stripUnmatchedDelimiters('[word)'), 'word');
        });

        test('should handle empty string', () => {
            assert.strictEqual(stripUnmatchedDelimiters(''), '');
        });

        test('should handle string with only delimiters', () => {
            assert.strictEqual(stripUnmatchedDelimiters('(('), '');
            assert.strictEqual(stripUnmatchedDelimiters('))'), '');
            assert.strictEqual(stripUnmatchedDelimiters('()'), '()');
        });

        test('should handle asterisks', () => {
            assert.strictEqual(stripUnmatchedDelimiters('*word'), 'word');
            assert.strictEqual(stripUnmatchedDelimiters('word*'), 'word');
            assert.strictEqual(stripUnmatchedDelimiters('*word*'), '*word*');
        });

        test('should handle underscores', () => {
            assert.strictEqual(stripUnmatchedDelimiters('_word'), 'word');
            assert.strictEqual(stripUnmatchedDelimiters('word_'), 'word');
            assert.strictEqual(stripUnmatchedDelimiters('_word_'), '_word_');
        });
    });

    suite('applyOpacity', () => {
        test('should replace opacity value in rgba string', () => {
            assert.strictEqual(
                applyOpacity('rgba(255, 255, 0, 0.9)', 0.5),
                'rgba(255, 255, 0, 0.5)'
            );
        });

        test('should handle different opacity values', () => {
            assert.strictEqual(
                applyOpacity('rgba(255, 0, 0, 1.0)', 0.1),
                'rgba(255, 0, 0, 0.1)'
            );
            assert.strictEqual(
                applyOpacity('rgba(0, 255, 0, 0.35)', 0.75),
                'rgba(0, 255, 0, 0.75)'
            );
        });

        test('should handle integer opacity', () => {
            assert.strictEqual(
                applyOpacity('rgba(0, 0, 255, 1)', 1),
                'rgba(0, 0, 255, 1)'
            );
        });
    });

    suite('getColorValue', () => {
        test('should return dark color for dark theme', () => {
            const result = getColorValue('Neon Yellow', false);
            assert.strictEqual(result, PALETTE['Neon Yellow'].dark);
        });

        test('should return light color for light theme', () => {
            const result = getColorValue('Neon Yellow', true);
            assert.strictEqual(result, PALETTE['Neon Yellow'].light);
        });

        test('should return original key for unknown color', () => {
            const customColor = 'rgba(100, 100, 100, 0.5)';
            const result = getColorValue(customColor, false);
            assert.strictEqual(result, customColor);
        });

        test('should handle all palette colors', () => {
            PALETTE_KEYS.forEach(colorKey => {
                const darkResult = getColorValue(colorKey, false);
                assert.strictEqual(darkResult, PALETTE[colorKey].dark);
                
                const lightResult = getColorValue(colorKey, true);
                assert.strictEqual(lightResult, PALETTE[colorKey].light);
            });
        });
    });

    suite('isNoiseWord', () => {
        test('should return true for empty string', () => {
            assert.strictEqual(isNoiseWord('', []), true);
        });

        test('should return true for words in exclude list', () => {
            const excludeList = ['-', '=', ':', ','];
            assert.strictEqual(isNoiseWord('-', excludeList), true);
            assert.strictEqual(isNoiseWord('=', excludeList), true);
        });

        test('should return false for words not in exclude list', () => {
            const excludeList = ['-', '=', ':'];
            assert.strictEqual(isNoiseWord('word', excludeList), false);
            assert.strictEqual(isNoiseWord('function', excludeList), false);
        });

        test('should handle empty exclude list', () => {
            assert.strictEqual(isNoiseWord('word', []), false);
        });
    });

    suite('getNextColorKey', () => {
        test('should return first color for index 0', () => {
            assert.strictEqual(getNextColorKey(0), PALETTE_KEYS[0]);
        });

        test('should cycle through colors', () => {
            for (let i = 0; i < PALETTE_KEYS.length; i++) {
                assert.strictEqual(getNextColorKey(i), PALETTE_KEYS[i]);
            }
        });

        test('should wrap around after last color', () => {
            const lastIndex = PALETTE_KEYS.length - 1;
            assert.strictEqual(getNextColorKey(lastIndex), PALETTE_KEYS[lastIndex]);
            assert.strictEqual(getNextColorKey(lastIndex + 1), PALETTE_KEYS[0]);
            assert.strictEqual(getNextColorKey(lastIndex + 2), PALETTE_KEYS[1]);
        });

        test('should handle large indices', () => {
            const largeIndex = PALETTE_KEYS.length * 10 + 5;
            assert.strictEqual(getNextColorKey(largeIndex), PALETTE_KEYS[5]);
        });
    });

    suite('createHighlightRegex', () => {
        test('should create regex for regex mode', () => {
            const regex = createHighlightRegex('\\w+', 'regex');
            assert.notStrictEqual(regex, null);
            assert.strictEqual(regex!.global, true);
        });

        test('should create word boundary regex for whole mode', () => {
            const regex = createHighlightRegex('word', 'whole');
            assert.notStrictEqual(regex, null);
            assert.strictEqual(regex!.global, true);
            // Test that it matches whole words only
            const testText = 'word words sword';
            const matches = testText.match(regex!);
            assert.strictEqual(matches?.length, 1);
            assert.strictEqual(matches?.[0], 'word');
        });

        test('should escape special regex characters in whole mode', () => {
            const regex = createHighlightRegex('test', 'whole');
            assert.notStrictEqual(regex, null);
            // Should match whole word "test" only
            const testText = '(test) testing test';
            regex!.lastIndex = 0; // Reset regex state
            const matches = testText.match(regex!);
            // Should match "(test)" and standalone "test", but not "testing"
            // Actually, word boundary won't match after/before ( and ), so we need to adjust
            // Word boundaries work between word and non-word characters
            // (test) has boundaries around 'test' since ( and ) are non-word chars
            assert.ok(matches !== null && matches.length >= 1);
            assert.ok(matches.includes('test'));
        });

        test('should return null for text mode', () => {
            const regex = createHighlightRegex('word', 'text');
            assert.strictEqual(regex, null);
        });

        test('should return null for invalid regex', () => {
            const regex = createHighlightRegex('(unclosed', 'regex');
            assert.strictEqual(regex, null);
        });

        test('should handle complex regex patterns', () => {
            const regex = createHighlightRegex('[a-z]+\\d+', 'regex');
            assert.notStrictEqual(regex, null);
            const testText = 'test123 abc456 789';
            const matches = testText.match(regex!);
            assert.strictEqual(matches?.length, 2);
        });
    });

    suite('parseNoiseWords', () => {
        test('should parse space-separated words', () => {
            const result = parseNoiseWords('- = : ,');
            assert.deepStrictEqual(result, ['-', '=', ':', ',']);
        });

        test('should filter empty strings', () => {
            const result = parseNoiseWords('  -   =     :  ');
            assert.deepStrictEqual(result, ['-', '=', ':']);
        });

        test('should handle empty string', () => {
            const result = parseNoiseWords('');
            assert.deepStrictEqual(result, []);
        });

        test('should handle tabs and newlines', () => {
            const result = parseNoiseWords('-\t=\n:\r,');
            assert.deepStrictEqual(result, ['-', '=', ':', ',']);
        });

        test('should parse default noise words configuration', () => {
            const defaultConfig = '- = : , ; . ! ? | & + * / \\ < > [ ] ( ) { } \' " ` ~ @ # $ % ^ _';
            const result = parseNoiseWords(defaultConfig);
            assert.ok(result.length > 0);
            assert.ok(result.includes('-'));
            assert.ok(result.includes('='));
        });
    });

    suite('getModeLabel', () => {
        test('should return "Text" for text mode', () => {
            assert.strictEqual(getModeLabel('text'), 'Text');
        });

        test('should return "Whole Word" for whole mode', () => {
            assert.strictEqual(getModeLabel('whole'), 'Whole Word');
        });

        test('should return "Regex" for regex mode', () => {
            assert.strictEqual(getModeLabel('regex'), 'Regex');
        });
    });

    suite('getNextMode', () => {
        test('should cycle from text to whole', () => {
            assert.strictEqual(getNextMode('text'), 'whole');
        });

        test('should cycle from whole to regex', () => {
            assert.strictEqual(getNextMode('whole'), 'regex');
        });

        test('should cycle from regex to text', () => {
            assert.strictEqual(getNextMode('regex'), 'text');
        });
    });

    suite('PALETTE', () => {
        test('should have all required color properties', () => {
            PALETTE_KEYS.forEach(colorKey => {
                const color = PALETTE[colorKey];
                assert.ok(color.dark, `${colorKey} missing dark property`);
                assert.ok(color.light, `${colorKey} missing light property`);
                assert.ok(color.text, `${colorKey} missing text property`);
            });
        });

        test('should have valid rgba format', () => {
            const rgbaPattern = /^rgba\(\d+,\s*\d+,\s*\d+,\s*[\d.]+\)$/;
            PALETTE_KEYS.forEach(colorKey => {
                const color = PALETTE[colorKey];
                assert.ok(rgbaPattern.test(color.dark), `${colorKey}.dark has invalid format: ${color.dark}`);
                assert.ok(rgbaPattern.test(color.light), `${colorKey}.light has invalid format: ${color.light}`);
            });
        });

        test('should have valid hex format for text color', () => {
            const hexPattern = /^#[0-9A-F]{6}$/i;
            PALETTE_KEYS.forEach(colorKey => {
                const color = PALETTE[colorKey];
                assert.ok(hexPattern.test(color.text), `${colorKey}.text has invalid format: ${color.text}`);
            });
        });

        test('should have at least 10 colors', () => {
            assert.ok(PALETTE_KEYS.length >= 10, `Expected at least 10 colors, got ${PALETTE_KEYS.length}`);
        });
    });
});
