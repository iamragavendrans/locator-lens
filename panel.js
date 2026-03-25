// LocatorLens v5 — Panel JS (PRD §6–10)
'use strict';

const $ = id => document.getElementById(id);
const port = chrome.runtime.connect({ name: 'locatorlens' });

const st = { picking: false, passive: false, locked: false, payload: null, stack: [], activeFlash: null };

// ═══════════════════════════════════════════════════════
//  PRD §10 — Section persistence
// ═══════════════════════════════════════════════════════
const SEC_KEY = 'll5_sections';
function loadSectionState() {
  try { return JSON.parse(localStorage.getItem(SEC_KEY)) || {}; } catch { return {}; }
}
function saveSectionState() {
  const state = {};
  document.querySelectorAll('.sec').forEach(s => { state[s.id] = s.open; });
  localStorage.setItem(SEC_KEY, JSON.stringify(state));
}
function applySectionState() {
  const saved = loadSectionState();
  // PRD defaults: Reference=open, Properties=closed, Locators=open, Stack=closed, Validator=closed
  const defaults = { 'sec-reference': true, 'sec-properties': false, 'sec-locators': true, 'sec-stack': false, 'sec-validator': false };
  document.querySelectorAll('.sec').forEach(s => {
    const open = saved[s.id] !== undefined ? saved[s.id] : (defaults[s.id] || false);
    s.open = open;
  });
}
document.querySelectorAll('.sec').forEach(s => s.addEventListener('toggle', saveSectionState));
applySectionState();

