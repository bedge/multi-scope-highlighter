# Multi-Scope Highlighter

**A powerful, developer-centric highlighting tool for VS Code. Highlight
multiple words with distinct colors, manage scopes across files, and
toggle between visual styles---all without leaving your keyboard.**

## Features

### Multi-Word Highlighting

**Highlight multiple different words simultaneously. Each new word gets
a unique, high-contrast color automatically.**

- **Smart Coloring: Colors are automatically selected from a palette
  of 20 distinct, high-visibility hues.**

- **Adaptive Themes: Colors automatically adjust to look great in both
  Dark (Neon/Pastel) and Light (Deep/Contrast) themes.**

### Dual Scopes

**Control where your highlights appear using the Status Bar switcher:**

- **Single File: Highlights only appear in the active editor.**

- **All Open Files: Highlights automatically propagate to all visible
  editors (split panes, grid layouts).**

### Dual Styles

**Toggle between two visual modes to suit your preference:**

- **Fill: Solid background color (great for spotting items quickly).**

    ![Solid highlight](images/screenshot-fill.png)

- **Box: 2px Outline border with transparent background (great for
  readability).**

    ![Box highlight](images/screenshot-box.png)

### ⚙️ Advanced Management

**Use the Manage Highlights command to fine-tune your setup without
restarting:**

- **In-Place Editing: Rename highlighted patterns instantly.**

- **Mode Cycling: Toggle a highlight between Plain Text, Whole Word
  \\b, and Regex .\* modes with a single click.**

- **Color Picker: Manually reassign colors, with a smart filter that
  hides colors already in use.**

### Profile Persistence

**Stop re-highlighting the same logs every day.**

- **Save Profile: Save your current set of highlights to a named JSON
  file in your workspace.**

- **Load Profile: Instantly restore a debugging context.**

- **Delete Profile: Clean up old setups.**

## Usage

### Basic Commands

| **Command** | **Keybinding** | **Description** |
| ----------------------- | --------------------- | ------------------------- |
| **Toggle Highlight** | **Ctrl+H / Cmd+H** | **Highlights the selected word. If already highlighted, removes it.** |
| **Manage Highlights** | ***(via Palette)*** | **Opens the interactive manager to edit text, change colors, or cycle modes.** |
| **Clear All** | ***(via Palette)*** | **Removes all highlights immediately.** |

### Status Bar Controls

**Look for the indicators in the bottom right of your VS Code window:**

- **\$(files) Scope: Single - Click to toggle between Single File and
  All Open.**

- **\$(paintcan) Style: Fill - Click to toggle between Solid Fill and
  Outline Box.**

### The \"Manage Highlights\" Workflow

**Run the command Highlight: Manage Current Highlights to see a list of
active patterns.**

- **Click a Row: Opens the Color Picker for that specific word.**

- **✏️ (Pencil): Edit the text pattern (e.g., fix a typo).**

- **\[abc\] / \[ab\] / \[.\*\] (Mode): Click this icon to cycle the
  matching mode:**

  - **\[abc\] Text: Simple literal match.**

  - **\[ab\] Whole Word: Matches \\bword\\b only.**

  - **\[.\*\] Regex: Treats the text as a Regular Expression.**

  ![Manage highlights](images/screenshot-manage.png)

## Extension Commands

**You can access these via the Command Palette (Ctrl+Shift+P /
Cmd+Shift+P):**

- **Highlight: Toggle Selection**

- **Highlight: Manage Current Highlights**

- **Highlight: Clear All**

- **Highlight: Toggle Scope (Single/All Open)**

- **Highlight: Toggle Style (Box/Fill)**

- **Highlight: Save Profile**

- **Highlight: Load Profile**

- **Highlight: Delete Profile**

## Keyboard Shortcuts

**The extension comes with one default keybinding:**

```json
"command": "multiScopeHighlighter.toggleHighlight",
"key": "ctrl+h",
"mac": "cmd+h",
"when": "editorTextFocus"
```

## Storage & Privacy

- **Profiles: Saved as JSON files in a .vscode/highlights/ directory
  within your current workspace. This makes it easy to share highlight
  profiles with your team by committing them to version control.**

- **Runtime: Highlights are temporary and exist only in memory unless
  explicitly saved to a profile.**
