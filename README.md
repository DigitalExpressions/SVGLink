# SVGLink

An SVG viewer for Visual Studio Code with clickable links to source files in the current project. No server or account is needed.

## Install the VSIX

Build `SVGLink-0.1.0.vsix` using the development instructions below, or use a shared copy of the VSIX. Generated packages are not committed to the source repository.

1. In VS Code, open Extensions (`Ctrl+Shift+X`).
2. Use the **… → Install from VSIX…** menu and select `SVGLink-0.1.0.vsix` from this folder.
3. Right-click an SVG in Explorer and select **SVGLink: Open SVG Viewer**, or use **Open With… → SVGLink**.

You can also run `code --install-extension SVGLink-0.1.0.vsix` from this folder. To make SVGLink your default SVG viewer, choose **Reopen Editor With… → Configure default editor for '*.svg' → SVGLink**.

Open this folder as a VS Code workspace and try `examples/diagram.svg` for a working example.

## Source links

Use standard SVG `href` or older `xlink:href` attributes on an `<a>` element around a shape, text, or group:

```xml
<a href="../src/main.ts#L42C5">
  <rect x="20" y="20" width="200" height="60" fill="steelblue"/>
  <text x="35" y="55" fill="white">Open main.ts at line 42</text>
</a>
```

Supported examples (line and column numbers start at 1):

| Link | Opens |
| --- | --- |
| `../src/main.ts` | Relative to the SVG's directory |
| `src/main.ts#L42` | Line 42, trying the SVG directory first, then workspace roots |
| `/src/main.ts#L42C5` | Workspace-root path, line 42, column 5 |
| `src/main.ts:42:5` | Line 42, column 5 |
| `src/main.ts?line=42&amp;column=5` | Line 42, column 5 (escape `&` in XML) |
| `src/main.ts#L42-L48` | Start of the indicated line range |
| `file:///C:/project/src/main.ts#L42` | Absolute file path, if inside the workspace |
| `vscode://file/C:/project/src/main.ts:42:5` | VS Code file URL, if inside the workspace |
| `#details` | Centers an SVG element with `id="details"` |

Windows paths and percent-encoded spaces are supported. In a multi-root workspace, the containing folder is tried before the other roots. Existing absolute paths inside the workspace take priority over root-relative paths. Missing files produce a clear message. Links open as text in the current VS Code window, beside the SVG by default, and jump to the selected line/column. Excessive line numbers clamp to the file's end.

Set `"svglink.openLinksBeside": false` to open links in the SVG editor group instead. Remote and virtual workspace paths use VS Code's filesystem API.

## Viewer controls

- **Fit**, **1:1**, **+**, **−**, or keyboard `F`, `0`, `+`, `−` when the preview has focus.
- Drag the background to pan; scroll to pan; hold Ctrl or Command while scrolling to zoom around the pointer.
- **Background** cycles transparency checkerboard, white, and dark backgrounds.
- **SVG source** opens the SVG XML beside the preview. Unsaved XML changes update the viewer live.
- Click linked shapes or focus them with Tab and press Enter to open source files.

SVG scripts, embedded HTML, animation, and external assets are disabled. Embedded PNG/JPEG/GIF/WebP data images, styles, gradients, markers, filters, and internal `<use>` references are supported. Only source links within open workspace folders are followed; web URLs, command URLs, and files outside the workspace are rejected. Ordinary SVG viewing works without a folder open.

## Development and packaging

Use Node.js 22 or later with npm:

```sh
git clone https://github.com/DigitalExpressions/SVGLink.git
cd SVGLink
npm ci
npx playwright install chromium
npm test
npm run build
npm run test:integration
npm run package
```

The finished installable package is `SVGLink-0.1.0.vsix` in this folder. Runtime JavaScript and the SVG sanitizer are bundled in `dist/`; installing the extension does not require Node.js. Press F5 with the included launch configuration to debug in an Extension Development Host.

On Windows, `scripts/build.ps1` installs dependencies, runs the tests, and creates the VSIX. It uses Node.js on PATH, or a portable Node distribution placed under `.tools/`. Local build tools, dependencies, test caches, and generated packages are excluded from Git and the VSIX.
