'use strict';
const vscode = require('vscode');
const crypto = require('node:crypto');
const { parseLink, candidates } = require('./links');
const viewType = 'svglink.viewer';

function activate(context) {
  const provider = new SVGLinkProvider(context);
  context.subscriptions.push(vscode.window.registerCustomEditorProvider(viewType, provider, {
    webviewOptions: { retainContextWhenHidden: true }, supportsMultipleEditorsPerDocument: true
  }));
  for (const [command, beside] of [['svglink.open', false], ['svglink.openBeside', true]]) {
    context.subscriptions.push(vscode.commands.registerCommand(command, async resource => {
      try {
        let uri = resource || vscode.window.activeTextEditor?.document.uri;
        if (!uri || !/\.svg$/i.test(uri.path)) {
          const selected = await vscode.window.showOpenDialog({ filters: { 'SVG images': ['svg'] }, canSelectMany: false });
          uri = selected?.[0];
        }
        if (uri) await vscode.commands.executeCommand('vscode.openWith', uri, viewType, beside ? vscode.ViewColumn.Beside : vscode.ViewColumn.Active);
      } catch (error) { vscode.window.showErrorMessage(`SVGLink: ${error.message}`); }
    }));
  }
  return { openLink };
}

class SVGLinkProvider {
  constructor(context) { this.context = context; }

  resolveCustomTextEditor(document, panel) {
    const webview = panel.webview;
    webview.options = { enableScripts: true, enableCommandUris: false, localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'dist')] };
    webview.html = html(webview, this.context.extensionUri);
    let timer;
    const update = () => webview.postMessage({ type: 'render', svg: document.getText(), name: vscode.workspace.asRelativePath(document.uri) });
    const change = vscode.workspace.onDidChangeTextDocument(event => {
      if (event.document.uri.toString() !== document.uri.toString()) return;
      clearTimeout(timer);
      timer = setTimeout(update, 150);
    });
    const messages = webview.onDidReceiveMessage(async message => {
      if (!message || typeof message.type !== 'string') return;
      if (message.type === 'ready') { update(); return; }
      if (message.type === 'source') {
        await vscode.window.showTextDocument(document, { viewColumn: vscode.ViewColumn.Beside });
        return;
      }
      if (message.type !== 'openLink' || typeof message.href !== 'string') return;
      try {
        await openLink(message.href, document.uri, panel.viewColumn);
        webview.postMessage({ type: 'status', text: `Opened ${message.href}`, error: false });
      } catch (error) {
        webview.postMessage({ type: 'status', text: error.message, error: true });
        vscode.window.showWarningMessage(`SVGLink: ${error.message}`);
      }
    });
    panel.onDidDispose(() => { clearTimeout(timer); change.dispose(); messages.dispose(); });
  }
}

async function openLink(href, svgUri, viewColumn) {
  const target = parseLink(href);
  if (target.anchor !== undefined) return;
  const roots = (vscode.workspace.workspaceFolders || []).map(folder => folder.uri);
  if (!roots.length) throw new Error('Open a project folder in VS Code before following source links.');
  const options = candidates(target.path, svgUri, roots);
  if (!options.length) throw new Error('The linked file is outside the current workspace.');
  let uri;
  for (const candidate of options) {
    const attempt = vscode.Uri.from(candidate);
    try {
      const stat = await vscode.workspace.fs.stat(attempt);
      if (stat.type & vscode.FileType.Directory) continue;
      uri = attempt;
      break;
    } catch { /* Try the next workspace-relative candidate. */ }
  }
  if (!uri) throw new Error(`Source file not found in the workspace: ${target.path}`);
  const document = await vscode.workspace.openTextDocument(uri);
  const configuration = vscode.workspace.getConfiguration('svglink', svgUri);
  const beside = configuration.get('openLinksBeside', true);
  const position = target.line ? document.validatePosition(new vscode.Position(target.line - 1, (target.column || 1) - 1)) : undefined;
  const editor = await vscode.window.showTextDocument(document, {
    viewColumn: beside ? (viewColumn > 0 ? Math.min(viewColumn + 1, vscode.ViewColumn.Nine) : vscode.ViewColumn.Beside) : viewColumn,
    preview: false,
    selection: position ? new vscode.Range(position, position) : undefined
  });
  if (position) editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  return editor;
}

function html(webview, extensionUri) {
  const nonce = crypto.randomBytes(24).toString('base64');
  const resource = name => webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', name));
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src data:; connect-src 'none'; base-uri 'none'; form-action 'none';">
<link rel="stylesheet" href="${resource('viewer.css')}"><title>SVGLink</title></head>
<body><header><strong>SVGLink</strong><span id="filename"></span><div class="controls">
<button id="zoom-out" title="Zoom out (-)" aria-label="Zoom out">−</button><output id="zoom">100%</output><button id="zoom-in" title="Zoom in (+)" aria-label="Zoom in">+</button>
<button id="fit" title="Fit image (F)">Fit</button><button id="actual" title="Actual size (0)">1:1</button>
<button id="background" title="Change canvas background">Background</button><button id="source" title="Open SVG source beside preview">SVG source</button>
</div></header><main id="viewport" tabindex="0" aria-label="SVG preview. Drag the background to pan; Control or Command plus wheel to zoom."><div id="canvas"></div><div id="empty">Loading SVG…</div></main>
<footer><span id="status" role="status" aria-live="polite">Click a linked shape to open its source file.</span><span>Drag to pan · Ctrl/⌘ + wheel to zoom</span></footer>
<script nonce="${nonce}" src="${resource('purify.min.js')}"></script><script nonce="${nonce}" src="${resource('viewer.js')}"></script></body></html>`;
}

module.exports = { activate, openLink, html };