// ═══════════════════════════════════════════════════════
//  PRD §8 — Framework output templates
// ═══════════════════════════════════════════════════════
function fmtForFramework(fw, sel, tp, loc) {
  // loc has: category, label, selector, selectorType, plus data from payload
  const v = sel.replace(/'/g, "\\'");
  const d = sel.replace(/"/g, '\\"');
  switch (fw) {
    case 'playwright': {
      // PRD §8 Playwright TS: semantic methods
      if (loc) {
        const attrs = loc._attrs || {};
        if (attrs['data-testid']) return `page.getByTestId('${attrs['data-testid']}')`;
        if (attrs['aria-label']) return `page.getByLabel('${attrs['aria-label']}')`;
        if (attrs['placeholder']) return `page.getByPlaceholder('${attrs['placeholder']}')`;
        if (attrs['alt']) return `page.getByAltText('${attrs['alt']}')`;
        if (attrs['title']) return `page.getByTitle('${attrs['title']}')`;
        if (loc._role && loc._text) return `page.getByRole('${loc._role}', { name: '${loc._text.slice(0,50)}' })`;
        if (loc._tag === 'a' && loc._text) return `page.getByRole('link', { name: '${loc._text.slice(0,50)}' })`;
        if (loc._text && loc._text.length <= 60) return `page.getByText('${loc._text.slice(0,60)}')`;
      }
      return tp === 'xpath' ? `page.locator('xpath=${v}')` : `page.locator('${v}')`;
    }
    case 'selenium': {
      if (loc && loc._attrs) {
        if (loc._attrs.id && loc._stableId) return `driver.findElement(By.id("${loc._attrs.id}"))`;
        if (loc._attrs.name) return `driver.findElement(By.name("${loc._attrs.name}"))`;
        if (loc._tag === 'a' && loc._text) return `driver.findElement(By.linkText("${loc._text.slice(0,80)}"))`;
      }
      return tp === 'xpath' ? `driver.findElement(By.xpath("${d}"))` : `driver.findElement(By.cssSelector("${d}"))`;
    }
    case 'cypress': {
      if (loc && loc._attrs) {
        if (loc._attrs['data-testid']) return `cy.get('[data-testid="${loc._attrs['data-testid']}"]')`;
        if (loc._attrs['data-cy']) return `cy.get('[data-cy="${loc._attrs['data-cy']}"]')`;
        if (loc._attrs.id && loc._stableId) return `cy.get('#${loc._attrs.id}')`;
      }
      if (loc && loc._text && loc._tag === 'a') return `cy.contains('a', '${loc._text.slice(0,60)}')`;
      if (loc && loc._text && loc._text.length <= 60) return `cy.contains('${loc._text.slice(0,60)}')`;
      if (tp === 'xpath') return `cy.xpath('${v}') // requires cypress-xpath plugin`;
      return `cy.get('${v}')`;
    }
    case 'wdio': {
      if (loc && loc._attrs) {
        if (loc._attrs.id && loc._stableId) return `$('#${loc._attrs.id}')`;
        if (loc._attrs['aria-label']) return `$('aria/${loc._attrs['aria-label']}')`;
      }
      if (loc && loc._tag === 'a' && loc._text) return `$('=${loc._text.slice(0,60)}')`;
      return tp === 'xpath' ? `$('${v}')` : `$('${v}')`;
    }
    case 'puppeteer': {
      if (loc && loc._text && loc._text.length <= 60) return `page.$('::-p-text(${loc._text.slice(0,60)})')`;
      return tp === 'xpath' ? `page.$x('${v}')` : `page.$('${v}')`;
    }
    case 'testcafe': {
      if (loc && loc._attrs) {
        if (loc._attrs['data-testid']) return `Selector('[data-testid="${loc._attrs['data-testid']}"]')`;
        if (loc._attrs.id && loc._stableId) return `Selector('#${loc._attrs.id}')`;
        if (loc._attrs.name) return `Selector('[name="${loc._attrs.name}"]')`;
      }
      if (loc && loc._tag === 'a' && loc._text) return `Selector('a').withText('${loc._text.slice(0,60)}')`;
      if (loc && loc._text && loc._text.length <= 60) return `Selector('*').withText('${loc._text.slice(0,60)}')`;
      return tp === 'css' ? `Selector('${v}')` : `// XPath not native in TestCafe`;
    }
    case 'robot': return tp === 'xpath' ? `xpath:${sel}` : `css:${sel}`;
    case 'raw': default: return sel;
  }
}

const FW_LIST = [
  { key: 'playwright', label: 'Playwright TS' },
  { key: 'selenium',   label: 'Selenium Java' },
  { key: 'cypress',    label: 'Cypress JS' },
  { key: 'wdio',       label: 'WebdriverIO' },
  { key: 'puppeteer',  label: 'Puppeteer' },
  { key: 'testcafe',   label: 'TestCafe' },
  { key: 'robot',      label: 'Robot Fw' },
  { key: 'raw',        label: 'Raw' }
];

// ═══════════════════════════════════════════════════════
//  VIEW SWITCHING
// ═══════════════════════════════════════════════════════
const views = ['v-idle', 'v-picking', 'v-error', 'v-results'];
function showView(id) { views.forEach(v => $(v).style.display = 'none'); $(id).style.display = ''; }

// ═══════════════════════════════════════════════════════
//  UTILITY
// ═══════════════════════════════════════════════════════
function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function copyText(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    if (!btn) return; const p = btn.textContent; btn.textContent = '✓'; setTimeout(() => btn.textContent = p, 900);
  });
}

// ═══════════════════════════════════════════════════════
//  PICK (PRD §4.1)
// ═══════════════════════════════════════════════════════
$('btn-pick').addEventListener('click', () => {
  st.picking = !st.picking; updatePickBtn();
  port.postMessage({ type: st.picking ? 'startPicking' : 'stopPicking' });
  if (st.picking) showView('v-picking');
  else if (st.payload) showView('v-results');
  else showView('v-idle');
});

function updatePickBtn() {
  const b = $('btn-pick');
  if (st.picking) { b.classList.add('active'); b.innerHTML = '■ Stop'; }
  else { b.classList.remove('active'); b.innerHTML = `<svg width="11" height="11" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="currentColor" stroke-width="1.5"/><line x1="6" y1="1" x2="6" y2="11" stroke="currentColor" stroke-width="1.5"/><line x1="1" y1="6" x2="11" y2="6" stroke="currentColor" stroke-width="1.5"/></svg> Pick Element`; }
}

// ═══════════════════════════════════════════════════════
//  PASSIVE (PRD §4.2)
// ═══════════════════════════════════════════════════════
$('btn-passive').addEventListener('click', () => {
  st.passive = !st.passive;
  $('btn-passive').classList.toggle('passive-on', st.passive);
  $('btn-passive').textContent = st.passive ? 'Passive: ON' : 'Passive';
  port.postMessage({ type: 'setPassive', enabled: st.passive });
});

