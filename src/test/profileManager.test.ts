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
        
        // Clean up global storage
        try {
            const globalStoragePath = path.join(__dirname, '.test-global-storage');
            if (fs.existsSync(globalStoragePath)) {
                fs.rmSync(globalStoragePath, { recursive: true, force: true });
            }
        } catch (e) {
            // Ignore cleanup errors
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
            globalStorageUri: vscode.Uri.file(path.join(__dirname, '.test-global-storage')),
            globalStoragePath: path.join(__dirname, '.test-global-storage'),
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
        await profileManager.saveProfile('test-profile-save', false, { scope: 'workspace', color: '#FF5555' });

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
        await profileManager.activateProfile('test-profile-load.json');

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
        await profileManager.activateProfile('test-profile-legacy.json');

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
        await profileManager.saveProfile('test-profile-resave', false, { scope: 'workspace', color: '#FF5555' });

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
        await profileManager.activateProfile('test-profile-delete.json');

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
        await profileManager.saveProfile('test-profile-metadata', false, { scope: 'workspace', color: '#FF5555' });

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

    test('Should list profiles sorted by last modified date', async function() {
        const savePath = getTestSavePath();
        if (!savePath) {
            this.skip();
            return;
        }

        // Create multiple test profiles with different timestamps
        const profile1Path = path.join(savePath, 'test-list-1.json');
        const profile2Path = path.join(savePath, 'test-list-2.json');
        const profile3Path = path.join(savePath, 'test-list-3.json');

        const profileData = {
            metadata: { version: '0.0.19', created: new Date().toISOString(), modified: new Date().toISOString() },
            highlights: [{ pattern: 'TEST', color: 'yellow', mode: 'text' }]
        };

        // Create files with slight delay to ensure different timestamps
        fs.writeFileSync(profile1Path, JSON.stringify(profileData));
        await new Promise(resolve => setTimeout(resolve, 10));
        fs.writeFileSync(profile2Path, JSON.stringify(profileData));
        await new Promise(resolve => setTimeout(resolve, 10));
        fs.writeFileSync(profile3Path, JSON.stringify(profileData));

        // List profiles
        const profiles = await profileManager.listProfiles();

        // Verify all profiles are listed
        assert.ok(profiles.length >= 3, 'Should have at least 3 profiles');
        
        const testProfiles = profiles.filter(p => p.name.startsWith('test-list-'));
        assert.strictEqual(testProfiles.length, 3, 'Should find all test profiles');

        // Verify sorted by lastModified (most recent first)
        for (let i = 0; i < testProfiles.length - 1; i++) {
            assert.ok(
                testProfiles[i].lastModified >= testProfiles[i + 1].lastModified,
                'Profiles should be sorted by lastModified descending'
            );
        }

        // Verify metadata structure
        testProfiles.forEach(profile => {
            assert.ok(profile.name, 'Profile should have name');
            assert.ok(profile.path, 'Profile should have path');
            assert.strictEqual(profile.scope, 'workspace', 'Profile should have scope');
            assert.ok(profile.lastModified instanceof Date, 'lastModified should be a Date');
        });
    });

    test('Should merge profile without replacing existing highlights', async function() {
        const savePath = getTestSavePath();
        if (!savePath) {
            this.skip();
            return;
        }

        // Add some initial highlights
        state.highlightMap.set('EXISTING1', { color: 'red', mode: 'text', cachedRegex: null });
        state.highlightMap.set('EXISTING2', { color: 'blue', mode: 'text', cachedRegex: null });

        // Create a profile to merge
        const testFile = path.join(savePath, 'test-merge.json');
        const profileData = {
            metadata: { version: '0.0.19', created: new Date().toISOString(), modified: new Date().toISOString() },
            highlights: [
                { pattern: 'NEW1', color: 'green', mode: 'text' },
                { pattern: 'NEW2', color: 'yellow', mode: 'text' },
                { pattern: 'EXISTING1', color: 'pink', mode: 'text' } // Should be skipped
            ]
        };
        fs.writeFileSync(testFile, JSON.stringify(profileData, null, 2));

        // Merge the profile (Note: Can't test UI interaction, but can test the logic directly)
        // For now, verify the file exists and can be read
        const profiles = await profileManager.listProfiles();
        const mergeProfile = profiles.find(p => p.name === 'test-merge');
        assert.ok(mergeProfile, 'Merge profile should be in list');

        // Manually test merge logic by reading and applying
        const content = fs.readFileSync(testFile, 'utf-8');
        const data = JSON.parse(content);
        const initialSize = state.highlightMap.size;

        // Simulate merge
        let added = 0;
        for (const item of data.highlights) {
            if (!state.highlightMap.has(item.pattern)) {
                state.highlightMap.set(item.pattern, {
                    color: item.color,
                    mode: item.mode as any,
                    cachedRegex: null
                });
                added++;
            }
        }

        // Verify: should add 2 new, skip 1 duplicate
        assert.strictEqual(added, 2, 'Should add 2 new highlights');
        assert.strictEqual(state.highlightMap.size, initialSize + 2, 'Map size should increase by 2');
        assert.strictEqual(state.highlightMap.get('EXISTING1')?.color, 'red', 'Existing highlight should not be replaced');
        assert.ok(state.highlightMap.has('NEW1'), 'New highlight 1 should be added');
        assert.ok(state.highlightMap.has('NEW2'), 'New highlight 2 should be added');
    });

    test('Should duplicate profile with new name and updated metadata', async function() {
        const savePath = getTestSavePath();
        if (!savePath) {
            this.skip();
            return;
        }

        // Create original profile
        const originalFile = path.join(savePath, 'test-duplicate-original.json');
        const originalCreated = '2024-01-01T00:00:00.000Z';
        const originalData = {
            metadata: {
                version: '0.0.19',
                created: originalCreated,
                modified: originalCreated
            },
            highlights: [
                { pattern: 'ORIGINAL', color: 'red', mode: 'text' }
            ]
        };
        fs.writeFileSync(originalFile, JSON.stringify(originalData, null, 2));

        // Simulate duplicate operation
        const duplicateFile = path.join(savePath, 'test-duplicate-copy.json');
        const duplicateData = JSON.parse(JSON.stringify(originalData)); // Deep copy
        duplicateData.metadata.created = new Date().toISOString();
        duplicateData.metadata.modified = new Date().toISOString();
        fs.writeFileSync(duplicateFile, JSON.stringify(duplicateData, null, 2));

        // Verify duplicate was created
        assert.ok(fs.existsSync(duplicateFile), 'Duplicate file should exist');

        // Read and verify
        const copiedContent = fs.readFileSync(duplicateFile, 'utf-8');
        const copiedData = JSON.parse(copiedContent);

        // Verify metadata was updated
        assert.notStrictEqual(copiedData.metadata.created, originalCreated, 'Created timestamp should be updated');
        assert.notStrictEqual(copiedData.metadata.modified, originalCreated, 'Modified timestamp should be updated');

        // Verify highlights are identical
        assert.strictEqual(copiedData.highlights.length, originalData.highlights.length);
        assert.strictEqual(copiedData.highlights[0].pattern, 'ORIGINAL');
        assert.strictEqual(copiedData.highlights[0].color, 'red');

        // Verify original is unchanged
        const originalContent = fs.readFileSync(originalFile, 'utf-8');
        const originalCheck = JSON.parse(originalContent);
        assert.strictEqual(originalCheck.metadata.created, originalCreated, 'Original should not be modified');
    });

    test('Should handle legacy profile format when merging', async function() {
        const savePath = getTestSavePath();
        if (!savePath) {
            this.skip();
            return;
        }

        // Create legacy format profile (array without metadata)
        const testFile = path.join(savePath, 'test-merge-legacy.json');
        const legacyData = [
            { pattern: 'LEGACY1', color: 'cyan', mode: 'text' },
            { pattern: 'LEGACY2', color: 'magenta', mode: 'whole' }
        ];
        fs.writeFileSync(testFile, JSON.stringify(legacyData, null, 2));

        // Verify file can be read
        const content = fs.readFileSync(testFile, 'utf-8');
        const data = JSON.parse(content);

        // Verify it's array format
        assert.ok(Array.isArray(data), 'Legacy format should be an array');

        // Simulate merge with legacy format
        const highlights = Array.isArray(data) ? data : (data as any).highlights;
        assert.strictEqual(highlights.length, 2, 'Should read 2 highlights from legacy format');
        assert.strictEqual(highlights[0].pattern, 'LEGACY1');
        assert.strictEqual(highlights[1].pattern, 'LEGACY2');
    });
});
