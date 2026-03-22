'use strict';

const SECTION_KEY = 'll4v4_sections';
const DEFAULT_SECTIONS = {
  'sec-reference': true,
  'sec-props': false,
  'sec-locators': true,
  'sec-stack': false,
  'sec-validator': false
};
const POM_FORMATS = ['Playwright TS', 'Selenium Java', 'Cypress JS', 'WebdriverIO', 'Puppeteer', 'TestCafe', 'Raw JSON'];
const PRIORITY_ATTRS = new Set(['id', 'name', 'aria-label', 'data-testid', 'data-test', 'data-test-id', 'data-cy', 'data-qa', 'placeholder', 'href', 'value', 'role', 'type']);

const st = {
  picking: false,
  passive: false,
  locked: false,
  payload: null,
  stack: [],
  activeLocatorId: null,
  activeLocatorMode: null,
  validatorState: { selector: '', selectorType: 'css', count: 0, error: null, preview: [] },
  validatorMode: 'flash',
  validatorActive: false,
  validateTimer: null,
  sections: loadSections()
};

const port = chrome.runtime.connect({ name: 'locatorlens' });
const $ = id => document.getElementById(id);
const $$ = sel => Array.from(document.querySelectorAll(sel));

const btnPick = $('btn-pick');
const btnPassive = $('btn-passive');
const btnLock = $('btn-lock');
const btnUnlock = $('btn-unlock');
const btnStack = $('btn-stack');
const btnAddCurrent = $('btn-add-current');
const btnExportPom = $('btn-export-pom');
const btnClearStack = $('btn-clear-stack');
const pomPicker = $('pom-picker');
const pomOutput = $('pom-output');
const valInput = $('val-input');
const valFlashBtn = $('val-flash');

function loadSections() {
  try {
    return { ...DEFAULT_SECTIONS, ...(JSON.parse(localStorage.getItem(SECTION_KEY) || '{}')) };
  } catch {
    return { ...DEFAULT_SECTIONS };
  }
}

function saveSections() {
  localStorage.setItem(SECTION_KEY, JSON.stringify(st.sections));
}

function showView(id) {
  ['v-idle', 'v-picking', 'v-error', 'v-results'].forEach(viewId => { $(viewId).hidden = viewId !== id; });
}

function copyText(text, btnEl) {
  return navigator.clipboard.writeText(text).then(() => {
    if (!btnEl) return;
    const prev = btnEl.textContent;
    btnEl.textContent = 'Copied';
    setTimeout(() => { btnEl.textContent = prev; }, 900);
  });
}

function escHtml(str) {
  const d = document.createElement('div');
  d.textContent = String(str);
  return d.innerHTML;
}

function cssString(value) {
  return `[${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}]`;
}

