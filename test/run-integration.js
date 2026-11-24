'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { runTests } = require('@vscode/test-electron');
const project = path.resolve(__dirname, '..');
const packaged = process.argv.includes('--vsix');
const installedPath = path.join(project, '.vscode-test/packaged-extensions/digitalexpressions.svglink-0.1.0');
const localVSCode = process.env.VSCODE_EXECUTABLE || (process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs/Microsoft VS Code/Code.exe'));
// Terminals inside VS Code can inherit Electron's Node-only mode and IPC hooks.
delete process.env.ELECTRON_RUN_AS_NODE;
for (const name of Object.keys(process.env)) if (name.startsWith('VSCODE_')) delete process.env[name];
runTests({
  ...(localVSCode && fs.existsSync(localVSCode) ? { vscodeExecutablePath: localVSCode } : {}),
  extensionDevelopmentPath: packaged ? installedPath : project,
  extensionTestsEnv: { SVGLINK_PACKAGED_TEST: packaged ? '1' : '' },
  extensionTestsPath: path.join(__dirname, 'integration/index.js'),
  launchArgs: [project, ...(packaged ? [] : ['--disable-extensions']), '--disable-gpu', '--skip-welcome', '--skip-release-notes', '--disable-workspace-trust', '--user-data-dir', path.join(project, '.vscode-test/user-data'), '--extensions-dir', path.join(project, packaged ? '.vscode-test/packaged-extensions' : '.vscode-test/extensions')]
}).catch(error => { console.error(error); process.exitCode = 1; });
