import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { HighlightState } from '../state';
import { ProfileManager } from '../profileManager';
import { HighlightDetails } from '../types';

suite('ProfileManager Test Suite', () => {
    let state: HighlightState;
    let profileManager: ProfileManager;
    let mockContext: vscode.ExtensionContext;
    let statusBarUpdateCalled: boolean;
    let triggerUpdateCalled: boolean;
    let clearAllCalled: boolean;
    let addedHighlights: Array<{ pattern: string; details?: Partial<HighlightDetails> }>;
    let testProfilePath: string;

    // Helper to create test workspace directory
    function getTestSavePath(): string {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        console.log('Workspace folders:', workspaceFolders);
        console.log('Workspace folder count:', workspaceFolders?.length);
        if (!workspaceFolders || workspaceFolders.length === 0) {
            // Skip tests that require workspace
            return '';
        }
        const savePath = path.join(workspaceFolders[0].uri.fsPath, '.vscode', 'highlights');
        if (!fs.existsSync(savePath)) {
            fs.mkdirSync(savePath, { recursive: true });
        }
        return savePath;
    }

    // Cleanup helper
    function cleanupTestProfiles() {
        try {
            const savePath = getTestSavePath();
            const files = fs.readdirSync(savePath).filter(f => f.startsWith('test-profile-'));
            files.forEach(f => {
                try {
                    fs.unlinkSync(path.join(savePath, f));
                } catch (e) {
                    // Ignore cleanup errors
                }
            });
        } catch (e) {
            // Ignore if directory doesn't exist
        }
    }

    setup(() => {
        // Clean up before each test
        cleanupTestProfiles();

        // Reset state
        state = new HighlightState();
        statusBarUpdateCalled = false;
        triggerUpdateCalled = false;
        clearAllCalled = false;
        addedHighlights = [];

        // Mock context
        mockContext = {
            subscriptions: [],
            workspaceState: {} as any,
            globalState: {} as any,
            extensionPath: '',
            extensionUri: vscode.Uri.file(''),
            environmentVariableCollection: {} as any,
            asAbsolutePath: (p: string) => p,
            storageUri: undefined,
            storagePath: undefined,
            globalStorageUri: vscode.Uri.file(''),
            globalStoragePath: '',
            logUri: vscode.Uri.file(''),
            logPath: '',
            extensionMode: vscode.ExtensionMode.Test,
            extension: {} as any,
            secrets: {} as any,
            languageModelAccessInformation: {} as any
        } as unknown as vscode.ExtensionContext;

        // Create ProfileManager with mock callbacks
        profileManager = new ProfileManager(
            mockContext,
            state,
            (pattern, details) => {
                addedHighlights.push({ pattern, details });
                state.highlightMap.set(pattern, {
                    color: details?.color || 'yellow',
                    mode: details?.mode || 'text',
                    cachedRegex: null
                });
            },
            () => {
                clearAllCalled = true;
                state.highlightMap.clear();
                state.currentProfile = null;
                state.currentProfileName = undefined;
            },
            () => { triggerUpdateCalled = true; },
            () => { statusBarUpdateCalled = true; }
        );
    });

    teardown(() => {
        // Clean up after each test
        cleanupTestProfiles();
        state.dispose();
    });

    test('Should update status bar after saving profile', async function() {
        const savePath = getTestSavePath();
        if (!savePath) {
            this.skip();
            return;
        }

        // Add some highlights to state
        state.highlightMap.set('TODO', { color: 'yellow', mode: 'whole', cachedRegex: null });
        state.highlightMap.set('FIXME', { color: 'red', mode: 'whole', cachedRegex: null });

        // Save profile
        await profileManager.saveProfile('test-profile-save');

        // Verify status bar update was called
        assert.strictEqual(statusBarUpdateCalled, true, 'Status bar should update after save');

        // Verify currentProfile metadata was set
        assert.ok(state.currentProfile, 'currentProfile should be set');
        assert.strictEqual(state.currentProfile!.name, 'test-profile-save');
        assert.strictEqual(state.currentProfile!.scope, 'workspace');
        assert.ok(state.currentProfile!.lastModified instanceof Date);
    });

    test('Should update status bar after loading profile', async function() {
        const savePath = getTestSavePath();
        if (!savePath) {
            this.skip();
            return;
        }

        // Create a test profile file
        const testFile = path.join(savePath, 'test-profile-load.json');
        const profileData = {
            metadata: {
                version: '0.0.19',
                created: new Date().toISOString(),
                modified: new Date().toISOString()
            },
            highlights: [
                { pattern: 'TODO', color: 'yellow', mode: 'whole' },
                { pattern: 'FIXME', color: 'red', mode: 'whole' }
            ]
        };
        fs.writeFileSync(testFile, JSON.stringify(profileData, null, 2));

        // Load profile
        await profileManager.loadProfile('test-profile-load.json');

        // Verify status bar update was called
        assert.strictEqual(statusBarUpdateCalled, true, 'Status bar should update after load');

        // Verify currentProfile metadata was set
        assert.ok(state.currentProfile, 'currentProfile should be set');
        assert.strictEqual(state.currentProfile!.name, 'test-profile-load');
        assert.strictEqual(state.currentProfile!.scope, 'workspace');
        assert.ok(state.currentProfile!.lastModified instanceof Date);

        // Verify highlights were loaded
        assert.strictEqual(addedHighlights.length, 2);
    });

    test('Should load legacy profile format without metadata', async function() {
        const savePath = getTestSavePath();
        if (!savePath) {
            this.skip();
            return;
        }

        // Create a legacy profile file (array format)
        const testFile = path.join(savePath, 'test-profile-legacy.json');
        const legacyData = [
            { pattern: 'console.log', color: 'cyan', mode: 'text' },
            { pattern: 'ERROR', color: 'red', mode: 'whole' }
        ];
        fs.writeFileSync(testFile, JSON.stringify(legacyData, null, 2));

        // Load profile
        await profileManager.loadProfile('test-profile-legacy.json');

        // Verify status bar update was called
        assert.strictEqual(statusBarUpdateCalled, true, 'Status bar should update after load');

        // Verify currentProfile metadata was set (using file stats for lastModified)
        assert.ok(state.currentProfile, 'currentProfile should be set');
        assert.strictEqual(state.currentProfile!.name, 'test-profile-legacy');
        assert.ok(state.currentProfile!.lastModified instanceof Date);

        // Verify highlights were loaded
        assert.strictEqual(addedHighlights.length, 2);
        assert.strictEqual(state.highlightMap.size, 2);
    });

    test('Should preserve created date when re-saving existing profile', async function() {
        const savePath = getTestSavePath();
        if (!savePath) {
            this.skip();
            return;
        }

        const testFile = path.join(savePath, 'test-profile-resave.json');
        
        // Create initial profile with specific created date
        const originalCreated = '2024-01-01T00:00:00.000Z';
        const originalData = {
            metadata: {
                version: '0.0.19',
                created: originalCreated,
                modified: '2024-01-01T00:00:00.000Z'
            },
            highlights: [
                { pattern: 'OLD', color: 'yellow', mode: 'text' }
            ]
        };
        fs.writeFileSync(testFile, JSON.stringify(originalData, null, 2));

        // Add highlights and save with same name
        state.highlightMap.set('NEW', { color: 'red', mode: 'text', cachedRegex: null });
        await profileManager.saveProfile('test-profile-resave');

        // Read saved file
        const savedContent = fs.readFileSync(testFile, 'utf-8');
        const savedData = JSON.parse(savedContent);
        
        // Verify created date was preserved
        assert.strictEqual(savedData.metadata.created, originalCreated, 'Created date should be preserved');
        
        // Verify modified date was updated
        assert.notStrictEqual(savedData.metadata.modified, originalCreated, 'Modified date should be updated');
    });

    test('Should clear profile metadata after deleting active profile', async function() {
        const savePath = getTestSavePath();
        if (!savePath) {
            this.skip();
            return;
        }

        // Create and load a profile
        const testFile = path.join(savePath, 'test-profile-delete.json');
        const profileData = {
            metadata: {
                version: '0.0.19',
                created: new Date().toISOString(),
                modified: new Date().toISOString()
            },
            highlights: [
                { pattern: 'DELETE_ME', color: 'yellow', mode: 'text' }
            ]
        };
        fs.writeFileSync(testFile, JSON.stringify(profileData, null, 2));

        // Load the profile
        await profileManager.loadProfile('test-profile-delete.json');

        // Verify profile was loaded
        assert.ok(state.currentProfile, 'Profile should be loaded');

        // Delete the profile by filename (bypass QuickPick for testing)
        await profileManager.deleteProfile('test-profile-delete.json');

        // Verify currentProfile metadata was cleared
        assert.strictEqual(state.currentProfile, null, 'currentProfile should be cleared');
        assert.strictEqual(state.currentProfileName, undefined, 'currentProfileName should be cleared');
    });

    test('Should create profile with correct metadata structure', async function() {
        const savePath = getTestSavePath();
        if (!savePath) {
            this.skip();
            return;
        }

        // Add highlights
        state.highlightMap.set('TEST1', { color: 'blue', mode: 'text', cachedRegex: null });
        state.highlightMap.set('TEST2', { color: 'green', mode: 'regex', cachedRegex: null });

        // Save profile
        await profileManager.saveProfile('test-profile-metadata');

        // Read saved file
        const testFile = path.join(savePath, 'test-profile-metadata.json');
        const content = fs.readFileSync(testFile, 'utf-8');
        const data = JSON.parse(content);

        // Verify structure
        assert.ok(data.metadata, 'Should have metadata object');
        assert.strictEqual(data.metadata.version, '0.0.19');
        assert.ok(data.metadata.created, 'Should have created timestamp');
        assert.ok(data.metadata.modified, 'Should have modified timestamp');
        assert.ok(Array.isArray(data.highlights), 'Should have highlights array');
        assert.strictEqual(data.highlights.length, 2);
    });

    test('Should not save when no highlights exist', async () => {
        // Try to save with empty highlightMap
        await profileManager.saveProfile('test-profile-empty');

        // Verify status bar was NOT updated (save was aborted)
        assert.strictEqual(statusBarUpdateCalled, false, 'Status bar should not update when save fails');
        
        // Verify currentProfile was NOT set
        assert.strictEqual(state.currentProfile, null, 'currentProfile should not be set');
    });
});