// ═══════════════════════════════════════════════════════
//  LOCK (PRD §4.3)
// ═══════════════════════════════════════════════════════
$('btn-lock').addEventListener('click', () => { st.locked = !st.locked; applyLock(); });
$('btn-unlock').addEventListener('click', () => { st.locked = false; applyLock(); });
function applyLock() {
  $('btn-lock').classList.toggle('locked', st.locked);
  $('btn-lock').textContent = st.locked ? 'Locked' : 'Lock';
  $('lock-banner').style.display = st.locked ? 'flex' : 'none';
}

// ═══════════════════════════════════════════════════════
//  STACK BUTTON (PRD §9)
// ═══════════════════════════════════════════════════════
$('btn-stack').addEventListener('click', () => {
  const sec = $('sec-stack');
  sec.open = !sec.open;
  $('btn-stack').classList.toggle('stack-on', sec.open);
  if (sec.open) sec.scrollIntoView({ behavior: 'smooth' });
  saveSectionState();
});

// ═══════════════════════════════════════════════════════
//  INCOMING MESSAGES
// ═══════════════════════════════════════════════════════
port.onMessage.addListener(msg => {
  if (msg.type === 'locatorsGenerated') {
    if (st.locked) return; // PRD §4.3 — discard when locked
    if (st.picking) { st.picking = false; updatePickBtn(); }
    st.payload = msg.payload;
    renderAll(msg.payload);
    showView('v-results');
    $('btn-lock').disabled = false;
    // PRD §6: open Reference + Locators on new result
    $('sec-reference').open = true;
    $('sec-locators').open = true;
    saveSectionState();
  } else if (msg.type === 'pickingCancelled') {
    st.picking = false; updatePickBtn();
    showView(st.payload ? 'v-results' : 'v-idle');
  } else if (msg.type === 'validateResult') {
    renderValidation(msg);
  } else if (msg.type === 'error') {
    $('err-msg').textContent = msg.message;
    showView('v-error');
    st.picking = false; updatePickBtn();
  }
});

// ═══════════════════════════════════════════════════════
//  RENDER ALL
// ═══════════════════════════════════════════════════════
function renderAll(data) {
  renderReference(data);
  renderProperties(data);
  renderLocators(data);
  updateStackUI();
}

// ═══════════════════════════════════════════════════════
//  §6.1 REFERENCE
// ═══════════════════════════════════════════════════════
function renderReference(data) {
  const g = $('ref-grid'); g.innerHTML = '';
  const cssPath = data.locators.find(l => l.label === 'css-path');
  const relXp = data.locators.find(l => l.label === 'relative-xpath');
  // Derive real match counts from locators (PRD §6.1)
  const idLoc = data.locators.find(l => l.category === 'id' && l.label === 'id');
  const nameLoc = data.locators.find(l => l.label === 'name');
  const ariaLoc = data.locators.find(l => l.label === 'aria-label');
  const linkLoc = data.locators.find(l => l.label === 'link-text');
  const rows = [
    ['ID', data.id || '', idLoc ? idLoc.matchCount : 0],
    ['Class', (data.stableClasses || []).slice(0, 3).join(' '), data.stableClasses?.length || 0],
    ['Tag', data.tag, data.tagCount || 0],
    ['Name', data.name || '', nameLoc ? nameLoc.matchCount : 0],
    ['aria-label', data.ariaLabel || '', ariaLoc ? ariaLoc.matchCount : 0],
    ['Link Text', data.linkText || '', linkLoc ? linkLoc.matchCount : 0],
    ['CSS Path', cssPath ? cssPath.selector : '', cssPath ? cssPath.matchCount : 0],
    ['XPath', relXp ? relXp.selector : '', relXp ? relXp.matchCount : 0]
  ];
  for (const [key, val, count] of rows) {
    const k = document.createElement('span'); k.className = 'ref-key'; k.textContent = key;
    const v = document.createElement('span'); v.className = 'ref-val'; v.textContent = val || '—'; v.title = val || '';
    if (val) v.addEventListener('click', () => copyText(val, v));
    const c = document.createElement('span');
    c.className = 'ref-count ' + (count === 1 ? 'cnt-1' : count > 1 ? 'cnt-n' : 'cnt-0');
    c.textContent = count;
    g.appendChild(k); g.appendChild(v); g.appendChild(c);
  }
}