function selectorToFramework(loc, format) {
  const s = loc.selector;
  const q = v => v.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const attrName = loc.meta?.attributeName;
  const attrValue = loc.meta?.attributeValue;
  const textValue = loc.meta?.textValue || attrValue || '';
  const role = loc.meta?.role;
  switch (format) {
    case 'Playwright TS':
      if (attrName === 'data-testid' || attrName === 'data-test' || attrName === 'data-test-id' || attrName === 'data-cy' || attrName === 'data-qa' || attrName === 'data-automation-id' || attrName === 'data-e2e') return `page.getByTestId('${q(attrValue)}')`;
      if (attrName === 'aria-label') return `page.getByLabel('${q(attrValue)}')`;
      if (attrName === 'placeholder') return `page.getByPlaceholder('${q(attrValue)}')`;
      if (attrName === 'alt') return `page.getByAltText('${q(attrValue)}')`;
      if (attrName === 'title') return `page.getByTitle('${q(attrValue)}')`;
      if (loc.type === 'link-text') return `page.getByRole('link', { name: '${q(textValue)}' })`;
      if (loc.category === 'text') return `page.getByText('${q(textValue)}')`;
      if (role && textValue) return `page.getByRole('${q(role)}', { name: '${q(textValue)}' })`;
      return loc.selectorType === 'xpath' ? `page.locator('xpath=${q(s)}')` : `page.locator('${q(s)}')`;
    case 'Selenium Java':
      if (loc.category === 'id' && attrValue) return `By.id("${attrValue.replace(/"/g, '\\"')}")`;
      if (attrName === 'name') return `By.name("${attrValue.replace(/"/g, '\\"')}")`;
      if (loc.type === 'link-text') return `By.linkText("${textValue.replace(/"/g, '\\"')}")`;
      if (loc.type === 'partial-link-text') return `By.partialLinkText("${textValue.replace(/"/g, '\\"')}")`;
      return loc.selectorType === 'xpath' ? `By.xpath("${s.replace(/"/g, '\\"')}")` : `By.cssSelector("${s.replace(/"/g, '\\"')}")`;
    case 'Cypress JS':
      if (attrName && attrValue && attrName.startsWith('data-')) return `cy.get('[${attrName}="${attrValue.replace(/"/g, '\\"')}"]')`;
      if (loc.category === 'id' && attrValue) return `cy.get('#${attrValue.replace(/'/g, "\\'")}')`;
      if (loc.type === 'link-text') return `cy.contains('a', '${q(textValue)}')`;
      if (loc.category === 'text') return `cy.contains('${q(textValue)}')`;
      return loc.selectorType === 'xpath' ? `cy.xpath('${q(s)}') // requires cypress-xpath` : `cy.get('${q(s)}')`;
    case 'WebdriverIO':
      if (loc.category === 'id' && attrValue) return `$('#${q(attrValue)}')`;
      if (attrName === 'aria-label') return `$('aria/${q(attrValue)}')`;
      if (loc.type === 'link-text') return `$('=${q(textValue)}')`;
      return `$('${q(s)}')`;
    case 'Puppeteer':
      if (loc.category === 'text') return `page.$('::-p-text(${q(textValue)})')`;
      return loc.selectorType === 'xpath' ? `page.$x('${q(s)}')` : `page.$('${q(s)}')`;
    case 'TestCafe':
      if (loc.category === 'id' && attrValue) return `Selector('#${q(attrValue)}')`;
      if (attrName === 'name') return `Selector('[name="${attrValue.replace(/"/g, '\\"')}"]')`;
      if (attrName && attrValue && attrName.startsWith('data-')) return `Selector('[${attrName}="${attrValue.replace(/"/g, '\\"')}"]')`;
      if (loc.type === 'link-text') return `Selector('a').withText('${q(textValue)}')`;
      if (loc.category === 'text') return `Selector('*').withText('${q(textValue)}')`;
      return `Selector('${q(s)}')`;
    case 'Raw JSON':
      return JSON.stringify({ [toFieldName(loc.fieldSeed || loc.meta?.textValue || loc.meta?.attributeValue || loc.label || 'element')]: s }, null, 2);
    default:
      return s;
  }
}

function updatePickBtn() {
  btnPick.classList.toggle('active', st.picking);
  btnPick.textContent = st.picking ? 'Stop' : 'Pick Element';
}

function updatePassiveBtn() {
  btnPassive.classList.toggle('passive-on', st.passive);
  btnPassive.textContent = st.passive ? 'Passive: ON' : 'Passive';
}

function updateLockUI() {
  btnLock.classList.toggle('locked', st.locked);
  btnLock.textContent = st.locked ? 'Locked' : 'Lock';
  $('lock-banner').hidden = !st.locked;
}

function updateStackButton() {
  btnStack.textContent = `Stack ${st.stack.length}`;
  btnStack.classList.toggle('stack-active', !!st.sections['sec-stack']);
}

function applySectionState() {
  Object.entries(st.sections).forEach(([id, open]) => {
    const el = $(id);
    if (el) el.open = !!open;
  });
  updateStackButton();
}

btnPick.addEventListener('click', () => {
  st.picking = !st.picking;
  updatePickBtn();
  port.postMessage({ type: st.picking ? 'startPicking' : 'stopPicking' });
  showView(st.picking ? 'v-picking' : st.payload ? 'v-results' : 'v-idle');
});

btnPassive.addEventListener('click', () => {
  st.passive = !st.passive;
  updatePassiveBtn();
  port.postMessage({ type: 'setPassive', enabled: st.passive });
});

