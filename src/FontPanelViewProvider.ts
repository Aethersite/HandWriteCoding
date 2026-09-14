import * as vscode from 'vscode';
import {
  applyGoogleFont,
  uninstallGoogleFont,
  getInstalledFontNames,
  installFromFileCommand,
  installFromUrlCommand,
} from './fontInstaller';

export class FontPanelViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'fontSwitcher.panel';
  private _view?: vscode.WebviewView;
  private readonly _customFonts: Record<string, string>;

  private readonly _fonts: Record<string, string> = {
    'Caveat': 'handwriting',
    'Kalam': 'handwriting',
    'Shadows Into Light': 'handwriting',
    'Shadows Into Light Two': 'handwriting',
    'Indie Flower': 'handwriting',
    'Permanent Marker': 'handwriting',
    'Gloria Hallelujah': 'handwriting',
    'Architects Daughter': 'handwriting',
    'Covered By Your Grace': 'handwriting',
    'Gochi Hand': 'handwriting',
    'Neucha': 'handwriting',
    'Marck Script': 'handwriting',
    'Nothing You Could Do': 'handwriting',
    'Rock Salt': 'handwriting',
    'Homemade Apple': 'handwriting',
    'La Belle Aurore': 'handwriting',
    'Reenie Beanie': 'handwriting',
    'Just Another Hand': 'handwriting',
    'Short Stack': 'handwriting',
    'Patrick Hand': 'handwriting',
    'Handlee': 'handwriting',
    'Itim': 'handwriting',
    'Mali': 'handwriting',
    'Nanum Pen Script': 'handwriting',
    'Delius': 'handwriting',
    'Coming Soon': 'handwriting',
    'Schoolbell': 'handwriting',
    'Walter Turncoat': 'handwriting',
    'Sue Ellen Francisco': 'handwriting',
    'Zeyada': 'handwriting',
    'Give You Glory': 'handwriting',
    'The Girl Next Door': 'handwriting',
    'Fira Code': 'monospace',
    'JetBrains Mono': 'monospace',
    'Cascadia Code': 'monospace',
    'Consolas': 'monospace',
  };

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _context: vscode.ExtensionContext,
  ) {
    this._customFonts = {};
    for (const font of _context.globalState.get<string[]>('customFonts', [])) {
      this._customFonts[font] = 'custom';
    }
  }

  private getFonts(): Record<string, string> {
    return { ...this._fonts, ...this._customFonts };
  }

  private getCurrentFont(): string | undefined {
    const value = vscode.workspace.getConfiguration('editor').get<string>('fontFamily', '');
    const match = value.match(/'([^']+)'|"([^"]+)"/);
    return (match?.[1] || match?.[2] || value.split(',')[0]).trim() || undefined;
  }

  private async rememberCustomFont(font: string) {
    this._customFonts[font] = 'custom';
    await this._context.globalState.update('customFonts', Object.keys(this._customFonts));
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtmlContent(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (message) => {
      if (message.type === 'ready') {
        const fonts = this.getFonts();
        this._view?.webview.postMessage({
          type: 'init',
          fonts: Object.keys(fonts),
          categories: fonts,
          installed: getInstalledFontNames(Object.keys(fonts)),
          currentFont: this.getCurrentFont(),
        });
        return;
      }
      if (message.type === 'uninstallFont') {
        try {
          await uninstallGoogleFont(message.font);
          const editorConfig = vscode.workspace.getConfiguration('editor');
          const current = editorConfig.get<string>('fontFamily', '');
          if (current.includes(message.font)) {
            const inspected = editorConfig.inspect('fontFamily');
            const target = inspected?.workspaceValue !== undefined
              ? vscode.ConfigurationTarget.Workspace
              : vscode.ConfigurationTarget.Global;
            await editorConfig.update('fontFamily', inspected?.defaultValue ?? 'Consolas, monospace', target);
          }
          this.postInstalled();
          vscode.window.showInformationMessage(`Uninstalled ${message.font}`);
        } catch (e: unknown) {
          const detail = e instanceof Error ? e.message : String(e);
          vscode.window.showWarningMessage(`Could not uninstall ${message.font}: ${detail}`);
        }
        this.postInstalled();
        return;
      }
      if (message.type === 'openFont') {
        const page = 'https://fonts.google.com/specimen/' + String(message.font).replace(/ /g, '+');
        vscode.env.openExternal(vscode.Uri.parse(page));
        return;
      }
      if (message.type === 'installFile') {
        const font = await installFromFileCommand();
        if (font) {
          await this.rememberCustomFont(font);
          this.postFonts();
        }
        return;
      }
      if (message.type === 'installUrl') {
        const font = await installFromUrlCommand();
        if (font) {
          await this.rememberCustomFont(font);
          this.postFonts();
        }
        return;
      }
      if (message.type === 'restoreDefaultFont') {
        const editorConfig = vscode.workspace.getConfiguration('editor');
        const inspected = editorConfig.inspect('fontFamily');
        const target = inspected?.workspaceValue !== undefined
          ? vscode.ConfigurationTarget.Workspace
          : vscode.ConfigurationTarget.Global;
        const defaultValue = inspected?.defaultValue ?? 'Consolas, monospace';
        await editorConfig.update('fontFamily', defaultValue, target);
        this.postInstalled();
        vscode.window.showInformationMessage('Default editor font restored');
        return;
      }
      if (message.type === 'applyFont') {
        await applyGoogleFont(message.font);
        this._view?.webview.postMessage({ type: 'applied', font: message.font });
        this.postInstalled();
      }
    });
  }

  private postInstalled() {
    this.postFonts();
  }

  private postFonts() {
    const fonts = this.getFonts();
    this._view?.webview.postMessage({
      type: 'installed',
      fonts: Object.keys(fonts),
      categories: fonts,
      installed: getInstalledFontNames(Object.keys(fonts)),
      currentFont: this.getCurrentFont(),
    });
  }

  private _getHtmlContent(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'out', 'media', 'main.js')
    );
    const families = Object.keys(this._fonts)
      .map((f) => 'family=' + f.replace(/ /g, '+'))
      .join('&');
    const fontsCssUrl = 'https://fonts.googleapis.com/css2?' + families + '&display=swap';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com ${webview.cspSource}; font-src https://fonts.gstatic.com; script-src ${webview.cspSource};">
  <title>Google Fonts</title>
  <link rel="stylesheet" href="${fontsCssUrl}">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      padding: 8px;
    }
    .search-box {
      position: sticky;
      top: 0;
      z-index: 10;
      background: var(--vscode-sideBar-background);
      padding-bottom: 8px;
    }
    .search-input {
      width: 100%;
      padding: 8px 12px;
      border: 1px solid var(--vscode-input-border, transparent);
      border-radius: 4px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      font-size: 13px;
      outline: none;
    }
    .search-input:focus { border-color: var(--vscode-focusBorder); }
    .search-input::placeholder { color: var(--vscode-input-placeholderForeground); }
    .filters {
      display: flex;
      gap: 4px;
      margin-top: 8px;
      flex-wrap: wrap;
    }
    .filter-btn {
      padding: 4px 10px;
      border: 1px solid var(--vscode-button-border, transparent);
      border-radius: 4px;
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      cursor: pointer;
      font-size: 11px;
      transition: all 0.15s;
    }
    .filter-btn:hover { background: var(--vscode-button-secondaryHoverBackground); }
    .filter-btn.active {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border-color: var(--vscode-button-border, var(--vscode-focusBorder));
    }
    .font-count {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      margin: 8px 0 4px 0;
    }
    .status {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      margin: 2px 0 6px 0;
      min-height: 14px;
    }
    .status.ok {
      color: #73c991;
    }
    .toolbar {
      display: flex;
      gap: 6px;
      margin-bottom: 8px;
    }
    .action-btn {
      flex: 1;
      padding: 6px 8px;
      border: 1px solid var(--vscode-button-border, transparent);
      border-radius: 4px;
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      cursor: pointer;
      font-size: 11px;
      font-family: var(--vscode-font-family);
    }
    .action-btn:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }
    .font-list {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .font-card {
      padding: 10px 12px;
      border: 1px solid transparent;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.15s;
    }
    .font-card:hover {
      background: var(--vscode-list-hoverBackground);
      border-color: var(--vscode-list-hoverBorder, transparent);
    }
    .font-card.active {
      background: var(--vscode-list-activeSelectionBackground);
      border-color: var(--vscode-focusBorder);
    }
    .font-name {
      font-size: 13px;
      font-weight: 500;
      margin-bottom: 6px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .font-install {
      font-size: 11px;
      opacity: 0.5;
      cursor: pointer;
      padding: 2px 6px;
      border-radius: 4px;
      font-family: var(--vscode-font-family);
    }
    .font-install:hover {
      opacity: 1;
      background: var(--vscode-button-secondaryBackground);
    }
    .font-badge {
      font-size: 10px;
      color: #73c991;
      border: 1px solid #73c991;
      border-radius: 8px;
      padding: 1px 6px;
      margin-right: 4px;
      font-family: var(--vscode-font-family);
    }
    .font-delete {
      font-size: 11px;
      opacity: 0.5;
      cursor: pointer;
      padding: 2px 6px;
      border-radius: 4px;
      font-family: var(--vscode-font-family);
    }
    .font-delete:hover {
      opacity: 1;
      background: rgba(255, 80, 80, 0.2);
    }
    .font-preview {
      font-size: 20px;
      line-height: 1.4;
      color: var(--vscode-foreground);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      opacity: 0.9;
    }
    .font-category {
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
      margin-top: 4px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .no-results {
      text-align: center;
      padding: 24px;
      color: var(--vscode-descriptionForeground);
      font-size: 13px;
    }
    ::-webkit-scrollbar { width: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: var(--vscode-scrollbarSlider-background); border-radius: 3px; }
  </style>
</head>
<body>
  <div class="search-box">
    <input type="text" class="search-input" id="search" placeholder="Search fonts..." autofocus />
    <div class="filters">
      <button class="filter-btn" data-filter="all">All</button>
      <button class="filter-btn active" data-filter="handwriting">Handwriting</button>
      <button class="filter-btn" data-filter="monospace">Mono</button>
    </div>
    <div class="toolbar">
      <button class="action-btn" id="installFileBtn">Install from file</button>
      <button class="action-btn" id="installUrlBtn">Install from URL</button>
      <button class="action-btn" id="restoreDefaultBtn">Restore default</button>
    </div>
  </div>
  <div class="font-count" id="fontCount"></div>
  <div class="status" id="status"></div>
  <div class="font-list" id="fontList"></div>

  <script src="${scriptUri}"></script>
</body>
</html>`;
  }
}
