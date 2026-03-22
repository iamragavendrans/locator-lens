# LocatorLens

**LocatorLens is a Chrome side-panel extension for capturing page elements and generating ranked automation locators without reloading the page.**

It is designed for QA engineers, test automation developers, and scraping workflows. The extension listens to user interaction on any regular web page, analyzes the selected element, and returns multiple CSS/XPath locator strategies plus framework-specific copy formats.

## Current Product Capabilities

### Capture modes

| Mode | What it does |
|---|---|
| **Pick Element** | Starts manual pick mode, changes the page cursor to a crosshair, previews the hovered element, and captures on click. |
| **Passive** | Captures every regular page click without blocking the click. |
| **Lock** | Freezes the current panel result so new picks/captures are ignored until unlocked. |
| **Stack** | Opens the stack section so you can collect multiple elements for export. |

### Panel sections

The side panel is organized into five sections:

1. **Reference** — quick-copy values such as ID, class, tag, name, aria-label, CSS path, and relative XPath.
2. **Properties** — identity badges, attributes, stable/dynamic classes, computed styles, bounds, and text content.
3. **Locators** — ranked selectors grouped into Stable / Moderate / Fragile tiers, with flash, highlight, raw copy, framework copy, and multi-match navigation.
4. **Stack** — collect multiple elements and export them as Playwright TS, Selenium Java, Cypress JS, WebdriverIO, Puppeteer, TestCafe, or Raw JSON.
5. **Live Validator** — validate CSS/XPath selectors with debounce, preview up to five matches, and flash/highlight matches.

Section open/closed state is persisted in `localStorage` under `ll4v4_sections`.

### Locator strategies

LocatorLens currently generates ranked locator candidates from combinations of:

- test attributes such as `data-testid`, `data-test`, `data-cy`, `data-qa`, and related variants
- ARIA attributes and role/text combinations
- stable IDs and fallback auto-generated ID patterns
- name / placeholder / alt / title / href / value attributes
- stable classes, dynamic classes, and scoped class fallbacks
- exact text, normalized text, and text-contains locators
- link text and partial link text
- child-anchor and child-bold-text strategies
- ancestor/descendant and parent/child hierarchy locators
- sibling-based locators
- CSS paths, relative XPath, position-based XPath, and absolute XPath

## Installation

### Load unpacked locally

1. Clone this repository.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the repository folder.

### Build artifacts from GitHub Actions

The repository now includes a GitHub Actions workflow at `.github/workflows/build-extension.yml`.

- On every push to `main` or `master`, GitHub Actions builds `dist/locatorlens.zip` and uploads it as a workflow artifact.
- On pull requests, the same packaging validation runs.
- On version tags like `v5.0.1`, the workflow uploads release artifacts to GitHub Releases.
- If the repository secret `CHROME_EXTENSION_PRIVATE_KEY` is configured, the workflow also signs and builds `dist/locatorlens.crx`.
- If that secret is **not** configured, the workflow still produces the ZIP, but the CRX step is skipped.

## Why the workflow was not auto-triggering before

The previous README claimed that GitHub Actions would automatically build and publish a `.crx`/`.zip`, but the repository did **not** actually contain a workflow under `.github/workflows/`. Because there was no workflow file committed, GitHub Actions had nothing to trigger on push or tag events.

In addition, a CRX build requires a signing key. Even with a workflow present, GitHub cannot produce a signed `.crx` unless the repository has a private signing key available through secrets.

## Required GitHub secret for CRX output

To enable automatic `.crx` generation, add this repository secret:

- `CHROME_EXTENSION_PRIVATE_KEY` — the PEM-encoded private key used to sign the extension ZIP before wrapping it into a CRX3 package.

Once that secret is configured, pushes to `main`/`master` and `v*` tags will automatically build the ZIP and signed CRX artifacts.

## Release flow

1. Update `version` in `manifest.json`.
2. Commit the change.
3. Push the branch.
4. Create and push a tag such as `v5.0.1`.
5. GitHub Actions will build the extension package(s) and attach them to the tagged release.

## Project structure

```text
locator-lens/
├── manifest.json
├── background.js
├── content.js
├── content.css
├── panel.html
├── panel.css
├── panel.js
├── build_crx3.py
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── .github/
    └── workflows/
        └── build-extension.yml
```

## Local checks

Useful local checks while iterating:

```bash
node --check panel.js
node --check content.js
node --check background.js
python -m py_compile build_crx3.py
```

## License

[MIT](LICENSE)