btnLock.addEventListener('click', () => {
  st.locked = !st.locked;
  updateLockUI();
});
btnUnlock.addEventListener('click', () => {
  st.locked = false;
  updateLockUI();
});
btnStack.addEventListener('click', () => {
  st.sections['sec-stack'] = !st.sections['sec-stack'];
  applySectionState();
  saveSections();
  if (st.sections['sec-stack']) $('sec-stack').scrollIntoView({ block: 'nearest' });
});

btnAddCurrent.addEventListener('click', () => {
  if (!st.payload) return;
  addCurrentToStack();
});
btnClearStack.addEventListener('click', () => {
  st.stack = [];
  renderStack();
});
btnExportPom.addEventListener('click', () => {
  pomPicker.hidden = !pomPicker.hidden;
  pomOutput.hidden = true;
});

port.onMessage.addListener(msg => {
  if (msg.type === 'locatorsGenerated') {
    if (st.locked) return;
    st.picking = false;
    updatePickBtn();
    st.payload = msg.payload;
    btnLock.disabled = false;
    st.sections['sec-reference'] = true;
    st.sections['sec-locators'] = true;
    saveSections();
    renderResults(msg.payload);
    showView('v-results');
  } else if (msg.type === 'pickingCancelled') {
    st.picking = false;
    updatePickBtn();
    showView(st.payload ? 'v-results' : 'v-idle');
  } else if (msg.type === 'validateResult') {
    st.validatorState = msg;
    renderValidation();
  } else if (msg.type === 'error') {
    $('err-msg').textContent = msg.message;
    st.picking = false;
    updatePickBtn();
    showView('v-error');
  }
});

function matchBadge(count) {
  const cls = count === 1 ? 'match-1' : count > 1 ? 'match-many' : 'match-0';
  const text = count === 1 ? '1' : String(count || 0);
  return `<span class="match-badge ${cls}">${text}</span>`;
}

function renderResults(data) {
  renderReference(data);
  renderProperties(data);
  renderLocators(data.locators || []);
  renderStack();
  applySectionState();
}

function renderReference(data) {
  const body = $('reference-body');
  const stableClasses = (data.classInfo?.stable || []).slice(0, 3).join(' ');
  const relXpath = data.locators.find(loc => loc.type === 'relative-xpath')?.selector || '—';
  const cssPath = data.locators.find(loc => loc.type === 'css-path')?.selector || '—';
  const linkText = data.tag === 'a' ? (data.textPreview || '—') : '—';
  const rows = [
    ['ID', data.id || '—', data.referenceCounts?.id ?? 0],
    ['Class', stableClasses || '—', data.referenceCounts?.class ?? 0],
    ['Tag', data.tag || '—', data.referenceCounts?.tag ?? 0],
    ['Name', data.attributes?.name || '—', data.referenceCounts?.name ?? 0],
    ['aria-label', data.attributes?.['aria-label'] || '—', data.referenceCounts?.ariaLabel ?? 0],
    ['Link Text', linkText, data.referenceCounts?.linkText ?? 0],
    ['CSS Path', cssPath, data.referenceCounts?.cssPath ?? 0],
    ['XPath', relXpath, data.referenceCounts?.xpath ?? 0]
  ];
  body.innerHTML = `<div class="ref-grid">${rows.map(([k, v, c]) => `
    <div class="ref-item">
      <div class="ref-key">${escHtml(k)}</div>
      <div class="ref-value copyable">${escHtml(v)}</div>
      ${matchBadge(c)}
    </div>`).join('')}</div>`;
  body.querySelectorAll('.copyable').forEach(el => el.addEventListener('click', () => copyText(el.textContent)));
}