// ═══════════════════════════════════════════════════════
//  §6.2 PROPERTIES
// ═══════════════════════════════════════════════════════
function renderProperties(data) {
  const body = $('props-body'); body.innerHTML = '';
  // Identity badges
  const idRow = document.createElement('div'); idRow.className = 'prop-identity';
  idRow.innerHTML = `<span class="prop-badge prop-badge-tag">&lt;${esc(data.tag)}&gt;</span>`;
  if (data.id) {
    const stable = data.locators.some(l => l.category === 'id' && l.label === 'id');
    idRow.innerHTML += `<span class="prop-badge ${stable ? 'prop-badge-green' : 'prop-badge-amber'}">id: ${esc(data.id.slice(0,25))}</span>`;
  }
  if (data.role) idRow.innerHTML += `<span class="prop-badge prop-badge-violet">role: ${esc(data.role)}</span>`;
  if (data.attributes.type) idRow.innerHTML += `<span class="prop-badge prop-badge-cyan">type: ${esc(data.attributes.type)}</span>`;
  const testAttrs = ['data-testid', 'data-test-id', 'data-cy', 'data-test', 'data-qa'];
  for (const ta of testAttrs) { if (data.attributes[ta]) idRow.innerHTML += `<span class="prop-badge prop-badge-green">${ta}</span>`; }
  body.appendChild(idRow);

  // All attributes
  const priorityAttrs = new Set(['id', 'name', 'aria-label', 'data-testid', 'placeholder', 'href', 'value', 'role', 'type']);
  const skipAttrs = new Set(['class', 'style']);
  for (const [k, v] of Object.entries(data.attributes)) {
    if (skipAttrs.has(k) || v.length > 200) continue;
    const row = document.createElement('div'); row.className = 'prop-row';
    const isPri = priorityAttrs.has(k);
    row.innerHTML = `<span class="prop-key">${esc(k)}</span><span class="prop-val ${isPri ? 'prop-val-pri' : ''}" title="Click to copy">${esc(v)}</span>`;
    row.querySelector('.prop-val').addEventListener('click', function() { copyText(v, this); });
    body.appendChild(row);
  }

  // Class chips
  if (data.classes.length > 0) {
    const chips = document.createElement('div'); chips.className = 'class-chips';
    for (const cls of data.stableClasses || []) {
      const c = document.createElement('span'); c.className = 'chip chip-stable'; c.textContent = '.' + cls;
      c.addEventListener('click', () => copyText('.' + cls, c)); chips.appendChild(c);
    }
    for (const cls of data.dynamicClasses || []) {
      const c = document.createElement('span'); c.className = 'chip chip-dynamic'; c.textContent = '.' + cls;
      chips.appendChild(c);
    }
    body.appendChild(chips);
  }

  // Computed styles + bounds
  if (data.computed || data.rect) {
    const sub = document.createElement('div'); sub.className = 'prop-sub';
    let html = '';
    if (data.computed) {
      html += `<div class="prop-row"><span class="prop-key">display</span><span class="prop-val">${esc(data.computed.display)}</span></div>`;
      html += `<div class="prop-row"><span class="prop-key">visibility</span><span class="prop-val">${esc(data.computed.visibility)}</span></div>`;
      html += `<div class="prop-row"><span class="prop-key">cursor</span><span class="prop-val">${esc(data.computed.cursor)}</span></div>`;
      html += `<div class="prop-row"><span class="prop-key">font</span><span class="prop-val">${esc(data.computed.fontSize)} / ${esc(data.computed.fontWeight)}</span></div>`;
    }
    if (data.rect) html += `<div class="prop-row"><span class="prop-key">bounds</span><span class="prop-val">${data.rect.w}×${data.rect.h} at (${data.rect.x}, ${data.rect.y})</span></div>`;
    html += `<div class="prop-row"><span class="prop-key">children</span><span class="prop-val">${data.childCount}</span></div>`;
    if (data.textPreview) html += `<div class="prop-row"><span class="prop-key">text</span><span class="prop-val">${esc(data.textPreview.slice(0,200))}</span></div>`;
    sub.innerHTML = html;
    body.appendChild(sub);
  }
}

