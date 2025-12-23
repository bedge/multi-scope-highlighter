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
        
        assert.strictEqual(config.get<number>('fillOpacity'), 0.35);
        assert.strictEqual(config.get<string>('textContrast'), 'inherit');
        assert.strictEqual(config.get<number>('maxLinesForWholeFile'), 10000);
        assert.ok(config.get<string>('excludeNoiseWords'));
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
