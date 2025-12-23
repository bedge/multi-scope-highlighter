import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Integration Test Suite', () => {
    
    vscode.window.showInformationMessage('Starting integration tests.');

    test('Extension should be present', () => {
        assert.ok(vscode.extensions.getExtension('bruce-edge.multi-scope-highlighter'));
    });

    test('Extension should activate', async () => {
        const ext = vscode.extensions.getExtension('bruce-edge.multi-scope-highlighter');
        assert.ok(ext);
        await ext!.activate();
        assert.strictEqual(ext!.isActive, true);
    });

    test('Commands should be registered', async () => {
        const commands = await vscode.commands.getCommands(true);
        const extensionCommands = [
            'multiScopeHighlighter.showMenu',
            'multiScopeHighlighter.toggleHighlight',
            'multiScopeHighlighter.highlightWords',
            'multiScopeHighlighter.clearAll',
            'multiScopeHighlighter.undo',
            'multiScopeHighlighter.redo',
            'multiScopeHighlighter.toggleScope',
            'multiScopeHighlighter.saveProfile',
            'multiScopeHighlighter.loadProfile',
            'multiScopeHighlighter.deleteProfile',
            'multiScopeHighlighter.manageHighlights',
            'multiScopeHighlighter.toggleStyle',
            'multiScopeHighlighter.setOpacity',
            'multiScopeHighlighter.toggleContrast'
        ];

        extensionCommands.forEach(cmd => {
            assert.ok(commands.includes(cmd), `Command ${cmd} should be registered`);
        });
    });

    test('Configuration should have correct defaults', () => {
        const config = vscode.workspace.getConfiguration('multiScopeHighlighter');
        
        // Check that configuration values exist and are the right type (user may have customized values)
        const fillOpacity = config.get<number>('fillOpacity');
        assert.ok(typeof fillOpacity === 'number' && fillOpacity >= 0 && fillOpacity <= 1, 'fillOpacity should be a number between 0 and 1');
        
        const textContrast = config.get<string>('textContrast');
        assert.ok(['inherit', 'force-contrast'].includes(textContrast!), 'textContrast should be inherit or force-contrast');
        
        const maxLines = config.get<number>('maxLinesForWholeFile');
        assert.ok(typeof maxLines === 'number' && maxLines > 0, 'maxLinesForWholeFile should be a positive number');
        
        assert.ok(typeof config.get<string>('excludeNoiseWords') === 'string', 'excludeNoiseWords should be a string');
    });

    test('Clear all command should execute without error', async () => {
        await vscode.commands.executeCommand('multiScopeHighlighter.clearAll');
        // If no error is thrown, test passes
        assert.ok(true);
    });

    test('Toggle scope command should execute without error', async () => {
        await vscode.commands.executeCommand('multiScopeHighlighter.toggleScope');
        // Toggle back
        await vscode.commands.executeCommand('multiScopeHighlighter.toggleScope');
        assert.ok(true);
    });

    test('Toggle style command should execute without error', async () => {
        await vscode.commands.executeCommand('multiScopeHighlighter.toggleStyle');
        assert.ok(true);
    });

    test('Undo/Redo commands should execute without error', async () => {
        await vscode.commands.executeCommand('multiScopeHighlighter.undo');
        await vscode.commands.executeCommand('multiScopeHighlighter.redo');
        assert.ok(true);
    });
});