function renderProperties(data) {
  const body = $('props-body');
  const idBadge = data.id ? `<span class="badge ${data.idStable ? 'good' : 'warn'}">id:${escHtml(data.id)}</span>` : '';
  const roleBadge = data.attributes?.role ? `<span class="badge info">role:${escHtml(data.attributes.role)}</span>` : '';
  const typeBadge = data.attributes?.type ? `<span class="badge info">type:${escHtml(data.attributes.type)}</span>` : '';
  const ariaBadge = data.attributes?.['aria-label'] ? `<span class="badge info">aria-label</span>` : '';
  const testBadge = Object.keys(data.attributes || {}).find(key => key.startsWith('data-test') || key === 'data-cy' || key === 'data-qa' || key === 'data-e2e' || key === 'data-automation-id') ? `<span class="badge good">test-id</span>` : '';
  const attrs = Object.entries(data.attributes || {}).map(([key, value]) => `
    <div class="attr-item">
      <div class="attr-key ${PRIORITY_ATTRS.has(key) ? 'priority' : ''}">${escHtml(key)}</div>
      <div class="attr-value copyable">${escHtml(value)}</div>
      <button class="sm-btn btn-mini">Copy</button>
    </div>`).join('');

  body.innerHTML = `
    <div class="identity-row">
      <span class="identity-tag">&lt;${escHtml(data.tag)}&gt;</span>
      ${idBadge}${roleBadge}${typeBadge}${ariaBadge}${testBadge}
    </div>
    <div class="kv-grid">
      <div class="kv-block">
        <div class="kv-title">All attributes</div>
        <div class="attr-grid">${attrs || '<div class="empty-note">No attributes.</div>'}</div>
      </div>
      <div class="kv-block">
        <div class="kv-title">Classes</div>
        <div class="chips">${renderClassChips(data.classInfo)}</div>
      </div>
      <div class="kv-block">
        <div class="kv-title">Computed styles</div>
        <div class="attr-grid">${renderSimpleGrid(data.computedStyles || {})}</div>
      </div>
      <div class="kv-block">
        <div class="kv-title">Bounds</div>
        <div class="attr-grid">${renderSimpleGrid({
          size: `${data.rect?.w ?? 0} × ${data.rect?.h ?? 0}`,
          position: `${data.rect?.x ?? 0}, ${data.rect?.y ?? 0}`,
          tagCount: data.referenceCounts?.tag ?? 0,
          childCount: data.childCount ?? 0
        })}</div>
      </div>
      <div class="kv-block">
        <div class="kv-title">Text content</div>
        <div class="text-snippet">${escHtml(data.fullTextPreview || '—')}</div>
      </div>
    </div>`;

  body.querySelectorAll('.attr-value.copyable').forEach(el => el.addEventListener('click', () => copyText(el.textContent)));
  body.querySelectorAll('.btn-mini').forEach(el => el.addEventListener('click', () => copyText(el.previousElementSibling.textContent, el)));
  body.querySelectorAll('.chip[data-copy]').forEach(el => el.addEventListener('click', () => copyText(el.dataset.copy)));
}

function renderClassChips(classInfo = { stable: [], dynamic: [] }) {
  const stable = (classInfo.stable || []).map(cls => `<span class="chip" data-copy=".${escHtml(cls)}">.${escHtml(cls)}</span>`).join('');
  const dynamic = (classInfo.dynamic || []).map(cls => `<span class="chip dynamic">${escHtml(cls)}</span>`).join('');
  return stable + dynamic || '<span class="empty-note">No classes.</span>';
}

function renderSimpleGrid(obj) {
  return Object.entries(obj).map(([k, v]) => `
    <div class="attr-item">
      <div class="attr-key">${escHtml(k)}</div>
      <div class="attr-value">${escHtml(v)}</div>
      <span></span>
    </div>`).join('');
}

function getGrade(score) {
  if (score >= 85) return 'a';
  if (score >= 70) return 'b';
  if (score >= 50) return 'c';
  if (score >= 30) return 'd';
  return 'f';
}

function categoryColor(category) {
  return {
    test: '#10b981', aria: '#a855f7', id: '#8b5cf6', attr: '#22d3ee', class: '#3b82f6', text: '#f97316', hierarchy: '#84cc16', logical: '#f59e0b', css: '#eab308', xpath: '#9ca3af', position: '#ef4444', absolute: '#334155'
  }[category] || '#9ca3af';
}

function renderLocators(locators) {
  const body = $('locators-body');
  const stable = locators.filter(loc => loc.score >= 65).length;
  const moderate = locators.filter(loc => loc.score >= 30 && loc.score < 65).length;
  const fragile = locators.filter(loc => loc.score < 30).length;
  $('tier-pills').innerHTML = `<span class="pill stable">Stable ${stable}</span><span class="pill moderate">Moderate ${moderate}</span><span class="pill fragile">Fragile ${fragile}</span>`;

  const best = locators.find(loc => loc.matchCount === 1) || locators[0];
  const groups = [
    ['Stable', locators.filter(loc => loc.score >= 65)],
    ['Moderate', locators.filter(loc => loc.score >= 30 && loc.score < 65)],
    ['Fragile', locators.filter(loc => loc.score < 30)]
  ].filter(([, items]) => items.length);

  body.innerHTML = groups.map(([label, items]) => `
    <div class="loc-divider">${label}</div>
    ${items.map(loc => locatorCard(loc, best && loc.id === best.id)).join('')}
  `).join('');

  body.querySelectorAll('.loc-card').forEach(card => wireLocatorCard(card));
}