// ═══════════════════════════════════════════════════════
//  §6.3 LOCATORS
// ═══════════════════════════════════════════════════════
function renderLocators(data) {
  const locs = data.locators;
  // Tier pills in header
  const tiers = { stable: 0, moderate: 0, fragile: 0 };
  locs.forEach(l => tiers[l.tier]++);
  $('tier-pills').innerHTML =
    `<span class="tier-pill tp-stable">${tiers.stable}</span>` +
    `<span class="tier-pill tp-moderate">${tiers.moderate}</span>` +
    `<span class="tier-pill tp-fragile">${tiers.fragile}</span>`;

  // Best card — highest scoring with matchCount === 1
  const best = locs.find(l => l.matchCount === 1);
  const bestEl = $('best-card');
  if (best) {
    const locMeta = buildLocMeta(data, best);
    bestEl.style.display = '';
    bestEl.innerHTML = `
      <div class="best-header">
        <span class="best-star">★</span>
        <span class="best-label">${esc(best.label)} · ${best.score}% · unique</span>
      </div>
      <div class="best-sel">${esc(best.selector)}</div>
      <div class="best-actions">
        <button class="sm-btn" data-act="copy-raw">Copy Raw</button>
        <button class="sm-btn" data-act="flash">⚡ Flash</button>
        <button class="sm-btn" data-act="highlight">🔍 Highlight</button>
      </div>
      <div class="fw-grid"></div>`;
    bestEl.querySelector('[data-act="copy-raw"]').onclick = function() { copyText(best.selector, this); };
    bestEl.querySelector('[data-act="flash"]').onclick = function() { toggleFlash('flash', best, this); };
    bestEl.querySelector('[data-act="highlight"]').onclick = function() { toggleFlash('highlight', best, this); };
    buildFwGrid(bestEl.querySelector('.fw-grid'), best, locMeta);
  } else { bestEl.style.display = 'none'; }

  // Tier sections
  for (const tier of ['stable', 'moderate', 'fragile']) {
    const container = $('tier-' + tier);
    const hd = $('tier-' + tier + '-hd');
    container.innerHTML = '';
    const tierLocs = locs.filter(l => l.tier === tier);
    if (tierLocs.length === 0) { hd.style.display = 'none'; continue; }
    hd.style.display = ''; hd.textContent = `${tier.charAt(0).toUpperCase() + tier.slice(1)} (${tierLocs.length})`;
    for (const loc of tierLocs) {
      container.appendChild(buildLocCard(data, loc, loc === best));
    }
  }
}

function buildLocMeta(data, loc) {
  return {
    _attrs: data.attributes,
    _tag: data.tag,
    _text: data.textContent,
    _role: data.role,
    _stableId: data.id && data.locators.some(l => l.category === 'id' && l.label === 'id')
  };
}

function scoreGrade(s) {
  if (s >= 80) return 's-a';
  if (s >= 65) return 's-b';
  if (s >= 45) return 's-c';
  if (s >= 30) return 's-d';
  return 's-f';
}

function catDot(cat) {
  const map = { test:'dot-test', aria:'dot-aria', id:'dot-id', attr:'dot-attr', class:'dot-class', text:'dot-text', hierarchy:'dot-hierarchy', logical:'dot-logical', css:'dot-css', xpath:'dot-xpath', position:'dot-position', absolute:'dot-absolute' };
  return map[cat] || 'dot-xpath';
}

