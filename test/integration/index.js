'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vscode = require('vscode');

async function run() {
  const extension = vscode.extensions.getExtension('digitalexpressions.svglink');
  assert.ok(extension, 'SVGLink is registered');
  const { openLink } = await extension.activate();
  const root = vscode.workspace.workspaceFolders[0].uri;
  const diagram = vscode.Uri.joinPath(root, 'examples/diagram.svg');
  const commands = await vscode.commands.getCommands(true);
  assert.ok(commands.includes('svglink.open'));
  assert.ok(commands.includes('svglink.openBeside'));
  await vscode.commands.executeCommand('vscode.openWith', diagram, 'svglink.viewer');
  let editor = await openLink('../src/links.js#L4C3', diagram, vscode.ViewColumn.One);
  assert.equal(editor.document.uri.toString(), vscode.Uri.joinPath(root, 'src/links.js').toString());
  assert.equal(editor.selection.active.line, 3);
  assert.equal(editor.selection.active.character, 2);
  assert.equal(editor.viewColumn, vscode.ViewColumn.Two, 'Repeated links reuse the group beside the SVG');
  assert.equal(editor.viewColumn, vscode.ViewColumn.Two);
  editor = await openLink('media/viewer.js?line=4&column=3', diagram, vscode.ViewColumn.One);
  assert.equal(editor.document.uri.toString(), vscode.Uri.joinPath(root, 'media/viewer.js').toString());
  assert.equal(editor.selection.active.line, 3);
  assert.equal(editor.selection.active.character, 2);
  editor = await openLink('/src/links.js:4:1', diagram, vscode.ViewColumn.One);
  assert.equal(editor.selection.active.line, 3);
  editor = await openLink(vscode.Uri.joinPath(root, 'src/links.js').toString() + '#L4', diagram, vscode.ViewColumn.One);
  assert.equal(editor.selection.active.line, 3);
  await assert.rejects(openLink('../missing-file.ts', diagram), /not found/);
  await assert.rejects(openLink('command:evil', diagram), /Only links to files/);
  await assert.rejects(openLink('../../../../outside.ts', diagram), /outside the current workspace/);
  const results = path.join(root.fsPath, 'test-results');
  fs.mkdirSync(results, { recursive: true });
  fs.writeFileSync(path.join(results, process.env.SVGLINK_PACKAGED_TEST ? 'packaged-integration.json' : 'integration.json'), JSON.stringify({ passed: true, vscode: vscode.version, checks: ['activation', 'custom editor', 'SVG-relative source', 'workspace-relative source', 'root-relative source', 'absolute file URI', 'line and column', 'beside editor', 'missing file', 'unsafe scheme', 'outside workspace'] }, null, 2));
  console.log('SVGLink integration checks passed.');
}
module.exports = { run };
