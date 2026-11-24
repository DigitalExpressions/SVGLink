'use strict';
const path = require('node:path').posix;

function parseLink(href) {
  if (typeof href !== 'string' || !href.trim() || href.length > 16384) throw new Error('The SVG link is empty or too long.');
  let value = href.trim();
  if (/[\u0000-\u001f\u007f]/.test(value)) throw new Error('The link contains invalid control characters.');
  if (value.startsWith('#')) return { anchor: decode(value.slice(1)) };
  if (/^vscode(?:-insiders)?:\/\/file\//i.test(value)) {
    value = value.replace(/^vscode(?:-insiders)?:\/\/file\//i, '');
    if (!/^[a-z]:[\\/]/i.test(value)) value = '/' + value;
  } else if (/^file:/i.test(value)) {
    const url = new URL(value);
    if (url.hostname && url.hostname !== 'localhost') throw new Error('Network file links are not supported. Use a workspace-relative path.');
    value = url.pathname + url.search + url.hash;
  } else if (/^[a-z][a-z\d+.-]*:/i.test(value) && !/^[a-z]:[\\/]/i.test(value)) {
    throw new Error('Only links to files in the current workspace are supported.');
  }
  let line, column;
  const hash = value.indexOf('#');
  if (hash !== -1) {
    const fragment = value.slice(hash + 1);
    value = value.slice(0, hash);
    const match = /^(?:L)?(\d+)(?:(?:C|[:,])(\d+))?(?:-L?\d+(?:C\d+)?)?$/i.exec(fragment);
    if (fragment && !match) throw new Error('Use a line fragment such as #L42 or #L42C5 for source files.');
    if (match) { line = number(match[1]); column = match[2] ? number(match[2]) : 1; }
  }
  const question = value.indexOf('?');
  if (question !== -1) {
    const query = new URLSearchParams(value.slice(question + 1));
    value = value.slice(0, question);
    if (!line && query.has('line')) { line = number(query.get('line')); column = number(query.get('column') || '1'); }
  }
  const suffix = /:(\d+)(?::(\d+))?$/.exec(value);
  if (suffix) {
    value = value.slice(0, suffix.index);
    if (!line) { line = number(suffix[1]); column = suffix[2] ? number(suffix[2]) : 1; }
  }
  value = decode(value).replace(/\\/g, '/');
  if (/[\u0000-\u001f\u007f]/.test(value)) throw new Error('The link contains invalid control characters.');
  // VS Code URI paths include a leading slash before Windows drive letters.
  if (/^[a-z]:\//i.test(value)) value = '/' + value;
  if (!value) throw new Error('The link does not specify a source file.');
  return { path: value, line, column };
}

function decode(value) {
  try { return decodeURIComponent(value); } catch { throw new Error('The SVG link has invalid percent encoding.'); }
}

function number(value) {
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) throw new Error('Line and column numbers must be positive integers.');
  return Number(value);
}

function within(file, folder, ignoreCase = process.platform === 'win32') {
  let a = path.normalize(file), b = path.normalize(folder).replace(/\/$/, '');
  if (ignoreCase) { a = a.toLowerCase(); b = b.toLowerCase(); }
  return a === b || a.startsWith(b + '/');
}

// Returns candidates in priority order: SVG directory, containing workspace, other roots.
// Each carries its root's scheme and authority, so remote workspaces work as well.
function candidates(targetPath, document, roots) {
  const sameOrigin = (a, b) => a.scheme === b.scheme && a.authority === b.authority;
  const containing = roots.find(root => sameOrigin(root, document) && within(document.path, root.path));
  const ordered = containing ? [containing, ...roots.filter(root => root !== containing)] : roots;
  const result = [];
  function add(filePath, origin) {
    filePath = path.normalize(filePath);
    if (!roots.some(root => sameOrigin(root, origin) && within(filePath, root.path))) return;
    if (!result.some(item => item.path === filePath && sameOrigin(item, origin))) result.push({ scheme: origin.scheme, authority: origin.authority, path: filePath });
  }
  if (targetPath.startsWith('/')) {
    add(targetPath, document);
    if (!/^\/[a-z]:\//i.test(targetPath)) for (const root of ordered) add(path.join(root.path, targetPath.slice(1)), root);
  } else {
    add(path.resolve(path.dirname(document.path), targetPath), document);
    for (const root of ordered) add(path.resolve(root.path, targetPath), root);
  }
  return result;
}

module.exports = { parseLink, candidates, within };
