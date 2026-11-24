'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const vm = require('node:vm');

test('browser: renders SVG, follows links, zooms, pans, updates and sanitizes', async t => {
  const executablePath = [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe'
  ].find(file => fs.existsSync(file));
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const extensionModule = { exports: {} };
  vm.runInNewContext(fs.readFileSync('src/extension.js', 'utf8'), {
    module: extensionModule,
    require: name => name === 'vscode' ? { Uri: { joinPath: (...parts) => parts.join('/') } } : name === './links' ? require('../src/links') : require(name)
  });
  const html = extensionModule.exports.html({ cspSource: 'https://svglink.test', asWebviewUri: uri => uri }, 'https://svglink.test');
  await page.route('https://svglink.test/**', async route => {
    const filename = new URL(route.request().url()).pathname.split('/').at(-1);
    const resources = { 'purify.min.js': path.join(path.dirname(require.resolve('dompurify')), 'purify.min.js'), 'viewer.js': 'media/viewer.js', 'viewer.css': 'media/viewer.css' };
    if (filename === 'index.html') await route.fulfill({ contentType: 'text/html', body: html });
    else if (resources[filename]) await route.fulfill({ path: resources[filename], contentType: filename.endsWith('.css') ? 'text/css' : 'application/javascript' });
    else await route.abort();
  });
  await page.addInitScript(() => {
    window.messages = [];
    window.acquireVsCodeApi = () => ({ postMessage: message => window.messages.push(message), getState: () => undefined, setState: state => { window.savedState = state; } });
    const original = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function (options) {
      const root = original.call(this, options);
      window.testShadow = root; // Test-only access to the production closed shadow root.
      return root;
    };
  });
  await page.goto('https://svglink.test/index.html');
  await page.waitForFunction(() => window.messages.some(message => message.type === 'ready'));
  const render = async svg => {
    await page.evaluate(svg => window.postMessage({ type: 'render', svg, name: 'diagram.svg' }, '*'), svg);
    await page.waitForFunction(() => document.getElementById('filename').textContent === 'diagram.svg');
    await page.waitForTimeout(100);
  };
  await render(fs.readFileSync('examples/diagram.svg', 'utf8'));
  assert.equal(await page.evaluate(() => window.testShadow.querySelectorAll('a[data-svglink-link]').length), 3);
  assert.equal(await page.locator('#empty').isVisible(), false);
  fs.mkdirSync('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/viewer.png' });
  // Real pointer events exercise anchor click handling across a closed shadow root.
  const anchorCenter = await page.evaluate(() => {
    const rect = window.testShadow.querySelector('a').getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  });
  await page.mouse.click(anchorCenter.x, anchorCenter.y);
  assert.deepEqual(await page.evaluate(() => window.messages.find(x => x.type === 'openLink')), { type: 'openLink', href: '../src/extension.js#L8' });
  await page.evaluate(() => {
    window.testShadow.querySelectorAll('a')[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true }));
  });
  assert.equal(await page.evaluate(() => window.messages.filter(x => x.type === 'openLink').at(-1).href), '../src/links.js:4:1');
  const oldScale = await page.evaluate(() => window.savedState.scale);
  await page.locator('#zoom-in').click();
  assert.ok(await page.evaluate(() => window.savedState.scale) > oldScale);
  const oldX = await page.evaluate(() => window.savedState.x);
  await page.mouse.move(500, 550); await page.mouse.down(); await page.mouse.move(550, 570); await page.mouse.up();
  assert.equal(Math.round(await page.evaluate(() => window.savedState.x) - oldX), 50);
  await page.locator('#fit').click();
  assert.equal(await page.evaluate(() => window.savedState.autoFit), true);
  await page.locator('#source').click();
  assert.ok(await page.evaluate(() => window.messages.some(x => x.type === 'source')));

  await render(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="100" onload="window.attacked=true">
    <style>header { display:none } rect { fill: green }</style>
    <script>window.attacked=true</script><foreignObject><div>Unsafe</div></foreignObject>
    <rect id="safe" width="80" height="40"/><image href="https://example.com/tracker.png"/>
    <use href="https://example.com/external.svg#shape"/><animate attributeName="href" to="javascript:alert(1)"/>
    <a href="command:evil"><rect x="100" width="50" height="50"/></a>
  </svg>`);
  assert.equal(await page.evaluate(() => Boolean(window.attacked)), false);
  assert.equal(await page.evaluate(() => window.testShadow.querySelectorAll('script,foreignObject,animate,[onload],image[href],use[href]').length), 0);
  assert.equal(await page.locator('header').isVisible(), true);
  assert.equal(await page.evaluate(() => getComputedStyle(window.testShadow.querySelector('#safe')).fill), 'rgb(0, 128, 0)');
  await render('<svg><broken></svg>');
  assert.equal(await page.locator('#empty').isVisible(), true);
  assert.match(await page.locator('#status').textContent(), /Invalid SVG/);
  await render(fs.readFileSync('examples/diagram.svg', 'utf8'));
  assert.equal(await page.locator('#empty').isVisible(), false);
  assert.deepEqual(errors, []);
});
