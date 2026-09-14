# Handwrite Coding

A VS Code extension that lets you transform your editor into a handwritten, creative coding style with Google Fonts and custom font installation.

## Features

- Switch the editor to handwritten fonts such as Caveat, Kalam, Indie Flower, and more
- Browse a curated list of handwriting and monospace fonts
- Install fonts from Google Fonts or a custom font URL
- Install fonts from a local `.ttf` or `.otf` file
- Apply the chosen font directly to the VS Code editor
- Reload the editor automatically after applying a font
- Reset the editor font back to default

## Screenshot

The extension adds a sidebar panel where you can search, filter, and apply fonts.

## Installation

### From source

1. Clone or download this repository.
2. Open the folder in VS Code.
3. Run:

```bash
npm install
```

4. Press `F5` to run the extension in a new Extension Development Host window.

### Build package

```bash
npm run compile
npx @vscode/vsce package
```

This creates a `.vsix` package that can be installed manually or published to the VS Code Marketplace.

## Usage

1. Open the activity bar and select the "Font Switcher" panel.
2. Search or filter fonts.
3. Click a font to apply it to the editor.
4. Use the actions to install from a file or from a Google Fonts URL if needed.
5. Use the reset action to restore the default editor font.

## Commands

- `Font Switcher: Next Font`
- `Font Switcher: Previous Font`
- `Font Switcher: Pick Font`
- `Font Switcher: Reset to Default`
- `Font Switcher: Install Font from File`
- `Font Switcher: Install Font from Google Fonts URL`

## Configuration

You can configure default values in the VS Code settings:

- `fontSwitcher.fonts`
- `fontSwitcher.fontSize`
- `fontSwitcher.fontWeight`

Example:

```json
"fontSwitcher.fonts": [
  "Caveat",
  "Kalam",
  "Shadows Into Light",
  "Permanent Marker"
],
"fontSwitcher.fontSize": 14,
"fontSwitcher.fontWeight": "normal"
```

## Notes

- The extension is designed primarily for Windows, because it installs fonts directly into the Windows font system.
- Some fonts may require a VS Code reload to fully appear in the editor.
- For custom fonts, use a valid `.ttf` or `.otf` file.

## License

This project is provided as-is for personal and educational use.

## Contributing

Pull requests and improvements are welcome.
