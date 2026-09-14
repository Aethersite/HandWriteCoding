import * as vscode from 'vscode';
import { FontPanelViewProvider } from './FontPanelViewProvider';
import { applyGoogleFont, installFromFileCommand, installFromUrlCommand } from './fontInstaller';

let currentIndex = 0;

function getFonts(): string[] {
  const config = vscode.workspace.getConfiguration('fontSwitcher');
  return config.get<string[]>('fonts', [
    'Caveat',
    'Kalam',
    'Shadows Into Light',
    'Indie Flower',
    'Gochi Hand',
    'Neucha',
    'Architects Daughter',
    'Permanent Marker',
  ]);
}

async function cycleFont(direction: 'next' | 'previous') {
  const fonts = getFonts();
  if (fonts.length === 0) {
    vscode.window.showWarningMessage('No fonts configured.');
    return;
  }
  if (direction === 'next') {
    currentIndex = (currentIndex + 1) % fonts.length;
  } else {
    currentIndex = (currentIndex - 1 + fonts.length) % fonts.length;
  }
  await applyGoogleFont(fonts[currentIndex]);
}

async function pickFont() {
  const fonts = getFonts();
  if (fonts.length === 0) {
    vscode.window.showWarningMessage('No fonts configured.');
    return;
  }
  const picked = await vscode.window.showQuickPick(fonts, { placeHolder: 'Select a font' });
  if (picked) {
    currentIndex = fonts.indexOf(picked);
    await applyGoogleFont(picked);
  }
}

async function resetFont() {
  const config = vscode.workspace.getConfiguration('editor');
  const defaultFont = config.inspect('fontFamily');
  if (defaultFont) {
    await config.update('fontFamily', defaultFont.defaultValue, vscode.ConfigurationTarget.Global);
    vscode.window.showInformationMessage('Font reset to default');
  }
}

export function activate(context: vscode.ExtensionContext) {
  const provider = new FontPanelViewProvider(context.extensionUri, context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(FontPanelViewProvider.viewType, provider),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('fontSwitcher.next', () => cycleFont('next')),
    vscode.commands.registerCommand('fontSwitcher.previous', () => cycleFont('previous')),
    vscode.commands.registerCommand('fontSwitcher.pick', pickFont),
    vscode.commands.registerCommand('fontSwitcher.reset', resetFont),
    vscode.commands.registerCommand('fontSwitcher.restoreDefault', resetFont),
    vscode.commands.registerCommand('fontSwitcher.installFile', installFromFileCommand),
    vscode.commands.registerCommand('fontSwitcher.installUrl', installFromUrlCommand),
  );
}

export function deactivate() {}
