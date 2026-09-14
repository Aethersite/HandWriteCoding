import * as vscode from 'vscode';
import * as https from 'https';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFile } from 'child_process';

const FONTS_DIR = path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts');
const REG_KEY = 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts';

const FONT_PS_SCRIPT = `param([string]$Action, [string]$FontPath)
Add-Type -MemberDefinition '[DllImport("gdi32.dll")]public static extern int AddFontResource(string f);[DllImport("gdi32.dll")]public static extern int RemoveFontResource(string f);[DllImport("user32.dll")]public static extern int SendMessage(int h,int m,int w,int l);' -Name FontSwitcherUtil -Namespace FontSwitcher
if ($Action -eq 'Remove') { [FontSwitcher.FontSwitcherUtil]::RemoveFontResource($FontPath) | Out-Null }
else {
  $result = [FontSwitcher.FontSwitcherUtil]::AddFontResource($FontPath)
  if ($result -eq 0) { throw "Windows could not register font: $FontPath" }
}
[FontSwitcher.FontSwitcherUtil]::SendMessage(65535,29,0,0) | Out-Null
`;

function getHelperScriptPath(): string {
  const scriptPath = path.join(os.tmpdir(), 'fontswitcher-font.ps1');
  try {
    if (!fs.existsSync(scriptPath) || fs.readFileSync(scriptPath, 'utf8') !== FONT_PS_SCRIPT) {
      fs.writeFileSync(scriptPath, FONT_PS_SCRIPT, 'utf8');
    }
  } catch {
    /* ignore */
  }
  return scriptPath;
}

function runSessionFontCommand(action: 'Add' | 'Remove', fontPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        getHelperScriptPath(),
        '-Action',
        action,
        '-FontPath',
        fontPath,
      ],
      (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      }
    );
  });
}

function findInstalledFontFiles(family: string): string[] {
  try {
    const key = family.toLowerCase().replace(/ /g, '');
    const files: string[] = [];
    if (!fs.existsSync(FONTS_DIR)) {
      return files;
    }
    for (const file of fs.readdirSync(FONTS_DIR)) {
      if (file.toLowerCase().startsWith(key) && /\.(ttf|otf)$/i.test(file)) {
        files.push(path.join(FONTS_DIR, file));
      }
    }
    return [...new Set(files)];
  } catch {
    return [];
  }
}

function fontFilePath(family: string): string {
  return path.join(FONTS_DIR, family.replace(/[^\w-]+/g, '') + '-Regular.ttf');
}

function httpsGetText(url: string, headers: Record<string, string> = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          httpsGetText(res.headers.location, headers).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error('HTTP ' + res.statusCode));
          return;
        }
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => resolve(data));
        res.on('error', reject);
      })
      .on('error', reject);
  });
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      try {
        fs.unlinkSync(dest);
      } catch {
        /* ignore */
      }
    };
    https
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          downloadFile(res.headers.location, dest).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error('Download failed: HTTP ' + res.statusCode));
          return;
        }
        const file = fs.createWriteStream(dest);
        res.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
        file.on('error', (err) => {
          file.close();
          cleanup();
          reject(err);
        });
      })
      .on('error', (err) => {
        cleanup();
        reject(err);
      });
  });
}

function pickFontUrl(css: string): string | undefined {
  const blocks = css.split('/*').slice(1);
  let firstTrueType: string | undefined;
  let firstOpenType: string | undefined;
  let firstUsable: string | undefined;

  for (const block of blocks) {
    const subset = block.split('*/')[0].trim();
    const match = block.match(/url\((https:[^)]+)\)\s*format\('([^']+)'\)/);
    if (!match) {
      continue;
    }

    const url = match[1];
    const format = match[2].toLowerCase();
    const isUsable = /\.(ttf|otf)(\?.*)?$/i.test(url) || format === 'truetype' || format === 'opentype';

    if (isUsable && !firstUsable) {
      firstUsable = url;
    }

    if (format === 'truetype') {
      if (subset === 'latin') {
        return url;
      }
      if (!firstTrueType) {
        firstTrueType = url;
      }
    }

    if (format === 'opentype' && !firstOpenType) {
      firstOpenType = url;
    }
  }

  const directMatch =
    css.match(/url\((https:[^)]+)\)\s*format\('(?:truetype|opentype)'\)/) ||
    css.match(/url\((https:[^)]+)\)\s*format\('woff2'\)/) ||
    css.match(/url\((https:[^)]+)\)/);

  if (directMatch) {
    const directUrl = directMatch[1];
    if (directUrl.toLowerCase().endsWith('.ttf') || directUrl.toLowerCase().endsWith('.otf')) {
      return directUrl;
    }
    if (!firstUsable && !/\.(woff2?|eot)(\?.*)?$/i.test(directUrl)) {
      return directUrl;
    }
  }

  return firstTrueType || firstOpenType || firstUsable;
}

