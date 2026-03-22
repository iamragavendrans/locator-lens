# LocatorLens

**Instant locator generation and ranking for every web element.**

LocatorLens is a Chrome extension built for QA engineers, automation developers, and web scrapers. Click any element on any website and instantly get a ranked list of locators — CSS selectors, XPath expressions, and framework-ready code.

## Features

### Core Modes

| Mode | What it does |
|------|-------------|
| **Pick** | Click the Pick button, then click any element. The extension highlights it and generates every possible locator. |
| **Passive** | Toggle on and every regular page click auto-generates locators in the side panel. No mode switching needed. |
| **Lock** | Freeze the current results so further clicks don't overwrite them. Useful when copying locators while navigating. |

### Locator Engine

LocatorLens generates locators across **15 strategies**:

- **ID** — `#login-btn`, `//*[@id='login-btn']`
- **Name** — `[name="email"]`
- **Test attributes** — `[data-testid="submit"]`, `[data-cy="…"]`, `[data-qa="…"]`
- **ARIA** — `[aria-label="Close"]`, `[role="dialog"]`
- **Placeholder / Title / Alt** — form and media attributes
- **Href** — link-specific selectors
- **Text** — exact and `contains()` with smart phrase extraction for long text
- **Classes** — static classes ranked higher, dynamic classes flagged with warnings
- **Child anchor** — resilient locators via child `<a>`, `<b>`, `<strong>`, `<img>` elements
- **Hierarchy** — parent ID, grandparent paths
- **Positional** — `nth-child`, `nth-of-type`
- **Absolute** — full XPath and CSS path (always available as fallback)

Each locator is scored 0–100 and grouped into **Stable** (≥75), **Moderate** (45–74), and **Fragile** (<45) tiers.

### Copy for Any Framework

One-click copy formatted for:
- Selenium (Java / Python)
- Playwright
- Cypress
- Puppeteer
- WebdriverIO
- TestCafe
- Robot Framework

### Live Validator

Paste any CSS or XPath selector and test it against the current page in real time.

## Installation

### From GitHub Releases (recommended)

1. Go to the [Releases](../../releases) page
2. Download the latest `.zip` file
3. Unzip to a folder on your machine
4. Open `chrome://extensions` in Chrome
5. Enable **Developer mode** (top-right toggle)
6. Click **Load unpacked** → select the unzipped folder

### Build from source

```bash
git clone https://github.com/YOUR_USERNAME/locatorlens.git
cd locatorlens
# No build step needed — it's plain JS
# Load the repo folder directly as an unpacked extension
```

## Releasing a New Version

1. Update `version` in `manifest.json`
2. Commit and tag:
   ```bash
   git add -A
   git commit -m "Release v5.1.0"
   git tag v5.1.0
   git push origin main --tags
   ```
3. GitHub Actions automatically builds and publishes a `.crx` and `.zip` to [Releases](../../releases)

## Project Structure

```
locatorlens/
├── manifest.json       # Extension manifest (MV3)
├── background.js       # Service worker — message relay, script injection
├── content.js          # Content script — locator engine, picker, passive mode
├── content.css         # Overlay styles injected into pages
├── panel.html          # Side panel markup
├── panel.css           # Side panel styles (dark theme)
├── panel.js            # Side panel logic — rendering, lock, framework copy
├── build_crx3.py       # CRX3 packaging script (used by CI)
├── icons/              # Extension icons (16, 48, 128px)
├── LICENSE             # MIT
└── .github/workflows/
    └── release.yml     # Auto-build CRX on tag push
```

## Contributing

Contributions welcome! Please open an issue first for major changes.

1. Fork the repo
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Make your changes
4. Test by loading the unpacked extension in Chrome
5. Submit a pull request

## License

[MIT](LICENSE)