function buildLocCard(data, loc, isBest) {
  const card = document.createElement('div');
  card.className = 'loc-card';
  if (loc.matchCount === 0) card.dataset.zero = 'true';

  const locMeta = buildLocMeta(data, loc);

  // Header (always visible)
  const head = document.createElement('div'); head.className = 'loc-head';
  let headHtml = `<span class="loc-dot ${catDot(loc.category)}"></span>`;
  headHtml += `<span class="loc-info">${esc(loc.category)} ${esc(loc.label)}</span>`;
  if (isBest) headHtml += `<span class="loc-best-pill">★ Best</span>`;
  headHtml += `<span class="loc-score ${scoreGrade(loc.score)}">${loc.score}</span>`;
  const mCls = loc.matchCount === 1 ? 'm-unique' : loc.matchCount > 1 ? 'm-multi' : 'm-zero';
  headHtml += `<span class="loc-match ${mCls}">${loc.matchCount === 1 ? '1 match' : loc.matchCount + ' matches'}</span>`;
  if (loc.matchCount > 1) {
    headHtml += `<span class="loc-nav"><button class="loc-nav-btn" data-dir="prev" title="Previous match">‹</button><button class="loc-nav-btn" data-dir="next" title="Next match">›</button></span>`;
  }
  head.innerHTML = headHtml;

  // Nav buttons
  let navIdx = 0;
  head.querySelectorAll('.loc-nav-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      navIdx += btn.dataset.dir === 'next' ? 1 : -1;
      navIdx = Math.max(0, Math.min(navIdx, loc.matchCount - 1));
      port.postMessage({ type: 'navigateMatch', selector: loc.selector, selectorType: loc.selectorType, index: navIdx });
    });
  });

  // Toggle expand
  head.addEventListener('click', () => card.classList.toggle('open'));

  // Body (hidden until expanded)
  const body = document.createElement('div'); body.className = 'loc-cbody';
  let bodyHtml = `<div class="loc-sel">${esc(loc.selector)}</div>`;
  if (loc.warning) bodyHtml += `<div class="loc-warning">⚠ ${esc(loc.warning)}</div>`;
  bodyHtml += `<div class="loc-actions">
    <button class="sm-btn" data-act="copy-raw">Copy Raw</button>
    <button class="sm-btn" data-act="flash">⚡ Flash</button>
    <button class="sm-btn" data-act="highlight">🔍 Highlight</button>
    <button class="sm-btn" data-act="copy-for">Copy for…</button>
  </div>`;
  bodyHtml += `<div class="fw-grid" style="display:none"></div>`;
  body.innerHTML = bodyHtml;

  body.querySelector('[data-act="copy-raw"]').addEventListener('click', function() { copyText(loc.selector, this); });
  body.querySelector('[data-act="flash"]').addEventListener('click', function() { toggleFlash('flash', loc, this); });
  body.querySelector('[data-act="highlight"]').addEventListener('click', function() { toggleFlash('highlight', loc, this); });
  body.querySelector('[data-act="copy-for"]').addEventListener('click', () => {
    const g = body.querySelector('.fw-grid');
    g.style.display = g.style.display === 'none' ? 'flex' : 'none';
  });
  buildFwGrid(body.querySelector('.fw-grid'), loc, locMeta);

  card.appendChild(head);
  card.appendChild(body);
  return card;
}

function buildFwGrid(container, loc, meta) {
  for (const fw of FW_LIST) {
    const btn = document.createElement('button');
    btn.className = 'sm-btn';
    btn.textContent = fw.label;
    btn.addEventListener('click', function() {
      const formatted = fmtForFramework(fw.key, loc.selector, loc.selectorType, meta);
      copyText(formatted, this);
    });
    container.appendChild(btn);
  }
}

// ═══════════════════════════════════════════════════════
//  FLASH / HIGHLIGHT TOGGLE
// ═══════════════════════════════════════════════════════
function toggleFlash(mode, loc, btn) {
  const key = mode + ':' + loc.selector;
  if (st.activeFlash === key) {
    port.postMessage({ type: 'clearFlash' });
    st.activeFlash = null;
    btn.classList.remove('active');
  } else {
    // Clear previous
    document.querySelectorAll('.sm-btn.active').forEach(b => b.classList.remove('active'));
    port.postMessage({ type: mode === 'flash' ? 'flashLocator' : 'highlightLocator', selector: loc.selector, selectorType: loc.selectorType });
    st.activeFlash = key;
    btn.classList.add('active');
  }
}