function locatorCard(loc, isBest) {
  const grade = getGrade(loc.score);
  const reason = [loc.reason, loc.warning, loc.matchCount === 0 ? 'No elements currently match this selector.' : '', loc.matchCount > 1 ? `Matches ${loc.matchCount} elements, so uniqueness is reduced.` : ''].filter(Boolean).join(' ');
  return `
    <article class="loc-card ${isBest ? 'best expanded' : ''} ${loc.matchCount === 0 ? 'zero' : ''}" data-locator-id="${loc.id}">
      <div class="loc-header">
        <div class="score-wrap">
          <div class="score-text grade-${grade}">${loc.score}%</div>
          <div class="score-bar"><span class="fill-${grade}" style="width:${Math.max(0, Math.min(loc.score, 100))}%"></span></div>
        </div>
        <span class="cat-dot" style="background:${categoryColor(loc.category)}"></span>
        <div class="loc-title">
          <div class="loc-main">
            <span>${escHtml(loc.category)} ${escHtml(loc.type)}</span>
            ${isBest ? '<span class="pill best-pill">★ Best</span>' : ''}
            <span class="match-badge ${loc.matchCount === 1 ? 'match-1' : loc.matchCount > 1 ? 'match-many' : 'match-0'}">${loc.matchCount === 1 ? '1 match' : `${loc.matchCount} matches`}</span>
          </div>
          <div class="loc-sub">${escHtml(loc.label)} • ${escHtml(loc.selectorType.toUpperCase())}</div>
        </div>
        ${loc.matchCount > 1 ? `<div class="loc-nav"><button class="icon-btn" data-nav="prev">‹</button><button class="icon-btn" data-nav="next">›</button></div>` : ''}
      </div>
      <div class="loc-body">
        <pre class="loc-code">${escHtml(loc.selector)}</pre>
        <div class="loc-actions">
          <button class="sm-btn" data-action="flash">⚡ Flash</button>
          <button class="sm-btn" data-action="highlight">🔍 Highlight</button>
          <button class="sm-btn" data-action="copy">Copy Raw</button>
          <button class="sm-btn" data-action="frameworks">Copy for…</button>
          <details class="reason-tip">
            <summary class="sm-btn">i</summary>
            <div class="reason-pop">${escHtml(reason || 'No additional notes.')}</div>
          </details>
        </div>
        <div class="framework-grid">${POM_FORMATS.map(name => `<button class="sm-btn" data-framework="${escHtml(name)}">${escHtml(name)}</button>`).join('')}</div>
      </div>
    </article>`;
}

function wireLocatorCard(card) {
  const id = Number(card.dataset.locatorId);
  const loc = st.payload?.locators?.find(item => item.id === id);
  if (!loc) return;
  card.querySelector('.loc-header').addEventListener('click', event => {
    if (event.target.closest('button')) return;
    card.classList.toggle('expanded');
  });
  card.querySelector('[data-action="copy"]').addEventListener('click', e => copyText(loc.selector, e.currentTarget));
  card.querySelector('[data-action="frameworks"]').addEventListener('click', () => {
    card.querySelector('.framework-grid').classList.toggle('open');
  });
  card.querySelectorAll('[data-framework]').forEach(btn => btn.addEventListener('click', () => copyText(selectorToFramework(loc, btn.dataset.framework), btn)));
  ['flash', 'highlight'].forEach(mode => {
    card.querySelector(`[data-action="${mode}"]`).addEventListener('click', e => toggleLocatorEffect(loc, mode, e.currentTarget));
  });
  card.querySelectorAll('[data-nav]').forEach(btn => btn.addEventListener('click', e => {
    e.stopPropagation();
    port.postMessage({ type: 'cycleMatch', selector: loc.selector, selectorType: loc.selectorType, direction: btn.dataset.nav });
  }));
}

