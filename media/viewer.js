/* global acquireVsCodeApi, DOMPurify */
'use strict';
(() => {
  const vscode = acquireVsCodeApi();
  const viewport = document.getElementById('viewport');
  const canvas = document.getElementById('canvas');
  const shadow = canvas.attachShadow({ mode: 'closed' });
  const empty = document.getElementById('empty');
  const status = document.getElementById('status');
  const zoom = document.getElementById('zoom');
  const filename = document.getElementById('filename');
  const saved = vscode.getState() || {};
  let scale = saved.scale || 1, x = saved.x || 0, y = saved.y || 0;
  let width = 800, height = 600, svg, dragging, moved = false;
  let autoFit = saved.autoFit !== false;
  const backgrounds = ['checker', 'light', 'dark'];
  let background = backgrounds.includes(saved.background) ? saved.background : 'checker';
  viewport.dataset.background = background;

  DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
    if (data.attrName === 'href' || data.attrName === 'xlink:href') {
      const value = data.attrValue.trim();
      const rasterImage = node.localName === 'image' && /^data:image\/(?:png|jpeg|gif|webp);base64,[a-z\d+/=\s]+$/i.test(value);
      if (!value.startsWith('#') && !rasterImage) data.keepAttr = false;
    }
  });

  function showStatus(text, error = false) { status.textContent = text; status.classList.toggle('error', error); }
  function apply() {
    canvas.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    zoom.textContent = `${Math.round(scale * 100)}%`;
    vscode.setState({ scale, x, y, autoFit, background });
  }
  function fit() {
    if (!svg) return;
    autoFit = true;
    scale = Math.max(0.01, Math.min(32, (viewport.clientWidth - 48) / width, (viewport.clientHeight - 48) / height));
    x = (viewport.clientWidth - width * scale) / 2;
    y = (viewport.clientHeight - height * scale) / 2;
    apply();
  }
  function zoomAt(factor, cx = viewport.clientWidth / 2, cy = viewport.clientHeight / 2) {
    const next = Math.max(0.01, Math.min(32, scale * factor));
    x = cx - (cx - x) * next / scale;
    y = cy - (cy - y) * next / scale;
    scale = next;
    autoFit = false;
    apply();
  }

  function render(source) {
    try {
      const parsed = new DOMParser().parseFromString(source, 'image/svg+xml');
      if (parsed.querySelector('parsererror') || parsed.documentElement.localName !== 'svg' || parsed.documentElement.namespaceURI !== 'http://www.w3.org/2000/svg') {
        throw new Error('Invalid SVG. Open SVG source to correct the XML.');
      }
      // Preserve source paths before sanitizing; anchors never navigate the webview.
      for (const anchor of parsed.querySelectorAll('a')) {
        const href = anchor.getAttribute('href') || anchor.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
        if (!href) continue;
        anchor.setAttribute('data-svglink-link', href);
        anchor.removeAttributeNS('http://www.w3.org/1999/xlink', 'href');
        anchor.setAttribute('href', '#');
        anchor.setAttribute('tabindex', '0');
        anchor.setAttribute('role', 'link');
        anchor.setAttribute('aria-label', href);
      }
      const clean = DOMPurify.sanitize(new XMLSerializer().serializeToString(parsed.documentElement), {
        USE_PROFILES: { svg: true, svgFilters: true },
        RETURN_DOM_FRAGMENT: true,
        FORBID_TAGS: ['script', 'foreignObject', 'animate', 'animateMotion', 'animateTransform', 'animateColor', 'set', 'discard', 'mpath'],
        FORBID_ATTR: ['target', 'xml:base'],
        ADD_ATTR: ['data-svglink-link', 'tabindex', 'role', 'aria-label']
      });
      const next = clean.querySelector('svg');
      if (!next) throw new Error('The SVG could not be rendered.');
      shadow.replaceChildren(clean);
      svg = next;
      const box = svg.viewBox.baseVal;
      width = box?.width || svg.width?.baseVal.value || 800;
      height = box?.height || svg.height?.baseVal.value || 600;
      if (!(width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height))) throw new Error('The SVG has invalid dimensions.');
      svg.style.setProperty('width', `${width}px`, 'important');
      svg.style.setProperty('height', `${height}px`, 'important');
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      const style = document.createElement('style');
      style.textContent = 'a[data-svglink-link] { cursor: pointer; } a[data-svglink-link]:hover { filter: brightness(1.15); } a[data-svglink-link]:focus { outline: 2px solid #3794ff; }';
      shadow.append(style);
      empty.hidden = true;
      if (autoFit) fit(); else apply();
      showStatus('Click a linked shape to open its source file.');
    } catch (error) {
      svg = undefined;
      shadow.replaceChildren();
      empty.hidden = false;
      empty.textContent = error.message;
      showStatus(error.message, true);
    }
  }

  function anchorFrom(event) {
    return event.composedPath().find(node => node instanceof Element && node.localName === 'a' && node.hasAttribute('data-svglink-link'));
  }
  function openAnchor(anchor) {
    const href = anchor.getAttribute('data-svglink-link');
    if (href.startsWith('#')) {
      let id;
      try { id = decodeURIComponent(href.slice(1)); } catch { showStatus('Invalid anchor encoding.', true); return; }
      const target = Array.from(svg.querySelectorAll('[id]')).find(node => node.id === id);
      if (target) {
        const bounds = target.getBoundingClientRect(), frame = viewport.getBoundingClientRect();
        x += frame.left + frame.width / 2 - (bounds.left + bounds.width / 2);
        y += frame.top + frame.height / 2 - (bounds.top + bounds.height / 2);
        autoFit = false; apply();
      } else showStatus(`SVG anchor not found: ${href}`, true);
      return;
    }
    showStatus(`Opening ${href}…`);
    vscode.postMessage({ type: 'openLink', href });
  }
  shadow.addEventListener('click', event => {
    event.preventDefault();
    const anchor = anchorFrom(event);
    if (anchor && !moved) openAnchor(anchor);
  });
  shadow.addEventListener('auxclick', event => event.preventDefault());
  shadow.addEventListener('keydown', event => {
    const anchor = anchorFrom(event);
    if (anchor && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); event.stopPropagation(); openAnchor(anchor); }
  });
  shadow.addEventListener('mouseover', event => {
    const anchor = anchorFrom(event);
    if (anchor) showStatus(anchor.getAttribute('data-svglink-link'));
  });
  viewport.addEventListener('pointerdown', event => {
    moved = false;
    if (event.button !== 0 || event.composedPath().includes(empty)) return;
    // Anchor clicks stay clicks. Drag the canvas around links to pan.
    // Closed shadow roots hide internal nodes here; the shadow listener marks links.
    if (event.target === canvas && canvas.dataset.linkPointer === 'true') return;
    dragging = { pointer: event.pointerId, startX: event.clientX, startY: event.clientY, x, y };
    viewport.setPointerCapture(event.pointerId);
  });
  shadow.addEventListener('pointerdown', event => { canvas.dataset.linkPointer = String(Boolean(anchorFrom(event))); });
  viewport.addEventListener('pointermove', event => {
    if (!dragging) return;
    const dx = event.clientX - dragging.startX, dy = event.clientY - dragging.startY;
    if (Math.hypot(dx, dy) < 3 && !moved) return;
    moved = true; autoFit = false;
    x = dragging.x + dx; y = dragging.y + dy;
    viewport.classList.add('dragging'); apply();
  });
  function endDrag(event) {
    if (dragging && viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
    dragging = undefined;
    canvas.dataset.linkPointer = 'false';
    viewport.classList.remove('dragging');
  }
  viewport.addEventListener('pointerup', endDrag);
  viewport.addEventListener('pointercancel', endDrag);
  viewport.addEventListener('wheel', event => {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      const rect = viewport.getBoundingClientRect();
      zoomAt(Math.exp(-event.deltaY * 0.002), event.clientX - rect.left, event.clientY - rect.top);
    } else { autoFit = false; x -= event.deltaX; y -= event.deltaY; apply(); }
  }, { passive: false });
  viewport.addEventListener('keydown', event => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === '+' || event.key === '=') zoomAt(1.2);
    else if (event.key === '-') zoomAt(1 / 1.2);
    else if (event.key.toLowerCase() === 'f') fit();
    else if (event.key === '0') zoomAt(1 / scale);
    else return;
    event.preventDefault();
  });
  document.getElementById('zoom-in').onclick = () => zoomAt(1.2);
  document.getElementById('zoom-out').onclick = () => zoomAt(1 / 1.2);
  document.getElementById('fit').onclick = fit;
  document.getElementById('actual').onclick = () => zoomAt(1 / scale);
  document.getElementById('source').onclick = () => vscode.postMessage({ type: 'source' });
  document.getElementById('background').onclick = () => {
    background = backgrounds[(backgrounds.indexOf(background) + 1) % backgrounds.length];
    viewport.dataset.background = background; apply();
  };
  new ResizeObserver(() => { if (autoFit) fit(); }).observe(viewport);
  window.addEventListener('message', event => {
    const message = event.data;
    if (message?.type === 'render') { filename.textContent = message.name; render(message.svg); }
    if (message?.type === 'status') showStatus(message.text, message.error);
  });
  vscode.postMessage({ type: 'ready' });
})();
