# LocatorLens

**AI-powered Chrome extension (MV3) for QA automation engineers** — generates ranked CSS and XPath locators with 25+ strategies for Selenium, Playwright, Cypress, WebdriverIO, Puppeteer, TestCafe, and Robot Framework.

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Chrome Web Store](https://img.shields.io/badge/Chrome-Web%20Store-4285F4?logo=google-chrome)](https://chromewebstore.google.com)

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Installation & Setup](#installation--setup)
- [Usage](#usage)
- [Locator Strategies](#locator-strategies)
- [Scoring System](#scoring-system)
- [Version History](#version-history)
- [Contributing](#contributing)
- [License](#license)
- [Roadmap](#roadmap)

---

## Overview

LocatorLens is a Chrome MV3 side panel extension designed for QA automation engineers who spend hours crafting reliable, maintainable CSS and XPath locators. It intelligently analyzes DOM elements and generates a ranked list of locators using 25+ strategies, outputting in formats compatible with all major test frameworks.

**Current Version:** v5  
**Reference Spec:** PRD v4.2

---

## Features

### Core Features
- **25+ Locator Generation Strategies** — CSS selectors, XPath expressions, and hybrid approaches
- **Five Operating Modes**:
  - **Pick** — Click elements directly to capture locators (uses `composedPath()` for accuracy)
  - **Passive** — Auto-capture all elements on the page without interaction
  - **Lock** — Freeze locators while inspecting other elements
  - **Stack** — Export locators as Page Object Model (POM) classes
  - **Live Validator** — Test generated locators against live elements
- **Multi-Framework Output** — Export locators for:
  - Selenium (Java, Python)
  - Playwright (JavaScript, Python, Java)
  - Cypress
  - WebdriverIO
  - Puppeteer
  - TestCafe
  - Robot Framework
- **Smart Scoring** — Accuracy penalties for multiple matches (2-5: -14, 6-20: -28, 21+: -42)
- **Dynamic Element Detection** — Identifies and flags data-driven or volatile selectors
- **Live Test Mode** — Validate locators in real-time against the current page

### UI/UX
- **No emoji** — Clean, professional interface aligned with automation engineer workflows
- **Tooltips over inline text** — Contextual help without UI clutter
- **Exact score values** — Precise scoring metrics per PRD specification
- **Responsive panel layout** — 5-section design (Generator, Stack, Validator, Settings, Logs)

---

## Architecture

### File Structure
```
locator-lens/
├── background.js              # Service worker (MV3)
├── content.js                 # Locator generation engine
├── panel.html/css/js          # UI panels & interactions
├── manifest.json              # Chrome MV3 manifest
├── utils/
│   ├── cleanText.js          # Text normalization (from SelectorsHub)
│   ├── optimizeXpath.js      # XPath simplification
│   ├── isDynamic.js          # Dynamic selector detection
│   └── scoreCalculator.js    # Locator scoring logic
└── tests/                     # Jest unit tests
```

### Key Components

#### `content.js` — Locator Generation Engine
- Implements 25+ locator generation strategies
- Exports `generateLocators(element)` function
- Returns array of locator objects: `{ selector, type, score, matches }`
- Strategies include:
  - ID-based (id, multiple-id)
  - Class-based (single-class, multiple-class)
  - Attribute-based (data-*, aria-*, custom)
  - Text content (exact, partial, fuzzy)
  - Position-based (nth-child, nth-of-type)
  - XPath (absolute, relative, attribute-driven)
  - Hybrid combinations

#### `panel.js` — UI Control & State Management
- Manages five operating modes
- Communicates with `content.js` via `chrome.tabs.sendMessage()`
- Validates locators using DOM queries
- Exports to multiple framework formats

#### `background.js` — Service Worker
- Handles message routing between panel and content script
- Manages tab state and permissions
- Coordinates mode switching and data persistence

#### Scoring Algorithm
```
Score = 100 - penalties

Penalties:
- 14 points: 2-5 matches (selector not unique)
- 28 points: 6-20 matches (poor specificity)
- 42 points: 21+ matches (too generic)
- 0 points: exactly 1 match (perfect)

Final score = Max(0, base_score - penalties)
```

---

## Installation & Setup

### For Users (Chrome Web Store)
1. Open Chrome Web Store and search for "LocatorLens"
2. Click **Add to Chrome**
3. Grant permissions for the current tab
4. Open any website and press `Ctrl+Shift+Y` to access the side panel

### For Developers

#### Prerequisites
- Node.js 16+
- npm or yarn
- Chrome 120+

#### Clone & Setup
```bash
git clone https://github.com/iamragavendrans/locator-lens.git
cd locator-lens
npm install
```

#### Build & Test
```bash
# Run unit tests
npm test

# Build CRX extension
npm run build

# Watch mode (development)
npm run dev

# Lint code
npm run lint

# Format code
npm run format
```

#### Load Extension in Chrome
1. Open `chrome://extensions/`
2. Enable **Developer mode** (top-right)
3. Click **Load unpacked**
4. Select the `locator-lens/` folder
5. The extension appears in your toolbar

#### GitHub Actions CI
- Automatic CRX builds on push to `main`
- Artifacts available under **Actions** → latest run

---

## Usage

### Pick Mode
1. Enable **Pick** in the side panel
2. Click any element on the page
3. Locators appear instantly in the ranked list
4. Click **Copy** to copy to clipboard
5. Click **Validate** to test against the live DOM

### Passive Mode
1. Enable **Passive** mode
2. All elements on the page are scanned automatically
3. Filter by element type or tag name
4. View top 10 locators per element

### Lock Mode
1. Pick an element (Pick or Passive mode)
2. Click **Lock** to freeze the selection
3. Inspect other elements without losing the locked target
4. Useful for analyzing parent-child relationships

### Stack Mode
1. Pick multiple elements (hold Shift to multi-select)
2. Click **Export as POM**
3. Choose your language (Java, Python, JavaScript)
4. Copy generated Page Object Model class

### Live Validator
1. Paste or type a CSS/XPath locator
2. Click **Validate**
3. See match count and highlight results in the page
4. Refine if needed

---

## Locator Strategies

### By Type

| Strategy | Example | Strength | Use Case |
|----------|---------|----------|----------|
| ID | `#user-form` | Fastest, unique | Stable pages |
| Class (single) | `.btn-primary` | Fast, reusable | Style-driven UIs |
| Class (multiple) | `.btn.btn-primary.active` | More specific | Complex UIs |
| Attribute | `[data-testid="login"]` | Maintainable | QA-friendly apps |
| XPath absolute | `//body/div[1]/form/input` | Rare, brittle | Last resort |
| XPath relative | `//input[@id="email"]` | Flexible | Dynamic layouts |
| Text content | `//button[contains(., "Submit")]` | Human-readable | Static text |
| Position | `//div[3]` | Fragile | Use sparingly |
| Hybrid | `//div[@class="form"]//input[1]` | Balanced | Most scenarios |

### Priority Order (Scoring)
1. ID-based (score: 100)
2. Data attribute (score: 95-98)
3. ARIA attribute (score: 90-95)
4. Single/multiple class (score: 80-90)
5. XPath attribute-driven (score: 75-85)
6. Text content (score: 70-80)
7. Position-based (score: 50-70)

---

## Scoring System

Scores range from **0 to 100**, where higher is better.

### Base Scores
- Exact ID match: **100** (score)
- Data/ARIA attribute: **95-98**
- Class-based: **80-90**
- XPath attribute: **75-85**
- Text content: **70-80**
- Position-based: **50-70**

### Penalty Tiers
- **No matches:** -0 (not shown)
- **1 match:** -0 (perfect)
- **2-5 matches:** -14
- **6-20 matches:** -28
- **21+ matches:** -42

### Example Calculations
```
Locator: "#user-email"
Base: 100, Matches: 1, Final Score: 100

Locator: ".form-input"
Base: 85, Matches: 8, Final Score: 85 - 28 = 57

Locator: "//input"
Base: 70, Matches: 45, Final Score: 70 - 42 = 28
```

---

## Version History

### v5 (Current)
**Key Fixes:**
- **Pick Mode** — Fixed stale hovered reference; now uses `composedPath()[0]` directly
- **Passive Mode** — Extended element coverage; now runs full `generateLocators()` engine instead of sampling
- **Lock Mode** — Complete locking mechanism; blocks incoming messages with `if(locked) return` guard
- **Score Accuracy** — Aligned all penalty calculations to PRD v4.2

**Features:**
- 25+ locator strategies
- Multi-framework export
- Live validation
- Real-time DOM analysis

### v4
- Initial POM export (Stack mode)
- Basic validation

### v3
- Passive mode automation
- Settings persistence

### v2
- Five operating modes
- Pick, Passive, Lock, Stack, Validator

### v1
- Basic locator generation
- Pick mode only

---

## Contributing

We welcome contributions! LocatorLens is open-source under the MIT License.

### How to Contribute

#### Reporting Bugs
1. Open a [GitHub Issue](https://github.com/iamragavendrans/locator-lens/issues)
2. Include:
   - Browser version & OS
   - Steps to reproduce
   - Expected vs actual behavior
   - Screenshot (if applicable)
   - Console logs (`F12` → Console)

#### Suggesting Features
1. Check [existing issues](https://github.com/iamragavendrans/locator-lens/issues) first
2. Open a new issue with the label `enhancement`
3. Describe the use case and expected behavior

#### Code Contributions

**Fork & Branch:**
```bash
git clone https://github.com/YOUR_USERNAME/locator-lens.git
cd locator-lens
git checkout -b feature/your-feature-name
```

**Development:**
```bash
# Install dependencies
npm install

# Run tests
npm test

# Start dev mode
npm run dev

# Build extension
npm run build
```

**Quality Standards:**
- Write unit tests for new strategies or utilities
- Ensure 80%+ code coverage
- Follow ESLint config (run `npm run lint`)
- Format code with Prettier (`npm run format`)
- Update README & CHANGELOG for user-facing changes
- Add JSDoc comments for public functions

**Commit & Push:**
```bash
git add .
git commit -m "feat: describe your change (type: scope)"
git push origin feature/your-feature-name
```

**Pull Request Checklist:**
- [ ] Tests pass (`npm test`)
- [ ] Code linted (`npm run lint`)
- [ ] README updated (if needed)
- [ ] Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/)
- [ ] Links to related issues (e.g., `Closes #123`)

#### Commit Message Format
```
type(scope): subject

body

footer
```

**Types:** `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `ci`  
**Scope:** `locators`, `ui`, `validator`, `pom`, `scoring`, `docs`, etc.

**Examples:**
```
feat(locators): add shadow DOM support

fix(picker): resolve stale reference in Pick mode

docs(readme): add contribution guidelines

test(scoring): increase penalty tier coverage
```

#### Areas for Contribution

**High Priority:**
- Shadow DOM element detection
- Web Components support
- iFrame handling
- Performance optimization (large DOM trees)
- Additional framework exports (C#, Go, Rust)

**Medium Priority:**
- Dark mode for side panel
- Keyboard shortcuts customization
- Locator history & export to JSON/CSV
- Batch element analysis

**Low Priority:**
- UI theme customization
- Browser extension i18n
- Analytics & telemetry (privacy-preserving)

---

## License

LocatorLens is released under the **MIT License**. See [LICENSE](LICENSE) file for details.

You are free to:
- Use, modify, and distribute the extension
- Include it in commercial products
- Fork and create derivative works

**Attribution appreciated but not required.**

---

## Roadmap

### v6 (Q2 2025)
- [ ] Shadow DOM element support
- [ ] Web Components locator generation
- [ ] iFrame handling
- [ ] Performance: lazy-load large DOM trees

### v7 (Q3 2025)
- [ ] Additional framework exports (C#, Go, Rust)
- [ ] Locator history panel with import/export
- [ ] Batch element analysis (scan multiple pages)
- [ ] Keyboard shortcut customization

### v8 (Q4 2025)
- [ ] Dark mode UI
- [ ] Cross-browser support (Firefox, Edge)
- [ ] AI-powered locator suggestions (fallback strategies)
- [ ] Team collaboration: share locator sets

---

## Support

- **Issues & Bugs:** [GitHub Issues](https://github.com/iamragavendrans/locator-lens/issues)
- **Discussions:** [GitHub Discussions](https://github.com/iamragavendrans/locator-lens/discussions)
- **Email:** [contact@locator-lens.dev](mailto:contact@locator-lens.dev)

---

## Acknowledgments

- SelectorsHub algorithm inspiration (text cleaning, XPath optimization)
- Selenium & Playwright communities
- QA automation engineers for feedback & testing

---

**Made with ❤️ for QA automation engineers.**