function toggleLocatorEffect(loc, mode, btn) {
  const isSame = st.activeLocatorId === loc.id && st.activeLocatorMode === mode;
  port.postMessage({ type: isSame ? 'clearFlash' : 'flashLocator', selector: loc.selector, selectorType: loc.selectorType, mode });
  st.activeLocatorId = isSame ? null : loc.id;
  st.activeLocatorMode = isSame ? null : mode;
  $$('[data-action="flash"], [data-action="highlight"]').forEach(el => el.classList.remove('is-active'));
  if (!isSame) btn.classList.add('is-active');
}

function addCurrentToStack() {
  const loc = st.payload?.locators?.find(item => item.matchCount === 1) || st.payload?.locators?.[0];
  if (!loc) return;
  const fingerprint = `${st.payload.tag}|${st.payload.id || ''}|${st.payload.textPreview || ''}|${loc.selector}`;
  if (st.stack.some(item => item.fingerprint === fingerprint)) return;
  st.stack.push({
    fingerprint,
    tag: st.payload.tag,
    text: st.payload.textPreview || '',
    selector: loc.selector,
    selectorType: loc.selectorType,
    fieldName: toFieldName(st.payload.textPreview || st.payload.id || st.payload.attributes?.['aria-label'] || st.payload.attributes?.role || st.payload.tag)
  });
  renderStack();
}

function renderStack() {
  updateStackButton();
  const list = $('stack-list');
  if (!st.stack.length) {
    list.className = 'stack-list empty-note';
    list.textContent = 'No stacked elements yet.';
    pomPicker.hidden = true;
    pomOutput.hidden = true;
    return;
  }
  list.className = 'stack-list';
  list.innerHTML = st.stack.map((item, index) => `
    <div class="stack-row" data-stack-index="${index}">
      <div>${index + 1}.</div>
      <div class="stack-meta">
        <div><strong>&lt;${escHtml(item.tag)}&gt;</strong></div>
        <div class="stack-selector">${escHtml(item.selector)}</div>
        <div class="stack-snippet">${escHtml(item.text || '—')}</div>
      </div>
      <div class="stack-actions">
        <button class="icon-btn" data-stack-action="locate">⊙</button>
        <button class="icon-btn" data-stack-action="remove">×</button>
      </div>
    </div>`).join('');
  list.querySelectorAll('[data-stack-action]').forEach(btn => btn.addEventListener('click', e => {
    const row = e.currentTarget.closest('[data-stack-index]');
    const index = Number(row.dataset.stackIndex);
    if (e.currentTarget.dataset.stackAction === 'locate') {
      const item = st.stack[index];
      port.postMessage({ type: 'flashLocator', selector: item.selector, selectorType: item.selectorType, mode: 'highlight' });
    } else {
      st.stack.splice(index, 1);
      renderStack();
    }
  }));
  renderPomPicker();
}

function renderPomPicker() {
  pomPicker.innerHTML = POM_FORMATS.map(name => `<button class="sm-btn" data-pom-format="${escHtml(name)}">${escHtml(name)}</button>`).join('');
  pomPicker.querySelectorAll('[data-pom-format]').forEach(btn => btn.addEventListener('click', () => {
    pomOutput.hidden = false;
    pomOutput.textContent = exportPom(btn.dataset.pomFormat);
  }));
}

function toFieldName(input) {
  return String(input || 'element')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 4)
    .map((part, index) => index ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : part.toLowerCase())
    .join('') || 'element';
}

