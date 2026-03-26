[[# LocatorLens

**Instant locator generation and ranking for every web element.**

A Chrome extension (Manifest V3) for QA engineers, automation developers, and web scrapers. Click any element on any website — get a ranked list of locators across 25+ strategies, ready to copy for any framework.

## Core Modes

| Mode | What it does |
|------|-------------|
| **Pick Element** | Click Pick → click any element → ranked locators generated instantly |
| **Passive** | Auto-captures every page click. No mode switching. |
| **Lock** | Freeze results so further clicks don't overwrite them |
| **Stack** | Collect multiple elements across the page for batch POM export |

## Locator Strategies (25+)

- **Test attributes** — `data-testid`, `data-cy`, `data-qa`, `data-e2e`, etc.
- **ARIA** — `aria-label`, `aria-labelledby`, `role` + accessible name
- **Stable ID** — with auto-generated ID detection and flagging
- **Name, placeholder, alt, title, value, href, for**
- **Text** — exact `text()=`, `normalize-space()=`, `contains()` with smart phrase extraction
- **Link text / partial link text**
- **Classes** — stable classes with `contains(@class,…)`, dynamic classes flagged with warnings
- **Child-anchor** — via child `<a>` hrefs, `<b>`/`<strong>` text, `<img>` alt
- **Ancestor//descendant** — scoped by nearest stable ancestor
- **Parent/child, following-sibling, preceding-sibling**
- **AND combos** — `role+text`, `class+text`, `dynclass+text`
- **Anchored CSS path** — stops as soon as selector becomes unique
- **Relative XPath** — with SelectorsHub-style optimization
- **Position-based, absolute** — always available as fallback

Each locator is scored 0–100 and grouped into **Stable** (≥65%), **Moderate** (30–64%), **Fragile** (<30%) tiers.

## Panel Sections

1. **Reference** — Quick-lookup grid: ID, Class, Tag, Name, aria-label, Link Text, CSS Path, XPath
2. **Properties** — Identity badges, all attributes, stable/dynamic class chips, computed styles, bounds
3. **Locators** — Best card with ★ badge, tier dividers, expand/collapse cards, Flash ⚡ / Highlight 🔍 modes, Copy for 8 frameworks
4. **Stack** — Collect elements → Export POM for Playwright, Selenium, Cypress, WebdriverIO, Puppeteer, TestCafe, Raw JSON
5. **Live Validator** — Type any selector, live results with match count and preview

## Framework Output (PRD §8)

| Framework | Style |
|-----------|-------|
| Playwright TS | `page.getByTestId()`, `page.getByLabel()`, `page.getByRole()`, `page.locator()` |
| Selenium Java | `By.id()`, `By.name()`, `By.cssSelector()`, `By.xpath()` |
| Cypress JS | `cy.get()`, `cy.contains()` |
| WebdriverIO | `$('#id')`, `$('aria/name')`, `$('=linktext')` |
| Puppeteer | `page.$()`, `page.$x()`, `page.$('::-p-text()')` |
| TestCafe | `Selector()`, `.withText()` |
| Robot Framework | `css:`, `xpath:` |

## Installation

### From GitHub Releases

1. Go to [Releases](../../releases)
2. Download the `.zip`
3. Unzip → `chrome://extensions` → Developer mode → **Load unpacked**

### From source

```bash
git clone https://github.com/YOUR_USERNAME/locatorlens.git
# No build step — load the repo folder directly as unpacked extension
```

## Releasing

```bash
# Bump version in manifest.json, then:
git add -A && git commit -m "v5.1.0" && git tag v5.1.0 && git push --tags
```

GitHub Actions builds `.crx` + `.zip` automatically.

## Architecture

```
manifest.json       MV3 manifest
background.js       Service worker — injection, port relay
content.js          Content script — locator engine, picker, flash/highlight
content.css         Overlay + flash/highlight CSS
panel.html/css/js   Side panel UI (5 collapsible sections)
icons/              16/48/128px PNG icons
build_crx3.py       CRX3 packager (CI only)
```

## License

[MIT](LICENSE)
](https://github.com/iamragavendrans/locator-lens)](https://github.com/iamragavendrans/locator-lens)
