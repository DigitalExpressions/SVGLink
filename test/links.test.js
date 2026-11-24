'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseLink, candidates, within } = require('../src/links');

for (const [href, expected] of [
  ['../src/main.ts#L42C5', { path: '../src/main.ts', line: 42, column: 5 }],
  ['src/main.ts:42:5', { path: 'src/main.ts', line: 42, column: 5 }],
  ['src/main.ts:42', { path: 'src/main.ts', line: 42, column: 1 }],
  ['src/main.ts#L42-L48', { path: 'src/main.ts', line: 42, column: 1 }],
  ['src/main.ts#42:5', { path: 'src/main.ts', line: 42, column: 5 }],
  ['src/main.ts?line=42&column=5', { path: 'src/main.ts', line: 42, column: 5 }],
  ['src/my%20file.ts#L2', { path: 'src/my file.ts', line: 2, column: 1 }],
  ['C:\\project\\src\\main.ts:42:5', { path: '/C:/project/src/main.ts', line: 42, column: 5 }],
  ['file:///C:/project/src/main.ts#L42', { path: '/C:/project/src/main.ts', line: 42, column: 1 }],
  ['file:///home/user/main.ts#L42', { path: '/home/user/main.ts', line: 42, column: 1 }],
  ['vscode://file/C:/project/src/main.ts:42:5', { path: '/C:/project/src/main.ts', line: 42, column: 5 }],
  ['vscode://file/home/user/main.ts:42:5', { path: '/home/user/main.ts', line: 42, column: 5 }],
  ['#detail%20node', { anchor: 'detail node' }]
]) test(`parses ${href}`, () => assert.deepEqual(parseLink(href), expected));

for (const href of ['javascript:alert(1)', 'command:workbench.action.terminal.new', 'https://example.com/src.ts', 'file://server/file.ts', 'src.ts#L0', 'src.ts?line=-1', 'src.ts#L99999999999999999999', 'src%00.ts', 'src%XX.ts', '', 'src.ts#symbol']) {
  test(`rejects invalid or unsupported link ${href}`, () => assert.throws(() => parseLink(href)));
}

const root = { scheme: 'file', authority: '', path: '/project' };
const svg = { ...root, path: '/project/docs/diagram.svg' };
test('resolves SVG-relative before workspace-relative paths', () => {
  assert.deepEqual(candidates('src/main.ts', svg, [root]).map(x => x.path), ['/project/docs/src/main.ts', '/project/src/main.ts']);
});
test('normalizes parent paths and removes duplicates', () => {
  assert.deepEqual(candidates('../src/main.ts', svg, [root]).map(x => x.path), ['/project/src/main.ts']);
});
test('supports leading slash workspace paths', () => {
  assert.deepEqual(candidates('/src/main.ts', svg, [root]).map(x => x.path), ['/project/src/main.ts']);
});
test('supports absolute paths inside the project', () => {
  assert.equal(candidates('/project/src/main.ts', svg, [root])[0].path, '/project/src/main.ts');
});
test('blocks directory traversal and sibling prefix collisions', () => {
  assert.deepEqual(candidates('../../outside.ts', svg, [root]), []);
  assert.equal(within('/project-other/file.ts', '/project'), false);
});
test('prioritizes containing root in multi-root projects', () => {
  const other = { ...root, path: '/other' };
  assert.deepEqual(candidates('main.ts', svg, [other, root]).map(x => x.path), ['/project/docs/main.ts', '/project/main.ts', '/other/main.ts']);
});
test('preserves remote scheme and authority', () => {
  const remote = { scheme: 'vscode-remote', authority: 'ssh-remote+host', path: '/project' };
  const remoteSvg = { ...remote, path: '/project/docs/diagram.svg' };
  assert.deepEqual(candidates('../src/main.ts', remoteSvg, [remote]), [{ ...remote, path: '/project/src/main.ts' }]);
});
test('does not confuse different workspace authorities', () => {
  const remote = { scheme: 'vscode-remote', authority: 'ssh-remote+host', path: '/project' };
  assert.deepEqual(candidates('../src/main.ts', svg, [remote]), []);
});
test('compares Windows drive-letter paths without case sensitivity', () => {
  assert.equal(within('/c:/PROJECT/main.ts', '/C:/project', true), true);
});