function exportPom(format) {
  const items = st.stack;
  switch (format) {
    case 'Playwright TS':
      return `export class LocatorLensPage {\n  constructor(private readonly page: Page) {}\n${items.map(item => `  readonly ${item.fieldName}: Locator = this.page.locator('${item.selector.replace(/'/g, "\\'")}');`).join('\n')}\n}`;
    case 'Selenium Java':
      return `public class LocatorLensPage {\n${items.map(item => `  @FindBy(${item.selectorType === 'xpath' ? `xpath = "${item.selector.replace(/"/g, '\\"')}"` : `css = "${item.selector.replace(/"/g, '\\"')}"`})\n  WebElement ${item.fieldName};`).join('\n\n')}\n}`;
    case 'Cypress JS':
      return `export const selectors = ${JSON.stringify(Object.fromEntries(items.map(item => [item.fieldName, item.selector])), null, 2)};`;
    case 'WebdriverIO':
      return `class LocatorLensPage {\n${items.map(item => `  get ${item.fieldName}() { return $('${item.selector.replace(/'/g, "\\'")}'); }`).join('\n')}\n}`;
    case 'Puppeteer':
      return `export class LocatorLensPage {\n  constructor(page) { this.page = page; }\n${items.map(item => `  async ${item.fieldName}() { return ${item.selectorType === 'xpath' ? `this.page.$x('${item.selector.replace(/'/g, "\\'")}')` : `this.page.$('${item.selector.replace(/'/g, "\\'")}')`}; }`).join('\n')}\n}`;
    case 'TestCafe':
      return `class LocatorLensPage {\n${items.map(item => `  get ${item.fieldName}() { return Selector('${item.selector.replace(/'/g, "\\'")}'); }`).join('\n')}\n}`;
    case 'Raw JSON':
      return JSON.stringify(Object.fromEntries(items.map(item => [item.fieldName, item.selector])), null, 2);
    default:
      return items.map(item => item.selector).join('\n');
  }
}

function selectedRadio(name) {
  return document.querySelector(`input[name="${name}"]:checked`)?.value;
}

function requestValidation() {
  const selector = valInput.value.trim();
  const selectorType = selectedRadio('val-type') || 'css';
  st.validatorMode = selectedRadio('val-mode') || 'flash';
  if (!selector) {
    st.validatorState = { selector: '', selectorType, count: 0, error: null, preview: [] };
    renderValidation();
    return;
  }
  port.postMessage({ type: 'validateSelector', selector, selectorType });
}

valInput.addEventListener('input', () => {
  clearTimeout(st.validateTimer);
  st.validateTimer = setTimeout(requestValidation, 380);
});
document.querySelectorAll('input[name="val-type"], input[name="val-mode"]').forEach(input => input.addEventListener('change', requestValidation));
valFlashBtn.addEventListener('click', () => {
  const { selector, selectorType } = st.validatorState;
  if (!selector) return;
  const shouldStop = st.validatorActive;
  port.postMessage({ type: shouldStop ? 'clearFlash' : 'flashLocator', selector, selectorType, mode: selectedRadio('val-mode') || 'flash' });
  st.validatorActive = !shouldStop;
  valFlashBtn.textContent = st.validatorActive ? 'Stop' : 'Flash';
});

function renderValidation() {
  const { selector, count, error, preview } = st.validatorState;
  const result = $('val-result');
  const previewEl = $('val-preview');
  if (!selector) {
    result.className = 'val-result';
    result.textContent = '';
    previewEl.className = 'val-preview empty-note';
    previewEl.textContent = 'No preview yet.';
    valFlashBtn.textContent = 'Flash';
    st.validatorActive = false;
    return;
  }
  if (error) {
    result.className = 'val-result fail';
    result.textContent = `✗ Invalid: ${error}`;
  } else if (count === 0) {
    result.className = 'val-result fail';
    result.textContent = '✗ 0 elements matched';
  } else if (count === 1) {
    result.className = 'val-result ok';
    result.textContent = '✓ 1 match — unique';
  } else {
    result.className = 'val-result warn';
    result.textContent = `⚠ ${count} matches — not unique`;
  }
  previewEl.className = 'val-preview';
  previewEl.innerHTML = (preview || []).length ? preview.map(item => `<div class="preview-item">&lt;${escHtml(item.tag)}&gt; "${escHtml(item.text)}"</div>`).join('') : '<div class="empty-note">No preview available.</div>';
}

$$('.sec').forEach(sec => sec.addEventListener('toggle', () => {
  st.sections[sec.id] = sec.open;
  saveSections();
  updateStackButton();
}));

document.addEventListener('click', e => {
  if (!e.target.closest('.reason-tip')) document.querySelectorAll('.reason-tip[open]').forEach(el => { el.open = false; });
});

function init() {
  updatePickBtn();
  updatePassiveBtn();
  updateLockUI();
  applySectionState();
  renderStack();
  renderValidation();
  renderPomPicker();
}

init();
