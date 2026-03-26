# Contributing to LocatorLens

Thank you for your interest in contributing to LocatorLens! This guide walks you through our process and standards.

## Code of Conduct

- Be respectful and inclusive
- Assume good intent
- Focus on the code, not the person
- Report harassment to [maintainers]

## Getting Started

### Prerequisites
- Node.js 16+
- npm or yarn
- Chrome 120+ (for testing)
- Git

### Setup

```bash
# Fork the repo on GitHub
# Clone YOUR fork
git clone https://github.com/YOUR_USERNAME/locator-lens.git
cd locator-lens

# Add upstream remote
git remote add upstream https://github.com/iamragavendrans/locator-lens.git

# Install dependencies
npm install

# Verify setup
npm test
npm run lint
```

## Development Workflow

### 1. Create a Feature Branch

```bash
git fetch upstream
git checkout -b feature/your-feature-name
```

**Branch naming:** `feature/`, `fix/`, `docs/`, `test/`, `refactor/`, `perf/`, `ci/`

### 2. Make Changes

#### Writing Locator Strategies
Each strategy in `content.js` should follow this pattern:

```javascript
/**
 * Generate ID-based locator
 * @param {Element} element - DOM element to analyze
 * @returns {Object|null} { selector: string, type: string, score: number }
 */
function strategyById(element) {
  const id = element.id;
  if (!id || !id.trim()) return null;
  
  const matches = document.querySelectorAll(`#${escapeSelector(id)}`).length;
  const score = 100 - getPenalty(matches);
  
  return {
    selector: `#${escapeSelector(id)}`,
    type: 'id',
    score,
    matches
  };
}
```

#### Utility Functions
- `cleanText(text)` — Normalize whitespace, remove special chars
- `optimizeXpath(xpath)` — Simplify absolute to relative paths
- `isDynamic(selector)` — Detect volatile attributes (timestamps, GUIDs)
- `escapeSelector(str)` — Escape special CSS characters

#### Testing Locators
```javascript
function generateLocators(element) {
  const locators = [];
  
  // Run all strategies
  locators.push(strategyById(element));
  locators.push(strategyByClass(element));
  // ... more strategies
  
  // Filter nulls, sort by score
  return locators
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
}
```

### 3. Write Tests

Create Jest test files in `tests/`:

```javascript
// tests/locators.test.js
describe('strategyById', () => {
  test('returns null for missing id', () => {
    const elem = document.createElement('div');
    expect(strategyById(elem)).toBeNull();
  });
  
  test('generates correct ID selector', () => {
    const elem = document.createElement('div');
    elem.id = 'user-form';
    const result = strategyById(elem);
    expect(result.selector).toBe('#user-form');
    expect(result.type).toBe('id');
    expect(result.score).toBe(100);
  });
  
  test('penalizes multiple matches', () => {
    // Mock querySelectorAll
    document.querySelectorAll = jest.fn(() => ({
      length: 5
    }));
    const elem = document.createElement('div');
    elem.id = 'btn';
    const result = strategyById(elem);
    expect(result.score).toBe(100 - 14); // -14 for 2-5 matches
  });
});
```

**Test Coverage:** Aim for 80%+ coverage
```bash
npm test -- --coverage
```

### 4. Code Quality

#### Linting
```bash
npm run lint              # Check for errors
npm run lint -- --fix    # Auto-fix
```

Rules enforced:
- No console logs except debug
- Const/let over var
- No unused variables
- No trailing commas (ES5 compat)
- 2-space indent

#### Formatting
```bash
npm run format  # Prettier
```

Settings:
- Semicolons: required
- Quotes: double
- Indent: 2 spaces
- Line width: 100

#### JSDoc Comments
```javascript
/**
 * Brief description (one line).
 * 
 * Longer description explaining the function's behavior,
 * edge cases, and important details.
 *
 * @param {Element} element - The DOM element to analyze
 * @param {number} [threshold=0.9] - Optional confidence threshold
 * @returns {Array<Object>} Array of locators sorted by score
 * @throws {TypeError} If element is not a valid DOM node
 * 
 * @example
 * const elem = document.querySelector('button');
 * const locators = generateLocators(elem);
 * console.log(locators[0].selector); // '#submit-btn'
 */
```

### 5. Commit Changes

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat` — New feature
- `fix` — Bug fix
- `docs` — Documentation
- `test` — Tests
- `refactor` — Code restructuring (no behavior change)
- `perf` — Performance improvement
- `ci` — CI/CD changes
- `chore` — Tooling, dependencies

**Scope:** `locators`, `ui`, `validator`, `pom`, `scoring`, `manifest`, `docs`

**Examples:**
```
feat(locators): add shadow DOM support

Support locator generation for elements inside shadow roots using
pierceHandler strategy. Detect shadow boundaries and traverse correctly.

Closes #42

---

fix(picker): resolve stale reference in Pick mode

Replace hovered element reference with composedPath()[0] to ensure
we capture the actual clicked element, not the previously hovered one.

Fixes #38

---

docs(readme): add contribution guidelines

Add CONTRIBUTING.md with setup, workflow, testing, and code quality
standards.

---

test(scoring): increase penalty tier coverage

Add test cases for all penalty brackets:
- 0 matches: not shown
- 1 match: +0 penalty
- 2-5 matches: -14 penalty
- 6-20 matches: -28 penalty
- 21+ matches: -42 penalty
```

Commit guidelines:
- One logical change per commit
- Write in imperative mood ("add" not "added")
- Reference issues (e.g., `Closes #123`)
- Keep subject under 50 chars
- Keep body under 100 chars per line