// ═══════════════════════════════════════════════════════
//  §6.4 STACK + POM EXPORT
// ═══════════════════════════════════════════════════════
$('btn-add-stack').addEventListener('click', () => {
  if (!st.payload) return;
  const best = st.payload.locators.find(l => l.matchCount === 1) || st.payload.locators[0];
  if (!best) return;
  // Deduplicate by selector
  if (st.stack.some(s => s.selector === best.selector)) return;
  st.stack.push({
    tag: st.payload.tag,
    text: st.payload.textContent || '',
    selector: best.selector,
    selectorType: best.selectorType,
    id: st.payload.id,
    ariaLabel: st.payload.ariaLabel,
    role: st.payload.role,
    attrs: st.payload.attributes
  });
  updateStackUI();
});

$('btn-clear-stack').addEventListener('click', () => { st.stack = []; updateStackUI(); $('pom-picker').style.display = 'none'; });
$('btn-export-pom').addEventListener('click', () => {
  const p = $('pom-picker');
  p.style.display = p.style.display === 'none' ? 'flex' : 'none';
});

function updateStackUI() {
  $('stack-count').textContent = st.stack.length;
  const list = $('stack-list'); list.innerHTML = '';
  st.stack.forEach((item, i) => {
    const row = document.createElement('div'); row.className = 'stack-row';
    row.innerHTML = `<span class="stack-idx">${i + 1}</span><span class="stack-info">&lt;${esc(item.tag)}&gt; ${esc(item.selector.slice(0,60))}</span>`;
    const locBtn = document.createElement('button'); locBtn.className = 'sm-btn'; locBtn.textContent = '⊙';
    locBtn.addEventListener('click', () => { port.postMessage({ type: 'highlightLocator', selector: item.selector, selectorType: item.selectorType }); });
    const rmBtn = document.createElement('button'); rmBtn.className = 'sm-btn'; rmBtn.textContent = '×';
    rmBtn.addEventListener('click', () => { st.stack.splice(i, 1); updateStackUI(); });
    row.appendChild(locBtn); row.appendChild(rmBtn);
    list.appendChild(row);
  });
}

// POM export buttons
document.querySelectorAll('.pom-btn').forEach(btn => {
  btn.addEventListener('click', function() {
    if (!st.stack.length) return;
    const fw = this.dataset.fw;
    const pom = generatePOM(st.stack, fw);
    copyText(pom, this);
  });
});

