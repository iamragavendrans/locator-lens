// LocatorLens v5 — Panel JS
'use strict';

/* ── State ──────────────────────────────────────────── */
const st = {
  picking: false,
  passive: false,
  locked: false,
  payload: null // current locator results
};

/* ── Port to background ─────────────────────────────── */
const port = chrome.runtime.connect({ name: 'locatorlens' });

/* ── DOM refs ───────────────────────────────────────── */
const $ = id => document.getElementById(id);

const btnPick    = $('btn-pick');
const btnPassive = $('btn-passive');
const btnLock    = $('btn-lock');
const btnUnlock  = $('btn-unlock');

const vIdle    = $('v-idle');
const vPicking = $('v-picking');
const vError   = $('v-error');
const vResults = $('v-results');

/* ── View switching ─────────────────────────────────── */
function showView(id) {
  [vIdle, vPicking, vError, vResults].forEach(v => v.style.display = 'none');
  const el = $(id);
  if (el) el.style.display = '';
}

/* ── Framework templates ────────────────────────────── */
const frameworks = {
  'Selenium (Java)':      (sel, tp) => tp === 'xpath' ? `driver.findElement(By.xpath("${sel}"))` : `driver.findElement(By.cssSelector("${sel}"))`,
  'Selenium (Python)':    (sel, tp) => tp === 'xpath' ? `driver.find_element(By.XPATH, "${sel}")` : `driver.find_element(By.CSS_SELECTOR, "${sel}")`,
  'Playwright':           (sel, tp) => tp === 'xpath' ? `page.locator('xpath=${sel}')` : `page.locator('${sel}')`,
  'Cypress':              (sel, tp) => tp === 'xpath' ? `cy.xpath('${sel}')` : `cy.get('${sel}')`,
  'Puppeteer':            (sel, tp) => tp === 'xpath' ? `page.$x('${sel}')` : `page.$('${sel}')`,
  'WebdriverIO':          (sel, tp) => tp === 'xpath' ? `$('${sel}')` : `$('${sel}')`,
  'TestCafe':             (sel, tp) => tp === 'css' ? `Selector('${sel}')` : `// XPath not native in TestCafe`,
  'Robot Framework':      (sel, tp) => tp === 'xpath' ? `xpath:${sel}` : `css:${sel}`,
};

/* Copy to clipboard with feedback */
function copyText(text, btnEl) {
  navigator.clipboard.writeText(text).then(() => {
    if (!btnEl) return;
    const prev = btnEl.textContent;
    btnEl.textContent = '✓';
    setTimeout(() => { btnEl.textContent = prev; }, 900);
  });
}

/* ═══════════════════════════════════════════════════════
   PICK
   ═══════════════════════════════════════════════════════ */
btnPick.addEventListener('click', () => {
  st.picking = !st.picking;
  updatePickBtn();
  port.postMessage({ type: st.picking ? 'startPicking' : 'stopPicking' });
  if (st.picking) {
    showView('v-picking');
  } else if (st.payload) {
    showView('v-results');
  } else {
    showView('v-idle');
  }
});