function ensureUsableWindowsFontUrl(url: string, family: string): string {
  const lower = url.toLowerCase();
  if (lower.endsWith('.ttf') || lower.endsWith('.otf')) {
    return url;
  }

  throw new Error(
    `The font "${family}" is only available as WOFF/WOFF2 web font data, which Windows editor fonts cannot install. Choose a different font or install a .ttf/.otf file manually.`
  );
}

function regAddValue(name: string, value: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile('reg', ['add', REG_KEY, '/v', name, '/t', 'REG_SZ', '/d', value, '/f'], (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

export function getInstalledFontNames(families: string[]): string[] {
  return families.filter((family) => findInstalledFontFiles(family).length > 0);
}

export async function isFontInstalled(family: string): Promise<boolean> {
  return getInstalledFontNames([family]).length > 0;
}

async function confirmSystemFontInstall(family: string): Promise<boolean> {
  const choice = await vscode.window.showWarningMessage(
    `Install "${family}" into C:\\Windows\\Fonts and update the system font registry?`,
    { modal: true },
    'Install',
    'Cancel'
  );
  return choice === 'Install';
}

export async function uninstallGoogleFont(family: string): Promise<void> {
  if (process.platform !== 'win32') {
    throw new Error('Auto-uninstall is only supported on Windows');
  }

  const removed = findInstalledFontFiles(family);
  if (removed.length === 0) {
    await new Promise<void>((resolve) => {
      execFile('reg', ['delete', REG_KEY, '/v', `${family} (TrueType)`, '/f'], () => resolve());
    });
    return;
  }

  for (const full of removed) {
    try {
      await runSessionFontCommand('Remove', full);
    } catch {
      /* ignore; continue removal attempt */
    }
  }

  for (const full of removed) {
    try {
      fs.rmSync(full, { force: true, maxRetries: 3, retryDelay: 200 });
    } catch {
      /* ignore */
    }
  }

  await new Promise<void>((resolve) => {
    execFile('reg', ['delete', REG_KEY, '/v', `${family} (TrueType)`, '/f'], (err) => {
      if (err) {
        resolve();
        return;
      }
      resolve();
    });
  });
}

export async function installGoogleFont(family: string): Promise<void> {
  if (process.platform !== 'win32') {
    throw new Error('Auto-install is only supported on Windows');
  }
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Downloading ${family}...`,
      cancellable: false,
    },
    async () => {
      const query = family.replace(/ /g, '+');
      const css = await httpsGetText(`https://fonts.googleapis.com/css?family=${query}&display=swap`, {
        'User-Agent': 'Mozilla/4.0',
      });
      const url = pickFontUrl(css);
      if (!url) {
        throw new Error('No downloadable TrueType/OpenType file found for ' + family);
      }
      const usableUrl = ensureUsableWindowsFontUrl(url, family);
      if (!fs.existsSync(FONTS_DIR)) {
        fs.mkdirSync(FONTS_DIR, { recursive: true });
      }
      const dest = fontFilePath(family);
      await downloadFile(usableUrl, dest);
      await regAddValue(`${family} (TrueType)`, path.basename(dest));
      await runSessionFontCommand('Add', dest);
      if (!(await isFontInstalled(family))) {
        throw new Error(`Windows did not register ${family}`);
      }
    }
  );
}

function sanitizeFontName(name: string): string {
  return name
    .split(':')[0]
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .trim()
    .replace(/-(Regular|Italic|Bold|Medium|Light|Thin|Black|Variable)$/i, '')
    .replace(/\s+/g, ' ') || 'CustomFont';
}

async function installFontFileToSystem(fontPath: string): Promise<string> {
  if (process.platform !== 'win32') {
    throw new Error('Custom font install is only supported on Windows');
  }

  if (!fs.existsSync(fontPath)) {
    throw new Error('Font file not found');
  }

  const ext = path.extname(fontPath).toLowerCase();
  if (ext !== '.ttf' && ext !== '.otf') {
    throw new Error('Only .ttf and .otf font files are supported');
  }

  if (!fs.existsSync(FONTS_DIR)) {
    fs.mkdirSync(FONTS_DIR, { recursive: true });
  }

  const fileName = path.basename(fontPath);
  const dest = path.join(FONTS_DIR, fileName);
  fs.copyFileSync(fontPath, dest);

  const familyName = sanitizeFontName(path.basename(fontPath, ext));
  await regAddValue(`${familyName} (TrueType)`, fileName);
  await runSessionFontCommand('Add', dest);
  if (!(await isFontInstalled(familyName))) {
    throw new Error(`Windows did not register ${familyName}`);
  }

  return familyName;
}