function fieldName(item) {
  // Auto-generate camelCase field name from text → id → aria-label → role → tag
  let raw = item.text || item.id || item.ariaLabel || item.role || item.tag;
  raw = raw.replace(/[^a-zA-Z0-9\s]/g, '').trim().slice(0, 40);
  if (!raw) raw = item.tag;
  const words = raw.split(/\s+/).filter(Boolean);
  return words.map((w, i) => i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('');
}

function generatePOM(stack, fw) {
  const items = stack.map(s => ({ name: fieldName(s), sel: s.selector, tp: s.selectorType, item: s }));

  switch (fw) {
    case 'playwright': {
      let out = `import { type Locator, type Page } from '@playwright/test';\n\nexport class PageModel {\n  readonly page: Page;\n`;
      items.forEach(i => out += `  readonly ${i.name}: Locator;\n`);
      out += `\n  constructor(page: Page) {\n    this.page = page;\n`;
      items.forEach(i => {
        const meta = { _attrs: i.item.attrs, _tag: i.item.tag, _text: i.item.text, _role: i.item.role, _stableId: true };
        out += `    this.${i.name} = ${fmtForFramework('playwright', i.sel, i.tp, meta)};\n`;
      });
      out += `  }\n}\n`;
      return out;
    }
    case 'selenium': {
      let out = `import org.openqa.selenium.WebElement;\nimport org.openqa.selenium.support.FindBy;\nimport org.openqa.selenium.support.PageFactory;\n\npublic class PageModel {\n`;
      items.forEach(i => {
        const ann = i.tp === 'xpath' ? `@FindBy(xpath = "${i.sel}")` : `@FindBy(css = "${i.sel}")`;
        out += `  ${ann}\n  private WebElement ${i.name};\n\n`;
      });
      out += `  public PageModel(WebDriver driver) {\n    PageFactory.initElements(driver, this);\n  }\n}\n`;
      return out;
    }
    case 'cypress': {
      let out = `const selectors = {\n`;
      items.forEach((i, idx) => out += `  ${i.name}: '${i.sel}'${idx < items.length - 1 ? ',' : ''}\n`);
      out += `};\nexport default selectors;\n`;
      return out;
    }
    case 'wdio': {
      let out = `class PageModel {\n`;
      items.forEach(i => out += `  get ${i.name}() { return $('${i.sel}'); }\n`);
      out += `}\nexport default new PageModel();\n`;
      return out;
    }
    case 'puppeteer': {
      let out = `class PageModel {\n  constructor(page) { this.page = page; }\n\n`;
      items.forEach(i => {
        out += i.tp === 'xpath'
          ? `  async ${i.name}() { return (await this.page.$x('${i.sel}'))[0]; }\n`
          : `  async ${i.name}() { return this.page.$('${i.sel}'); }\n`;
      });
      out += `}\nmodule.exports = PageModel;\n`;
      return out;
    }
    case 'testcafe': {
      let out = `import { Selector } from 'testcafe';\n\n`;
      items.forEach(i => out += `export const ${i.name} = Selector('${i.sel}');\n`);
      return out;
    }
    case 'raw': default: {
      const obj = {};
      items.forEach(i => obj[i.name] = i.sel);
      return JSON.stringify(obj, null, 2);
    }
  }
}

// ═══════════════════════════════════════════════════════
//  §6.5 LIVE VALIDATOR
// ═══════════════════════════════════════════════════════
let valDebounce = null;
$('val-input').addEventListener('input', () => {
  clearTimeout(valDebounce);
  valDebounce = setTimeout(() => {
    const sel = $('val-input').value.trim();
    if (!sel) { $('val-result').innerHTML = ''; $('val-preview').innerHTML = ''; $('val-flash').style.display = 'none'; return; }
    port.postMessage({ type: 'validateSelector', selector: sel, selectorType: $('val-type').value });
  }, 380);
});
$('val-go').addEventListener('click', () => {
  const sel = $('val-input').value.trim();
  if (!sel) return;
  port.postMessage({ type: 'validateSelector', selector: sel, selectorType: $('val-type').value });
});
$('val-input').addEventListener('keydown', e => { if (e.key === 'Enter') $('val-go').click(); });

$('val-flash').addEventListener('click', function() {
  const sel = $('val-input').value.trim();
  if (!sel) return;
  const mode = $('val-mode').value;
  port.postMessage({ type: mode === 'flash' ? 'flashLocator' : 'highlightLocator', selector: sel, selectorType: $('val-type').value });
  this.textContent = 'Stop';
  this._active = !this._active;
  if (!this._active) { port.postMessage({ type: 'clearFlash' }); this.textContent = mode === 'flash' ? '⚡ Flash' : '🔍 Highlight'; }
});

function renderValidation(msg) {
  const el = $('val-result');
  const prev = $('val-preview');
  const flashBtn = $('val-flash');
  if (msg.error) {
    el.className = 'val-result val-fail'; el.textContent = `✗ Invalid: ${msg.error}`;
    prev.innerHTML = ''; flashBtn.style.display = 'none';
  } else if (msg.count === 0) {
    el.className = 'val-result val-fail'; el.textContent = `✗ 0 elements matched`;
    prev.innerHTML = ''; flashBtn.style.display = 'none';
  } else {
    const cls = msg.count === 1 ? 'val-ok' : 'val-warn';
    const txt = msg.count === 1 ? '✓ 1 match — unique' : `⚠ ${msg.count} matches — not unique`;
    el.className = 'val-result ' + cls; el.textContent = txt;
    // Preview list (up to 5)
    prev.innerHTML = '';
    if (msg.previews) {
      msg.previews.forEach(p => {
        const d = document.createElement('div'); d.className = 'val-preview-item';
        d.textContent = `<${p.tag}> "${p.text.slice(0, 50)}"`;
        prev.appendChild(d);
      });
    }
    flashBtn.style.display = '';
    const mode = $('val-mode').value;
    flashBtn.textContent = mode === 'flash' ? '⚡ Flash' : '🔍 Highlight';
    flashBtn._active = false;
  }
}

// ═══════════════════════════════════════════════════════
//  GLOBAL CLICK — close menus
// ═══════════════════════════════════════════════════════
document.addEventListener('click', e => {
  if (!e.target.closest('.fw-grid') && !e.target.closest('.pom-picker')) {
    // nothing to close currently
  }
});