function updatePickBtn() {
  if (st.picking) {
    btnPick.classList.add('active');
    btnPick.innerHTML = `<svg width="10" height="10" viewBox="0 0 10 10" fill="none"><rect x="1" y="1" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.5"/></svg> Stop`;
  } else {
    btnPick.classList.remove('active');
    btnPick.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="currentColor" stroke-width="1.5"/><line x1="6" y1="1" x2="6" y2="11" stroke="currentColor" stroke-width="1.5"/><line x1="1" y1="6" x2="11" y2="6" stroke="currentColor" stroke-width="1.5"/></svg> Pick`;
  }
}

/* ═══════════════════════════════════════════════════════
   PASSIVE
   ═══════════════════════════════════════════════════════ */
btnPassive.addEventListener('click', () => {
  st.passive = !st.passive;
  btnPassive.classList.toggle('passive-on', st.passive);
  btnPassive.textContent = st.passive ? 'Passive ●' : 'Passive';
  port.postMessage({ type: 'setPassive', enabled: st.passive });
});

/* ═══════════════════════════════════════════════════════
   LOCK  — FIX #3: actually blocks incoming data
   ═══════════════════════════════════════════════════════ */
btnLock.addEventListener('click', () => {
  st.locked = !st.locked;
  applyLockUI();
});

btnUnlock.addEventListener('click', () => {
  st.locked = false;
  applyLockUI();
});

function applyLockUI() {
  btnLock.classList.toggle('locked', st.locked);
  btnLock.textContent = st.locked ? 'Locked' : 'Lock';
  $('lock-banner').style.display = st.locked ? 'flex' : 'none';
}

/* ═══════════════════════════════════════════════════════
   INCOMING MESSAGES
   ═══════════════════════════════════════════════════════ */
port.onMessage.addListener(msg => {
  if (msg.type === 'locatorsGenerated') {
    // FIX #3: If locked, silently discard
    if (st.locked) return;

    // If we were in picking mode, stop it
    if (st.picking) {
      st.picking = false;
      updatePickBtn();
    }

    st.payload = msg.payload;
    renderResults(msg.payload);
    showView('v-results');

    // Enable lock button now that we have results
    btnLock.disabled = false;

  } else if (msg.type === 'pickingCancelled') {
    st.picking = false;
    updatePickBtn();
    if (st.payload) showView('v-results');
    else showView('v-idle');

  } else if (msg.type === 'validateResult') {
    renderValidation(msg);

  } else if (msg.type === 'error') {
    $('err-msg').textContent = msg.message;
    showView('v-error');
    st.picking = false;
    updatePickBtn();
  }
});

/* ═══════════════════════════════════════════════════════
   RENDER RESULTS
   ═══════════════════════════════════════════════════════ */
function renderResults(data) {
  // Properties
  const propsEl = $('props-body');
  propsEl.innerHTML = '';
  const propEntries = [
    ['Tag', `<${data.tag}>`],
    ['ID', data.id || '—'],
    ['Classes', data.classes.length ? data.classes.join(' ') : '—'],
    ['Text', data.textPreview || '—'],
    ['Size', `${data.rect.w} × ${data.rect.h}`],
    ['Position', `(${data.rect.x}, ${data.rect.y})`]
  ];
  for (const [key, val] of propEntries) {
    const row = document.createElement('div');
    row.className = 'prop-row';
    row.innerHTML = `<span class="prop-key">${key}</span><span class="prop-val">${escHtml(String(val))}</span>`;
    propsEl.appendChild(row);
  }

  // Attributes (extra)
  const skipAttrs = new Set(['id', 'class', 'style']);
  for (const [k, v] of Object.entries(data.attributes)) {
    if (skipAttrs.has(k)) continue;
    if (v.length > 200) continue;
    const row = document.createElement('div');
    row.className = 'prop-row';
    row.innerHTML = `<span class="prop-key">${escHtml(k)}</span><span class="prop-val">${escHtml(v)}</span>`;
    propsEl.appendChild(row);
  }

  // Best locator
  const best = data.locators[0];
  if (best) {
    $('best-bar').style.display = 'flex';
    $('best-type').textContent = `${best.label} · ${best.score}%${best.matchCount === 1 ? ' · unique' : ` · ${best.matchCount} matches`}`;
    $('best-sel').textContent = best.selector;
    $('best-copy').onclick = () => copyText(best.selector, $('best-copy'));

    // Framework menu for best
    buildFwMenu($('best-fw-menu'), best.selector, best.selectorType);
    $('best-fw-btn').onclick = () => {
      const m = $('best-fw-menu');
      m.style.display = m.style.display === 'none' ? 'block' : 'none';
    };
  } else {
    $('best-bar').style.display = 'none';
  }

  // Tier lists
  const tiers = { stable: [], moderate: [], fragile: [] };
  for (const loc of data.locators) {
    (tiers[loc.tier] || tiers.fragile).push(loc);
  }

  for (const tier of ['stable', 'moderate', 'fragile']) {
    const container = $(`tier-${tier}`);
    container.innerHTML = '';
    const secEl = $(`sec-${tier}`);

    if (tiers[tier].length === 0) {
      secEl.style.display = 'none';
      continue;
    }

    secEl.style.display = '';
    // Update count in header
    secEl.querySelector('.sec-head').textContent = `${tier.charAt(0).toUpperCase() + tier.slice(1)} (${tiers[tier].length})`;

    for (const loc of tiers[tier]) {
      container.appendChild(buildCard(loc));
    }
  }
}

function buildCard(loc) {
  const card = document.createElement('div');
  card.className = 'loc-card';

  const scoreClass = loc.score >= 75 ? 's-high' : loc.score >= 45 ? 's-mid' : 's-low';

  let html = `
    <div class="loc-top">
      <span class="loc-label">${escHtml(loc.label)} <span style="opacity:0.5">[${loc.selectorType}]</span></span>
      <span class="loc-score ${scoreClass}">${loc.score}</span>
      <span class="loc-matches">${loc.matchCount === 1 ? '✓ unique' : loc.matchCount + ' matches'}</span>
    </div>
    <div class="loc-sel">${escHtml(loc.selector)}</div>`;

  if (loc.warning) {
    html += `<div class="loc-warning">⚠ ${escHtml(loc.warning)}</div>`;
  }

  html += `<div class="loc-actions">
    <button class="sm-btn btn-copy-raw">Copy</button>
    <button class="sm-btn btn-flash">Flash</button>
    <div class="best-fw-wrap">
      <button class="sm-btn btn-fw">For ▾</button>
      <div class="fw-menu card-fw-menu" style="display:none"></div>
    </div>
  </div>`;

  card.innerHTML = html;

  // Copy raw
  card.querySelector('.btn-copy-raw').addEventListener('click', function() {
    copyText(loc.selector, this);
  });

  // Flash on page
  card.querySelector('.btn-flash').addEventListener('click', function() {
    port.postMessage({ type: 'flashLocator', selector: loc.selector, selectorType: loc.selectorType });
    this.textContent = '✓';
    setTimeout(() => { this.textContent = 'Flash'; }, 800);
  });

  // Framework menu
  const fwMenu = card.querySelector('.card-fw-menu');
  buildFwMenu(fwMenu, loc.selector, loc.selectorType);
  card.querySelector('.btn-fw').addEventListener('click', () => {
    fwMenu.style.display = fwMenu.style.display === 'none' ? 'block' : 'none';
  });

  return card;
}

function buildFwMenu(menuEl, selector, selectorType) {
  menuEl.innerHTML = '';
  for (const [name, fn] of Object.entries(frameworks)) {
    const btn = document.createElement('button');
    btn.textContent = name;
    btn.addEventListener('click', () => {
      const formatted = fn(selector, selectorType);
      copyText(formatted, btn);
      setTimeout(() => { menuEl.style.display = 'none'; }, 600);
    });
    menuEl.appendChild(btn);
  }
}

/* ═══════════════════════════════════════════════════════
   VALIDATOR
   ═══════════════════════════════════════════════════════ */
$('val-go').addEventListener('click', () => {
  const sel = $('val-input').value.trim();
  const tp = $('val-type').value;
  if (!sel) return;
  port.postMessage({ type: 'validateSelector', selector: sel, selectorType: tp });
});

$('val-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') $('val-go').click();
});

function renderValidation(msg) {
  const el = $('val-result');
  if (msg.error) {
    el.className = 'val-result val-fail';
    el.textContent = `✗ Error: ${msg.error}`;
  } else if (msg.count === 0) {
    el.className = 'val-result val-fail';
    el.textContent = `✗ No matches found`;
  } else {
    el.className = 'val-result val-ok';
    el.textContent = `✓ ${msg.count} match${msg.count !== 1 ? 'es' : ''} found`;
  }
}

/* ── Utility ────────────────────────────────────────── */
function escHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

/* Close framework menus on outside click */
document.addEventListener('click', e => {
  if (!e.target.classList.contains('btn-fw') && !e.target.closest('.fw-menu')) {
    document.querySelectorAll('.fw-menu').forEach(m => m.style.display = 'none');
  }
});