async function installFontFromUrlValue(rawValue: string): Promise<string> {
  const input = rawValue.trim();
  if (!input) {
    throw new Error('Empty font URL');
  }

  let url = input;
  let familyName = input;
  if (!/^https?:\/\//i.test(input)) {
    familyName = input;
    url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(input).replace(/%20/g, '+')}&display=swap`;
  } else {
    const queryMatch = input.match(/[?&]family=([^&]+)/i);
    if (queryMatch) {
      familyName = decodeURIComponent(queryMatch[1]).replace(/\+/g, ' ');
    } else {
      familyName = sanitizeFontName(path.basename(input).replace(/\.[^/.]+$/, '')) || 'CustomFont';
    }
  }

  const css = await httpsGetText(url, { 'User-Agent': 'Mozilla/4.0' });
  const fontUrl = pickFontUrl(css);
  if (!fontUrl) {
    throw new Error('No downloadable TrueType/OpenType file found for the supplied URL');
  }
  const usableUrl = ensureUsableWindowsFontUrl(fontUrl, familyName);

  if (!fs.existsSync(FONTS_DIR)) {
    fs.mkdirSync(FONTS_DIR, { recursive: true });
  }

  const normalizedFamily = sanitizeFontName(familyName);
  const dest = fontFilePath(normalizedFamily);
  await downloadFile(usableUrl, dest);
  await regAddValue(`${normalizedFamily} (TrueType)`, path.basename(dest));
  await runSessionFontCommand('Add', dest);
  if (!(await isFontInstalled(normalizedFamily))) {
    throw new Error(`Windows did not register ${normalizedFamily}`);
  }

  return normalizedFamily;
}

export async function installFromFileCommand(): Promise<string | undefined> {
  const file = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    openLabel: 'Install font',
    filters: {
      'Font files': ['ttf', 'otf'],
    },
  });
  if (!file || file.length === 0) {
    return undefined;
  }
  try {
    const selectedFamily = sanitizeFontName(path.basename(file[0].fsPath, path.extname(file[0].fsPath)));
    if (!(await confirmSystemFontInstall(selectedFamily))) {
      return undefined;
    }
    const familyName = await installFontFileToSystem(file[0].fsPath);
    await applyEditorFont(familyName);
    vscode.window.showInformationMessage(`Installed font: ${familyName}`);
    return familyName;
  } catch (e: unknown) {
    const detail = e instanceof Error ? e.message : String(e);
    vscode.window.showWarningMessage(`Could not install font from file: ${detail}`);
    return undefined;
  }
}

export async function installFromUrlCommand(): Promise<string | undefined> {
  const input = await vscode.window.showInputBox({
    prompt: 'Paste a Google Fonts CSS URL or a font family name',
    placeHolder: 'https://fonts.googleapis.com/css2?family=Caveat&display=swap',
    ignoreFocusOut: true,
  });
  if (!input) {
    return undefined;
  }
  try {
    if (!(await confirmSystemFontInstall(input))) {
      return undefined;
    }
    const familyName = await installFontFromUrlValue(input);
    await applyEditorFont(familyName);
    vscode.window.showInformationMessage(`Installed font: ${familyName}`);
    return familyName;
  } catch (e: unknown) {
    const detail = e instanceof Error ? e.message : String(e);
    vscode.window.showWarningMessage(`Could not install font from URL: ${detail}`);
    return undefined;
  }
}

async function applyEditorFont(family: string) {
  const editorConfig = vscode.workspace.getConfiguration('editor');
  const fontSetting = editorConfig.inspect('fontFamily');
  const target = fontSetting && fontSetting.workspaceValue !== undefined
    ? vscode.ConfigurationTarget.Workspace
    : vscode.ConfigurationTarget.Global;

  await editorConfig.update('fontFamily', `'${family}', monospace`, target);

  setTimeout(() => {
    vscode.commands.executeCommand('workbench.action.reloadWindow');
  }, 400);
}

export async function applyGoogleFont(family: string): Promise<void> {
  try {
    if (!(await isFontInstalled(family))) {
      if (!(await confirmSystemFontInstall(family))) {
        return;
      }
      await installGoogleFont(family);
      await applyEditorFont(family);
      vscode.window.showInformationMessage(`Installed ${family} — reloading to apply it...`);
      return;
    }
  } catch (e: unknown) {
    const detail = e instanceof Error ? e.message : String(e);
    const action = await vscode.window.showErrorMessage(
      `Could not install ${family}: ${detail}`,
      'Run VS Code as Administrator'
    );
    if (action === 'Run VS Code as Administrator') {
      vscode.window.showInformationMessage(
        'Close VS Code, right-click it, choose "Run as administrator", then start the extension again.'
      );
    }
    return;
  }
  for (const existing of findInstalledFontFiles(family)) {
    await runSessionFontCommand('Add', existing);
  }
  await applyEditorFont(family);
  vscode.window.showInformationMessage(`Font: ${family}`);
}
