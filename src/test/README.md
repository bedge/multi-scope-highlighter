# Test Suite Documentation

## Overview

This directory contains comprehensive unit and integration tests for the Multi-Scope Highlighter extension.

## Test Structure

### Test Files

- **`utils.test.ts`** - Unit tests for utility functions extracted from extension.ts
- **`extension.test.ts`** - Integration tests for the VS Code extension
- **`index.ts`** - Test runner configuration using Mocha

## Refactoring for Testability

To enable comprehensive testing, the following refactoring was performed:

### Created `src/utils.ts`

Extracted pure functions that don't depend on VS Code context:
- `stripUnmatchedDelimiters()` - Removes unmatched delimiters from text
- `applyOpacity()` - Applies opacity to rgba color strings
- `getColorValue()` - Gets color values based on theme mode
- `isNoiseWord()` - Checks if a word should be filtered as noise
- `getNextColorKey()` - Cycles through color palette
- `createHighlightRegex()` - Creates regex patterns for different highlight modes
- `parseNoiseWords()` - Parses noise word configuration
- `getModeLabel()` - Gets display label for highlight modes
- `getNextMode()` - Cycles through highlight modes

### Updated `src/extension.ts`

Modified to import and use utility functions from `utils.ts`, making the code:
- More maintainable
- Easier to test
- Better organized with separation of concerns

## Test Coverage

### Utils Test Suite (57 tests)

Tests cover all utility functions with various edge cases:

#### stripUnmatchedDelimiters (13 tests)
- Unmatched opening/closing parentheses, brackets, braces
- Balanced delimiter pairs
- Symmetric delimiters (quotes, asterisks, etc.)
- Edge cases (empty string, only delimiters)
- Multiple delimiter types

#### applyOpacity (3 tests)
- Opacity replacement in rgba strings
- Different opacity values
- Integer opacity handling

#### getColorValue (4 tests)
- Dark/light theme color selection
- Unknown color handling
- All palette colors validation

#### isNoiseWord (4 tests)
- Empty string detection
- Noise list matching
- Empty noise list handling

#### getNextColorKey (4 tests)
- Color cycling
- Wrap-around behavior
- Large index handling

#### createHighlightRegex (6 tests)
- Regex mode patterns
- Whole word matching with word boundaries
- Special character escaping
- Invalid regex handling
- Complex regex patterns

#### parseNoiseWords (5 tests)
- Space-separated parsing
- Empty string filtering
- Multiple whitespace types
- Default configuration parsing

#### getModeLabel (3 tests)
- Mode label strings for text/whole/regex modes

#### getNextMode (3 tests)
- Mode cycling (text → whole → regex → text)

#### PALETTE (4 tests)
- Required color properties validation
- rgba format validation
- Hex format validation for text colors
- Minimum color count

### Extension Integration Test Suite (8 tests)

Tests verify VS Code integration:
- Extension presence and activation
- Command registration (14 commands)
- Configuration defaults
- Command execution without errors

## Running Tests

### Run all tests
```bash
npm test
```

### Compile only
```bash
npm run compile
```

### Run tests with VS Code test runner
Use the "Extension Tests" launch configuration in `.vscode/launch.json`

## Test Results

All 57 tests passing with 0 failures:
- ✔ Utils Test Suite: 49 tests
- ✔ Extension Integration Test Suite: 8 tests

## Configuration

### Test Runner (.vscode-test.mjs)
```javascript
export default defineConfig({
  files: 'out/test/**/*.test.js',
});
```

### Launch Configuration
Added "Extension Tests" configuration to run tests in VS Code Extension Host

### Dependencies
- `mocha`: ^10.8.2 - Test framework
- `@types/mocha`: ^10.0.10 - TypeScript definitions
- `@vscode/test-cli`: ^0.0.12 - VS Code test CLI
- `@vscode/test-electron`: ^2.5.2 - VS Code extension test runner

## Best Practices

1. **Pure Functions**: All utility functions are pure (no side effects), making them easy to test
2. **Type Safety**: Full TypeScript type coverage
3. **Edge Cases**: Tests cover normal and edge cases
4. **Isolation**: Unit tests don't require VS Code context
5. **Integration**: Integration tests verify VS Code API integration

## Future Improvements

Potential areas for additional test coverage:
1. More complex highlight pattern matching scenarios
2. Profile save/load functionality
3. Undo/redo state management
4. Multi-file scope behavior
5. Large file performance optimization
6. Color theme switching behavior
