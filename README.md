# MuleSoft Project Tools

A free, fast collection of **27 browser-based developer tools** for MuleSoft and API teams — RAML/OpenAPI
conversion, spec validation, JSON/XML formatting, Quartz cron generation, MUnit scaffolding, JWT decoding,
hashing, diffing and more.

**Zero backend. Zero dependencies to install. Zero API keys.** Every tool is plain HTML, CSS and JavaScript
that runs entirely in the visitor's browser. Nothing anyone pastes into this site is ever uploaded anywhere —
which is also why the tools keep working offline once a page has loaded.

---

## Contents

- [Quick start](#quick-start)
- [Deploy to GitHub Pages](#deploy-to-github-pages)
- [Before you publish](#before-you-publish)
- [Project structure](#project-structure)
- [The tools](#the-tools)
- [Adding a new tool](#adding-a-new-tool)
- [How the site works](#how-the-site-works)
- [Testing](#testing)
- [Browser support](#browser-support)
- [License](#license)

---

## Quick start

There is no build step. Serve the folder with any static file server:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

Opening `index.html` directly from the filesystem (`file://`) mostly works too, but a couple of features
(clipboard access and the SHA-384/SHA-512 hashes, which use the Web Crypto API) require a real
`http://localhost` or HTTPS origin. Use a local server while developing.

---

## Deploy to GitHub Pages

1. Create a new **public** repository on GitHub, for example `mulesoft-project-tools`.

2. Push this folder to it:

   ```bash
   git init
   git add .
   git commit -m "MuleSoft Project Tools"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/mulesoft-project-tools.git
   git push -u origin main
   ```

3. In the repository, go to **Settings → Pages**, and under *Build and deployment* set **Source** to
   **GitHub Actions**. The included workflow (`.github/workflows/deploy.yml`) publishes the site on every push
   to `main`.

4. Watch the **Actions** tab. When the run finishes, your site is live at
   `https://YOUR-USERNAME.github.io/mulesoft-project-tools/`

### Custom domain

Add a file named `CNAME` at the repository root containing just your domain (e.g. `tools.example.com`), then
configure the DNS records GitHub shows under **Settings → Pages → Custom domain**.

---

## Before you publish

A short checklist — all of these are placeholders in the shipped files:

| What | Where | Why |
|---|---|---|
| Site URL | `sitemap.xml`, `robots.txt`, and the `<link rel="canonical">` / `og:url` tags in every `.html` | Search engines need the real URL |
| "Last updated" dates | `privacy-policy.html`, `terms.html` | Currently say "replace this with your publication date" |

The contact address (`beautifulcreator9@gmail.com`) is already set in `contact.html`.

The fastest way to fix the URLs is a find-and-replace across the folder:

```bash
# macOS
grep -rl 'YOUR-USERNAME.github.io/mulesoft-project-tools' . \
  | xargs sed -i '' 's|https://YOUR-USERNAME.github.io/mulesoft-project-tools|https://your.real.domain|g'

# Linux
grep -rl 'YOUR-USERNAME.github.io/mulesoft-project-tools' . \
  | xargs sed -i 's|https://YOUR-USERNAME.github.io/mulesoft-project-tools|https://your.real.domain|g'
```

After the site is live, submit `sitemap.xml` in [Google Search Console](https://search.google.com/search-console)
so the individual tool pages get indexed.

---

## Project structure

```
mulesoft-project-tools/
├── index.html                  Home — searchable directory of every tool
├── about.html  contact.html
├── privacy-policy.html  terms.html  404.html
│
├── raml-to-openapi.html        One page per tool (27 of them)
├── json-formatter.html
├── ...
│
├── css/
│   └── app.css                 Complete design system: layout, themes, components
├── js/
│   ├── registry.js             Auto-generated: tool metadata + SVG icon set
│   ├── app.js                  App shell — sidebar, search, theme, shared helpers
│   ├── home.js                 Home page filtering
│   ├── vendor/
│   │   └── js-yaml.min.js      YAML parser (vendored — no CDN dependency)
│   └── tools/
│       ├── raml-to-openapi.js  One module per tool
│       └── ...
├── assets/favicon.svg
├── robots.txt  sitemap.xml
├── .nojekyll                   Stops GitHub Pages running Jekyll over the files
└── .github/workflows/deploy.yml
```

Everything is a flat, static file. There is no bundler, no `node_modules`, and no framework.

---

## The tools

### MuleSoft & API Design (8)

| Tool | What it does |
|---|---|
| **RAML to OpenAPI Converter** | Converts RAML 1.0 to OpenAPI 3.0, reporting anything it cannot translate rather than dropping it silently |
| **OpenAPI & Swagger Validator** | Structural lint: missing responses, unresolved `$ref`s, undeclared path params, duplicate operation IDs |
| **OpenAPI JSON ⇄ YAML Converter** | Converts specs between JSON and YAML, auto-detecting direction |
| **RAML Formatter & Validator** | Re-indents RAML and reports structural problems |
| **API Endpoint Extractor** | Turns any RAML/OpenAPI doc into an endpoint table; exports CSV or Markdown |
| **MUnit Test Generator** | Generates a valid Mule 4 / MUnit 2.x test suite skeleton from a form |
| **Cron Expression Generator** | Quartz cron builder/explainer with the next 10 run times — supports `L`, `#`, ranges, steps |
| **Properties ⇄ YAML Converter** | Maps dotted `.properties` keys to nested YAML and back |

### JSON, XML & Data Formats (6)

JSON Formatter & Beautifier · JSON Validator (exact line/column + likely cause) · JSON ⇄ XML Converter ·
JSON ⇄ CSV Converter · XML Formatter & Validator · YAML ⇄ JSON Converter

### Encoding & Security (6)

Base64 Encoder/Decoder (Unicode-safe, URL-safe alphabet) · URL Encoder/Decoder · JWT Decoder ·
Hash Generator (MD5, SHA-1, SHA-256, SHA-384, SHA-512) · UUID Generator (v4 and monotonic v7) ·
HTML Entity Encoder/Decoder

### Developer Utilities (7)

cURL Command Builder & Parser · Epoch & Timestamp Converter · Regex Tester · Text Diff Checker ·
Text Case Converter · XPath Tester · URL & Query String Parser

---

## Adding a new tool

The site is deliberately simple to extend. Four steps:

**1. Copy an existing tool page.** Pick one whose shape matches what you need — most tools are a
"paste input, get output" pair, so `json-formatter.html` is a good starting point.

**2. Update the page content:** the `<title>`, meta description, breadcrumb, `<h1>`, the description
paragraph, and the "How to use this tool" list.

**3. Write the JavaScript module** at `js/tools/your-tool.js` and point the page's last `<script>` tag at it.
If your tool follows the standard input → output shape, the shared harness does nearly all the work:

```js
(function () {
  "use strict";
  MPT.simpleTool({
    transform: function (text, opts) {
      // opts contains the value of every [data-opt] control on the page
      if (somethingWrong) throw new Error("explain what the user should fix");
      return { output: result, message: "What happened.", type: "ok" };  // type: ok | warn | error
    },
    sample: "example input shown by the Load example button",
    downloadName: "output.txt",
    emptyMessage: "Paste something first."
  });
})();
```

`simpleTool` automatically wires up the Run, Clear, Copy, Download and Load-example buttons, live
re-running as the user types, character/line counters, and error display. Return `{ html: "…" }` instead of
`output` if your tool renders a table or rich result.

For a fully custom UI, skip `simpleTool` and use the shared helpers directly:
`MPT.showMsg`, `MPT.clearMsg`, `MPT.copy`, `MPT.download`, `MPT.toast`, `MPT.escapeHtml`,
`MPT.debounce`, `MPT.textStats`, `MPT.icon`.

**4. Register the tool** so it appears in the sidebar, the search index and the home page. Open
`js/registry.js` and add an entry to the `tools` array:

```js
{
  "id": "your-tool",              // must match your-tool.html
  "name": "Your Tool",
  "short": "One sentence describing it.",
  "cat": "utilities",             // mulesoft | data | encoding | utilities
  "icon": "tool",                 // any key from the icons object in the same file
  "keywords": "words people might search for"
}
```

Then add a matching card to the correct `<section class="cat-block">` in `index.html`, and a `<url>` entry
in `sitemap.xml`.

---

## How the site works

**The shell is built at runtime.** Each page ships a minimal skeleton; `js/app.js` reads `js/registry.js`
and renders the sidebar, wires the search dropdown, and applies the theme. This is why adding a tool to the
registry makes it appear in the navigation of all 33 pages at once — there is no duplicated navigation
markup to keep in sync.

**Theme.** Light and dark are CSS custom property sets on `<html data-theme>`. A tiny inline script in every
`<head>` applies the saved preference before first paint, so there is no flash of the wrong theme. The
preference is the only thing stored in `localStorage` (key `mpt-theme`) and it never leaves the browser.

**Search.** `Ctrl/Cmd+K` or `/` focuses the top-bar search from anywhere. Results are scored by name match
first, then keywords, then description; arrow keys navigate and Enter opens. The home page has its own
filter that narrows the visible cards and category chips.

**Responsive behaviour.** Above 960px the sidebar is fixed; below that it becomes an off-canvas drawer with a
backdrop, opened by the hamburger button and closed by the backdrop, the Escape key, or tapping any link.
Two-pane tool layouts collapse to a single column below 1080px.

**Accessibility.** Skip link, one `<h1>` per page, labelled form controls, `aria-live` status messages,
visible focus rings, and full keyboard operation of the search and navigation.

---

## Testing

The site was validated with an automated browser suite covering **664 assertions**:

- every page returns 200, has a unique title and meta description, exactly one `<h1>`, and a fully
  rendered shell, with **zero console or page errors**
- every internal link resolves to a file that exists
- every tool's "Load example" produces the expected output, with the expected status type
- error paths: malformed JSON/XML/YAML, invalid cron expressions, bad regexes, malformed JWTs,
  unterminated quotes in cURL commands, non-numeric timestamps, garbage URLs
- correctness checks against known values — MD5/SHA-1/SHA-256 test vectors, cron interval spacing,
  `L` (last day of month) and `#` (nth weekday) resolution, UUID v4/v7 shape and ordering, epoch conversions
- round trips: Base64 with Unicode, JSON→CSV→JSON, JSON→XML→JSON
- UI behaviour: search dropdown and keyboard navigation, home filtering, theme persistence across reloads,
  mobile drawer open/close, no horizontal overflow at 390px
- every button on every tool page is clickable without throwing

If you extend the site, the cheapest regression check is: open each page you touched, watch the browser
console for errors, and click "Load example" followed by every button.

---

## Browser support

Current versions of Chrome, Edge, Firefox and Safari. The site uses `URL`, `DOMParser`, `TextEncoder`,
`Intl`, CSS custom properties and `color-mix()`. SHA-384 and SHA-512 use the Web Crypto API, which browsers
only expose on HTTPS or `localhost` — the other three hash algorithms are implemented in plain JavaScript
and work everywhere.

---

## License

MIT — use it, fork it, rebrand it, ship it commercially. Attribution appreciated but not required.

MuleSoft, Anypoint Platform and Salesforce are trademarks of their respective owners. This is an independent
project and is not affiliated with, endorsed by, or sponsored by Salesforce or MuleSoft.