```bash
git add .
git commit -m "feat(locators): add shadow DOM support

Implement shadow DOM traversal using pierceHandler strategy.
Detect shadow boundaries and generate accurate selectors.

Closes #42"

git push origin feature/your-feature-name
```

### 6. Pull Request

**Before submitting:**
```bash
npm test                 # All tests pass
npm run lint             # No errors
npm run format           # Code formatted
git log upstream/main.. # Review commits
```

**PR Template:**
```markdown
## Description
Brief summary of changes.

## Motivation
Why are these changes needed? Link to issue if applicable.

## Testing
How was this tested? Include steps to reproduce if a bug fix.

## Checklist
- [ ] Tests added/updated
- [ ] Code linted
- [ ] Documentation updated
- [ ] Commits follow conventional format
- [ ] Ready for review

Closes #123
```

**PR titles:** Match commit format
- `feat: add shadow DOM support`
- `fix: resolve stale reference in Pick mode`
- `docs: add contribution guidelines`

## High-Priority Contribution Areas

### 1. Shadow DOM Support
**Skill:** Intermediate  
**Time:** 2-3 days

Currently, LocatorLens cannot generate locators for elements inside shadow DOMs. Implement:
- Shadow root detection in content.js
- Pierce handler strategy (traverse shadow boundaries)
- Tests for web components (Material Design, Lit)
- Documentation update

**Useful links:**
- [MDN: Shadow DOM](https://developer.mozilla.org/en-US/docs/Web/Web_Components/Using_shadow_DOM)
- [Shadow DOM Selectors](https://www.w3.org/TR/selectors-4/#shadow)

### 2. Web Components Locators
**Skill:** Intermediate  
**Time:** 2-3 days

Add locator strategies specific to Web Components:
- Slot-based selectors
- Custom element attributes
- Shadow-piercing combinators
- Test against real components (Shoelace, etc.)

### 3. iFrame Handling
**Skill:** Advanced  
**Time:** 4-5 days

Extend locator generation to work across iFrame boundaries:
- Detect iframe boundaries
- Generate iframe + inner-element selectors
- Handle cross-origin restrictions gracefully
- Add validator support for iframe selectors

### 4. Performance: Large DOM Trees
**Skill:** Intermediate-Advanced  
**Time:** 3-4 days

Optimize element scanning for pages with 10k+ DOM nodes:
- Implement lazy-loading for element lists
- Add debouncing to Passive mode
- Cache frequently-used queries
- Benchmark against baseline

### 5. Additional Framework Exports
**Skill:** Easy-Intermediate  
**Time:** 1-2 days per framework

Add template generators for:
- C# (Selenium, NUnit)
- Go (cdp-go, chromedp)
- Rust (headless-chrome, thirtyfour)

**Pattern:**
```javascript
// In panel.js
const exportTemplates = {
  csharp: (locators) => `
using OpenQA.Selenium;
using OpenQA.Selenium.Chrome;

public class PageObject {
  ${locators.map(l => `
  public IWebElement ${camelCase(l.id)} =>
    driver.FindElement(By.${l.by}("${l.selector}"));
  `).join('\n')}
}
  `
};
```

## Review Process

### Getting Reviewed
1. Maintainers review for:
   - Code quality & correctness
   - PRD compliance (v4.2)
   - Test coverage
   - Documentation
2. Provide feedback (usually within 48 hours)
3. Address feedback, push new commits
4. Maintainer merges once approved

### Reviewing Others' Work
If you have merge access:
- Check code logic & style
- Verify tests are adequate
- Ensure conventional commits
- Test locally if complex
- Approve or request changes with feedback

## Branching Strategy

```
main (production)
 ├─ feature/shadow-dom (dev work)
 ├─ fix/picker-stale-ref (bug fix)
 └─ docs/readme-update (docs)
```

- `main` is always deployable, tagged with versions
- Feature branches merged via PR after review
- Delete branches after merge

## Release Process

1. Update version in `package.json` (semver)
2. Update `CHANGELOG.md`
3. Create git tag: `git tag v5.1.0`
4. GitHub Actions builds CRX automatically
5. Upload to Chrome Web Store (maintainer)
6. Announce release

## Troubleshooting

### Tests Fail
```bash
npm test -- --verbose     # See full output
npm test -- --watch      # Debug specific test
```

### Lint Errors
```bash
npm run lint -- --fix    # Auto-fix
npx eslint . --fix       # Manual
```

### Chrome Extension Won't Load
1. Clear Chrome cache: chrome://chrome-urls
2. Remove old extension in chrome://extensions
3. Reload unpacked folder
4. Check Console for errors (F12)
5. Verify manifest.json syntax

### Can't Push to Fork
```bash
git remote -v  # Check remotes
git branch -u origin/feature/your-feature  # Set upstream
```

## Resources

- **Selenium Locator Guide:** https://www.selenium.dev/documentation/webdriver/locating_elements/
- **Playwright Selectors:** https://playwright.dev/docs/other-locators
- **XPath Tutorial:** https://www.w3schools.com/xml/xpath_intro.asp
- **Chrome MV3 Docs:** https://developer.chrome.com/docs/extensions/mv3/
- **Jest Testing:** https://jestjs.io/docs/getting-started

## Questions?

- Open a [GitHub Discussion](https://github.com/iamragavendrans/locator-lens/discussions)
- Check existing [Issues](https://github.com/iamragavendrans/locator-lens/issues)
- Email: contact@locator-lens.dev

---

**Thank you for contributing to LocatorLens!** 🎉
