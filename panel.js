'use strict';
const $ = (id) => document.getElementById(id);

// ═══════════════════════════════════════════════════════
//  PORT with auto-reconnect — fixes "disconnected port" errors
// ═══════════════════════════════════════════════════════
let port = null;
let portAlive = false;

const connectPort = () => {
  try {
    port = chrome.runtime.connect({ name: 'locatorlens' });
    portAlive = true;
    port.onDisconnect.addListener(() => {
      portAlive = false;
      port = null;
      // Auto-reconnect after 500ms
      setTimeout(connectPort, 500);
    });
    port.onMessage.addListener(onPortMessage);
    // Re-query tab state on reconnect
    safeSend({ type: 'getTabState' });
  } catch (e) {
    portAlive = false;
    setTimeout(connectPort, 1000);
  }
};

const safeSend = (msg) => {
  if (!portAlive || !port) {
    connectPort();
    // Queue message for after reconnect
    setTimeout(() => { try { if (port) port.postMessage(msg); } catch(_){} }, 600);
    return;
  }
  try { port.postMessage(msg); }
  catch (e) { portAlive = false; connectPort(); }
};

connectPort();

const st = { picking: false, passive: false, locked: false, payload: null, stack: [], activeFlash: null };

// ═══════════════════════════════════════════════════════
//  Section persistence
// ═══════════════════════════════════════════════════════
const SEC_KEY = 'll5_sections';
const loadSectionState = () => { try { return JSON.parse(localStorage.getItem(SEC_KEY)) || {}; } catch(e) { return {}; } };
const saveSectionState = () => {
  const state = {};
  document.querySelectorAll('.sec').forEach((s) => { state[s.id] = s.open; });
  try { localStorage.setItem(SEC_KEY, JSON.stringify(state)); } catch(e) {}
};
const applySectionState = () => {
  const saved = loadSectionState();
  const defaults = { 'sec-reference': true, 'sec-properties': false, 'sec-locators': true, 'sec-stack': false, 'sec-validator': false };
  document.querySelectorAll('.sec').forEach((s) => {
    s.open = saved[s.id] !== undefined ? saved[s.id] : (defaults[s.id] || false);
  });
};
document.querySelectorAll('.sec').forEach((s) => { s.addEventListener('toggle', saveSectionState); });
applySectionState();

// ═══════════════════════════════════════════════════════
//  Framework templates (unchanged)
// ═══════════════════════════════════════════════════════
const fmtForFramework = (fw, sel, tp, loc) => {
  const v = sel.replace(/'/g, "\\'"), d = sel.replace(/"/g, '\\"');
  switch(fw) {
    case 'playwright': {
      if(loc){const a=loc._attrs||{};if(a['data-testid'])return"page.getByTestId('"+a['data-testid']+"')";if(a['aria-label'])return"page.getByLabel('"+a['aria-label']+"')";if(a.placeholder)return"page.getByPlaceholder('"+a.placeholder+"')";if(a.alt)return"page.getByAltText('"+a.alt+"')";if(a.title)return"page.getByTitle('"+a.title+"')";if(loc._role&&loc._text)return"page.getByRole('"+loc._role+"',{name:'"+loc._text.slice(0,50)+"'})";if(loc._tag==='a'&&loc._text)return"page.getByRole('link',{name:'"+loc._text.slice(0,50)+"'})";if(loc._text&&loc._text.length<=60)return"page.getByText('"+loc._text.slice(0,60)+"')";}
      return tp==='xpath'?"page.locator('xpath="+v+"')":"page.locator('"+v+"')";
    }
    case 'selenium': {if(loc&&loc._attrs){if(loc._attrs.id&&loc._stableId)return'driver.findElement(By.id("'+loc._attrs.id+'"))';if(loc._attrs.name)return'driver.findElement(By.name("'+loc._attrs.name+'"))';if(loc._tag==='a'&&loc._text)return'driver.findElement(By.linkText("'+loc._text.slice(0,80)+'"))';} return tp==='xpath'?'driver.findElement(By.xpath("'+d+'"))':'driver.findElement(By.cssSelector("'+d+'"))';}
    case 'cypress': {if(loc&&loc._attrs){if(loc._attrs['data-testid'])return"cy.get('[data-testid=\""+loc._attrs['data-testid']+"\"]')";if(loc._attrs.id&&loc._stableId)return"cy.get('#"+loc._attrs.id+"')";} if(loc&&loc._text&&loc._text.length<=60)return"cy.contains('"+loc._text.slice(0,60)+"')"; if(tp==='xpath')return"cy.xpath('"+v+"')"; return"cy.get('"+v+"')";}
    case 'wdio': return"$('"+v+"')";
    case 'puppeteer': return tp==='xpath'?"page.$x('"+v+"')":"page.$('"+v+"')";
    case 'testcafe': return tp==='css'?"Selector('"+v+"')":"// XPath not native in TestCafe";
    case 'robot': return tp==='xpath'?'xpath:'+sel:'css:'+sel;
    case 'raw': default: return sel;
  }
};
const FW_LIST=[{key:'playwright',label:'Playwright TS'},{key:'selenium',label:'Selenium Java'},{key:'cypress',label:'Cypress JS'},{key:'wdio',label:'WebdriverIO'},{key:'puppeteer',label:'Puppeteer'},{key:'testcafe',label:'TestCafe'},{key:'robot',label:'Robot Fw'},{key:'raw',label:'Raw'}];

// ═══════════════════════════════════════════════════════
//  VIEW SWITCHING & UTILITIES
// ═══════════════════════════════════════════════════════
const viewIds = ['v-idle','v-picking','v-error','v-results'];
const showView = (id) => { viewIds.forEach((v) => { $(v).style.display='none'; }); $(id).style.display=''; };
const esc = (s) => { const d=document.createElement('div'); d.textContent=s; return d.innerHTML; };
const copyText = (text, btn) => { navigator.clipboard.writeText(text).then(() => { if(!btn) return; const p=btn.textContent; btn.textContent='Copied'; setTimeout(() => { btn.textContent=p; }, 900); }).catch(() => {}); };

// ═══════════════════════════════════════════════════════
//  PICK
// ═══════════════════════════════════════════════════════
$('btn-pick').addEventListener('click', () => {
  st.picking = !st.picking;
  updatePickBtn();
  safeSend({ type: st.picking ? 'startPicking' : 'stopPicking' });
  if (st.picking) showView('v-picking'); else if (st.payload) showView('v-results'); else showView('v-idle');
});

const updatePickBtn = () => {
  const b = $('btn-pick');
  if (st.picking) {
    b.classList.add('active');
    b.textContent = 'Stop';
  } else {
    b.classList.remove('active');
    b.innerHTML = '<svg width="11" height="11" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="currentColor" stroke-width="1.5"/><line x1="6" y1="1" x2="6" y2="11" stroke="currentColor" stroke-width="1.5"/><line x1="1" y1="6" x2="11" y2="6" stroke="currentColor" stroke-width="1.5"/></svg> +Pick';
  }
};

// ═══════════════════════════════════════════════════════
//  PASSIVE — color toggle only
// ═══════════════════════════════════════════════════════
$('btn-passive').addEventListener('click', () => {
  st.passive = !st.passive;
  $('btn-passive').classList.toggle('on-passive', st.passive);
  safeSend({ type: 'setPassive', enabled: st.passive });
});

// ═══════════════════════════════════════════════════════
//  LOCK — blocks page UI interaction via content script
// ═══════════════════════════════════════════════════════
$('btn-lock').addEventListener('click', () => {
  st.locked = !st.locked;
  $('btn-lock').classList.toggle('on-lock', st.locked);
  safeSend({ type: 'setLock', enabled: st.locked });
});

// ═══════════════════════════════════════════════════════
//  TAB BAR
// ═══════════════════════════════════════════════════════
$('btn-unbind').addEventListener('click', () => { safeSend({ type: 'unbindTab' }); });
const updateTabBar = (bound, url) => {
  const bar = $('tab-bar');
  if (bound) {
    bar.style.display = 'flex';
    try {
      const u = new URL(url);
      $('tab-url').textContent = u.hostname + u.pathname.slice(0, 40);
    } catch (_) {
      $('tab-url').textContent = url.slice(0, 50);
    }
  } else {
    bar.style.display = 'none';
  }
};

// ═══════════════════════════════════════════════════════
//  STACK BUTTON
// ═══════════════════════════════════════════════════════
$('btn-stack').addEventListener('click', () => {
  const sec = $('sec-stack');
  sec.open = !sec.open;
  $('btn-stack').classList.toggle('on-stack', sec.open);
  if (sec.open) sec.scrollIntoView({ behavior: 'smooth' });
  saveSectionState();
});

// ═══════════════════════════════════════════════════════
//  INCOMING MESSAGES
// ═══════════════════════════════════════════════════════
const onPortMessage = (msg) => {
  try {
    if (msg.type === 'tabBound') { updateTabBar(true, msg.url); return; }
    if (msg.type === 'tabUnbound') { updateTabBar(false, ''); return; }
    if (msg.type === 'locatorsGenerated') {
      if (st.locked) return;
      if (st.picking) { st.picking = false; updatePickBtn(); }
      st.payload = msg.payload;
      renderAll(msg.payload);
      showView('v-results');
      $('btn-lock').disabled = false;
      $('sec-reference').open = true;
      $('sec-locators').open = true;
      saveSectionState();
      return;
    }
    if (msg.type === 'pickingCancelled') {
      st.picking = false;
      updatePickBtn();
      showView(st.payload ? 'v-results' : 'v-idle');
      return;
    }
    if (msg.type === 'validateResult') { renderValidation(msg); return; }
    if (msg.type === 'error') {
      $('err-msg').textContent = msg.message;
      showView('v-error');
      st.picking = false;
      updatePickBtn();
      return;
    }
  } catch (e) {
    console.error('[LL panel] message handler error:', e);
  }
};

// ═══════════════════════════════════════════════════════
//  RENDER
// ═══════════════════════════════════════════════════════
const renderAll = (data) => {
  renderReference(data);
  renderProperties(data);
  renderLocators(data);
  updateStackUI();
};

// ═══════════════════════════════════════════════════════
//  XPATH QUALITY RANKING — penalize index-only, prefer dynamic
// ═══════════════════════════════════════════════════════
const isIndexOnlyXp = (xpath) => {
  const cleaned = xpath.replace(/^\/+/,'');
  const segs = cleaned.split('/').filter(Boolean);
  return segs.every((s) => /^[a-z][a-z0-9]*(\[\d+\])?$/i.test(s));
};

const countIdx = (xpath) => {
  const m = xpath.match(/\[\d+\]/g);
  return m ? m.length : 0;
};

const dynamicQ = (loc) => {
  const s = loc.selector;
  let q = loc.score;
  const ic = countIdx(s);
  
  if (s.startsWith('/html') || isIndexOnlyXp(s)) { q -= 60; return q; }
  if (ic >= 4) q -= 50; else if (ic === 3) q -= 30; else if (ic === 2) q -= 15; else if (ic === 1) q -= 5;
  
  if (/contains\s*\(/.test(s)) q += 8;
  if (/normalize-space\s*\(/.test(s)) q += 8;
  if (/starts-with\s*\(/.test(s)) q += 5;
  if (/text\s*\(\s*\)/.test(s)) q += 3;
  if (/following-sibling::/.test(s)) q += 6;
  if (/preceding-sibling::/.test(s)) q += 4;
  if (/@(data-testid|data-cy|data-test|aria-label|name|placeholder|alt|title)/.test(s)) q += 10;
  if (/@id\b/.test(s) && !/@id\b.*\d{4}/.test(s)) q += 8;
  if (/@role/.test(s)) q += 5;
  
  return q;
};

const getRecommendedXPath = (data) => {
  const candidates = data.locators.filter((l) => 
    l.selectorType === 'xpath' && l.matchCount === 1 && l.category !== 'absolute' && l.category !== 'position' && !l.selector.startsWith('/html') && !isIndexOnlyXp(l.selector)
  );
  candidates.sort((a, b) => dynamicQ(b) - dynamicQ(a));
  
  // If top is still index-heavy, find a better one
  if (candidates.length > 1 && countIdx(candidates[0].selector) >= 3) {
    const better = candidates.find((c) => countIdx(c.selector) < 2 && dynamicQ(c) > 30);
    if (better) return better;
  }
  return candidates[0] || null;
};

const getRecommendedCSS = (data) => {
  const candidates = data.locators.filter((l) => l.selectorType === 'css' && l.matchCount === 1);
  candidates.sort((a, b) => {
    const aq = a.score - (a.selector.match(/nth-child/g) || []).length * 10;
    const bq = b.score - (b.selector.match(/nth-child/g) || []).length * 10;
    return bq - aq;
  });
  return candidates[0] || null;
};

// ═══════════════════════════════════════════════════════
//  REFERENCE
// ═══════════════════════════════════════════════════════
const renderReference = (data) => {
  const g = $('ref-grid');
  g.innerHTML = '';
  const recXp = getRecommendedXPath(data);
  const recCss = getRecommendedCSS(data);
  const idLoc = data.locators.find((l) => l.category === 'id' && l.label === 'id');
  const nameLoc = data.locators.find((l) => l.label === 'name');
  const ariaLoc = data.locators.find((l) => l.label === 'aria-label');
  const linkLoc = data.locators.find((l) => l.label === 'link-text');
  
  const rows = [
    ['XPath', recXp ? recXp.selector : '', recXp ? recXp.matchCount : 0, true],
    ['CSS', recCss ? recCss.selector : '', recCss ? recCss.matchCount : 0, false],
    ['ID', data.id || '', idLoc ? idLoc.matchCount : 0, false],
    ['Class', (data.stableClasses || []).slice(0, 3).join(' '), data.stableClasses ? data.stableClasses.length : 0, false],
    ['Tag', data.tag, data.tagCount || 0, false],
    ['Name', data.name || '', nameLoc ? nameLoc.matchCount : 0, false],
    ['aria-label', data.ariaLabel || '', ariaLoc ? ariaLoc.matchCount : 0, false],
    ['Link Text', data.linkText || '', linkLoc ? linkLoc.matchCount : 0, false]
  ];
  
  rows.forEach((r) => {
    const k = document.createElement('span');
    k.className = 'ref-key';
    k.textContent = r[0];
    const v = document.createElement('span');
    v.className = `ref-val${r[3] && r[1] ? ' ref-recommended' : ''}`;
    v.textContent = r[1] || '--';
    v.title = r[1] || '';
    if (r[1]) v.addEventListener('click', () => copyText(r[1], v));
    const c = document.createElement('span');
    c.className = `ref-count ${r[2] === 1 ? 'cnt-1' : (r[2] > 1 ? 'cnt-n' : 'cnt-0')}`;
    c.textContent = r[2];
    g.appendChild(k);
    g.appendChild(v);
    g.appendChild(c);
  });
};

// ═══════════════════════════════════════════════════════
//  PROPERTIES — with color modal
// ═══════════════════════════════════════════════════════
const openColorModal = (color) => {
  $('color-modal').style.display = 'flex';
  $('color-modal-swatch').style.background = color;
  $('color-modal-value').textContent = color;
};

$('color-modal-close').addEventListener('click', () => { $('color-modal').style.display = 'none'; });
document.querySelector('.color-modal-backdrop').addEventListener('click', () => { $('color-modal').style.display = 'none'; });
$('color-modal-copy').addEventListener('click', function() { copyText($('color-modal-value').textContent, this); });

const renderProperties = (data) => {
  const body = $('props-body');
  body.innerHTML = '';
  const idRow = document.createElement('div');
  idRow.className = 'prop-identity';
  idRow.innerHTML = `<span class="prop-badge prop-badge-tag">&lt;${esc(data.tag)}&gt;</span>`;
  
  if (data.id) {
    const stable = data.locators.some((l) => l.category === 'id' && l.label === 'id');
    idRow.innerHTML += `<span class="prop-badge ${stable ? 'prop-badge-green' : 'prop-badge-amber'}">id: ${esc(data.id.slice(0, 25))}</span>`;
  }
  if (data.role) idRow.innerHTML += `<span class="prop-badge prop-badge-violet">role: ${esc(data.role)}</span>`;
  if (data.attributes.type) idRow.innerHTML += `<span class="prop-badge prop-badge-cyan">type: ${esc(data.attributes.type)}</span>`;
  
  ['data-testid', 'data-test-id', 'data-cy', 'data-test', 'data-qa'].forEach((ta) => {
    if (data.attributes[ta]) idRow.innerHTML += `<span class="prop-badge prop-badge-green">${ta}</span>`;
  });
  body.appendChild(idRow);
  
  const skip = new Set(['class', 'style']);
  const pri = new Set(['id', 'name', 'aria-label', 'data-testid', 'placeholder', 'href', 'value', 'role', 'type', 'for', 'alt', 'title', 'src', 'action', 'method']);
  
  for (const k in data.attributes) {
    if (skip.has(k) || data.attributes[k].length > 200) continue;
    const row = document.createElement('div');
    row.className = 'prop-row';
    row.innerHTML = `<span class="prop-key">${esc(k)}</span><span class="prop-val ${pri.has(k) ? 'prop-val-pri' : ''}" title="Click to copy">${esc(data.attributes[k])}</span>`;
    const val = data.attributes[k];
    row.querySelector('.prop-val').addEventListener('click', function() { copyText(val, this); });
    body.appendChild(row);
  }
  
  if (data.classes && data.classes.length > 0) {
    const chips = document.createElement('div');
    chips.className = 'class-chips';
    (data.stableClasses || []).forEach((cls) => {
      const c = document.createElement('span');
      c.className = 'chip chip-stable';
      c.textContent = `.${cls}`;
      c.addEventListener('click', () => copyText(`.${cls}`, c));
      chips.appendChild(c);
    });
    (data.dynamicClasses || []).forEach((cls) => {
      const c = document.createElement('span');
      c.className = 'chip chip-dynamic';
      c.textContent = `.${cls}`;
      chips.appendChild(c);
    });
    body.appendChild(chips);
  }
  
  if (data.computed || data.rect) {
    const sub = document.createElement('div');
    sub.className = 'prop-sub';
    let h = '';
    if (data.computed) {
      h += '<div class="prop-section-label">Layout</div>';
      h += `<div class="prop-row"><span class="prop-key">display</span><span class="prop-val">${esc(data.computed.display)}</span></div>`;
      h += `<div class="prop-row"><span class="prop-key">visibility</span><span class="prop-val">${esc(data.computed.visibility)}</span></div>`;
      h += `<div class="prop-row"><span class="prop-key">opacity</span><span class="prop-val">${esc(data.computed.opacity || '1')}</span></div>`;
      h += '<div class="prop-section-label">Interaction</div>';
      h += `<div class="prop-row"><span class="prop-key">cursor</span><span class="prop-val">${esc(data.computed.cursor)}</span></div>`;
      if (data.computed.disabled) h += '<div class="prop-row"><span class="prop-key">disabled</span><span class="prop-val prop-val-pri">true</span></div>';
      h += '<div class="prop-section-label">Typography</div>';
      h += `<div class="prop-row"><span class="prop-key">font</span><span class="prop-val">${esc(data.computed.fontSize)} / ${esc(data.computed.fontWeight)}</span></div>`;
      if (data.computed.color) h += `<div class="prop-row"><span class="prop-key">color</span><span class="prop-val"><span class="color-swatch" data-color="${esc(data.computed.color)}" style="background:${esc(data.computed.color)}"></span>${esc(data.computed.color)}</span></div>`;
      if (data.computed.backgroundColor && data.computed.backgroundColor !== 'rgba(0, 0, 0, 0)') h += `<div class="prop-row"><span class="prop-key">bg-color</span><span class="prop-val"><span class="color-swatch" data-color="${esc(data.computed.backgroundColor)}" style="background:${esc(data.computed.backgroundColor)}"></span>${esc(data.computed.backgroundColor)}</span></div>`;
    }
    if (data.rect) {
      h += '<div class="prop-section-label">Coordinates</div>';
      h += `<div class="prop-row"><span class="prop-key">size</span><span class="prop-val">${data.rect.w} x ${data.rect.h} px</span></div>`;
      h += `<div class="prop-row"><span class="prop-key">position</span><span class="prop-val">(${data.rect.x}, ${data.rect.y})</span></div>`;
      if (data.rect.cx !== undefined) h += `<div class="prop-row"><span class="prop-key">center</span><span class="prop-val">(${data.rect.cx}, ${data.rect.cy})</span></div>`;
    }
    h += '<div class="prop-section-label">DOM</div>';
    h += `<div class="prop-row"><span class="prop-key">children</span><span class="prop-val">${data.childCount}</span></div>`;
    if (data.textPreview) h += `<div class="prop-row"><span class="prop-key">text</span><span class="prop-val">${esc(data.textPreview.slice(0, 200))}</span></div>`;
    if (data.shadowRoot) h += '<div class="prop-row"><span class="prop-key">shadow DOM</span><span class="prop-val prop-val-pri">yes</span></div>';
    sub.innerHTML = h;
    sub.querySelectorAll('.color-swatch').forEach((sw) => {
      sw.addEventListener('click', (e) => {
        e.stopPropagation();
        openColorModal(sw.dataset.color);
      });
    });
    body.appendChild(sub);
  }
};

// ═══════════════════════════════════════════════════════
//  LOCATORS
// ═══════════════════════════════════════════════════════
const renderLocators = (data) => {
  const locs = data.locators;
  const tiers = { stable: 0, moderate: 0, fragile: 0 };
  locs.forEach((l) => { tiers[l.tier]++; });
  
  $('tier-pills').innerHTML = `<span class="tier-pill tp-stable">${tiers.stable}</span><span class="tier-pill tp-moderate">${tiers.moderate}</span><span class="tier-pill tp-fragile">${tiers.fragile}</span>`;
  
  const best = getRecommendedXPath(data) || getRecommendedCSS(data) || locs.find((l) => l.matchCount === 1 && l.category !== 'absolute' && l.category !== 'position' && !isIndexOnlyXp(l.selector));
  const bestEl = $('best-card');
  
  if (best) {
    const locMeta = buildLocMeta(data, best);
    bestEl.style.display = '';
    bestEl.innerHTML = `
      <div class="best-header"><span class="best-badge">&#10003;</span><span class="best-label">${esc(best.label)} | ${best.score}% | unique</span></div>
      <div class="best-sel">${esc(best.selector)}</div>
      <div class="best-actions">
        <button class="sm-btn" data-act="copy-raw">Copy</button>
        <button class="sm-btn" data-act="flash">Flash</button>
        <button class="sm-btn" data-act="highlight">Highlight</button>
        <button class="sm-btn" data-act="copy-for">Copy for...</button>
      </div>
      <div class="fw-grid" style="display:none"></div>
    `;
    bestEl.querySelector('[data-act="copy-raw"]').onclick = function() { copyText(best.selector, this); };
    bestEl.querySelector('[data-act="flash"]').onclick = function() { toggleFlash('flash', best, this); };
    bestEl.querySelector('[data-act="highlight"]').onclick = function() { toggleFlash('highlight', best, this); };
    bestEl.querySelector('[data-act="copy-for"]').addEventListener('click', () => {
      const g = bestEl.querySelector('.fw-grid');
      g.style.display = g.style.display === 'none' ? 'flex' : 'none';
    });
    buildFwGrid(bestEl.querySelector('.fw-grid'), best, locMeta);
  } else {
    bestEl.style.display = 'none';
  }
  
  ['stable', 'moderate', 'fragile'].forEach((tier) => {
    const container = $(`tier-${tier}`);
    const hd = $(`tier-${tier}-hd`);
    container.innerHTML = '';
    const tl = locs.filter((l) => l.tier === tier);
    if (!tl.length) { hd.style.display = 'none'; return; }
    hd.style.display = '';
    hd.textContent = tier.charAt(0).toUpperCase() + tier.slice(1) + ' (' + tl.length + ')';
    tl.forEach((loc) => { container.appendChild(buildLocCard(data, loc, best && loc.selector === best.selector)); });
  });
};

const buildLocMeta = (d, l) => ({
  _attrs: d.attributes,
  _tag: d.tag,
  _text: d.textContent,
  _role: d.role,
  _stableId: d.id && d.locators.some((x) => x.category === 'id' && x.label === 'id')
});

const scoreGrade = (s) => s >= 80 ? 's-a' : s >= 65 ? 's-b' : s >= 45 ? 's-c' : s >= 30 ? 's-d' : 's-f';
const catDot = (c) => {
  const m = { test: 'dot-test', aria: 'dot-aria', id: 'dot-id', attr: 'dot-attr', 'class': 'dot-class', text: 'dot-text', hierarchy: 'dot-hierarchy', logical: 'dot-logical', css: 'dot-css', xpath: 'dot-xpath', position: 'dot-position', absolute: 'dot-absolute' };
  return m[c] || 'dot-xpath';
};

const buildLocCard = (data, loc, isBest) => {
  const card = document.createElement('div');
  card.className = 'loc-card';
  if (loc.matchCount === 0) card.dataset.zero = 'true';
  const meta = buildLocMeta(data, loc);
  const head = document.createElement('div');
  head.className = 'loc-head';
  
  let hh = `<span class="loc-dot ${catDot(loc.category)}"></span><span class="loc-info">${esc(loc.category)} ${esc(loc.label)}</span>`;
  if (isBest) hh += '<span class="loc-best-pill">Recommended</span>';
  hh += `<span class="loc-score ${scoreGrade(loc.score)}">${loc.score}</span>`;
  const mc = loc.matchCount === 1 ? 'm-unique' : (loc.matchCount > 1 ? 'm-multi' : 'm-zero');
  hh += `<span class="loc-match ${mc}">${loc.matchCount === 1 ? '1' : loc.matchCount}</span>`;
  
  if (loc.matchCount > 1) hh += '<span class="loc-nav"><button class="loc-nav-btn" data-dir="prev">&#8249;</button><button class="loc-nav-btn" data-dir="next">&#8250;</button></span>';
  head.innerHTML = hh;
  
  let navIdx = 0;
  head.querySelectorAll('.loc-nav-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      navIdx += btn.dataset.dir === 'next' ? 1 : -1;
      navIdx = Math.max(0, Math.min(navIdx, loc.matchCount - 1));
      safeSend({ type: 'navigateMatch', selector: loc.selector, selectorType: loc.selectorType, index: navIdx });
    });
  });
  head.addEventListener('click', () => { card.classList.toggle('open'); });
  
  const cbody = document.createElement('div');
  cbody.className = 'loc-cbody';
  let bh = `<div class="loc-sel">${esc(loc.selector)}</div>`;
  if (loc.warning) bh += `<div class="loc-warning">${esc(loc.warning)}</div>`;
  bh += '<div class="loc-actions"><button class="sm-btn" data-act="copy-raw">Copy</button><button class="sm-btn" data-act="flash">Flash</button><button class="sm-btn" data-act="highlight">Highlight</button><button class="sm-btn" data-act="copy-for">Copy for...</button></div><div class="fw-grid" style="display:none"></div>';
  cbody.innerHTML = bh;
  
  cbody.querySelector('[data-act="copy-raw"]').addEventListener('click', function() { copyText(loc.selector, this); });
  cbody.querySelector('[data-act="flash"]').addEventListener('click', function() { toggleFlash('flash', loc, this); });
  cbody.querySelector('[data-act="highlight"]').addEventListener('click', function() { toggleFlash('highlight', loc, this); });
  cbody.querySelector('[data-act="copy-for"]').addEventListener('click', () => {
    const g = cbody.querySelector('.fw-grid');
    g.style.display = g.style.display === 'none' ? 'flex' : 'none';
  });
  buildFwGrid(cbody.querySelector('.fw-grid'), loc, meta);
  card.appendChild(head);
  card.appendChild(cbody);
  return card;
};

const buildFwGrid = (container, loc, meta) => {
  FW_LIST.forEach((fw) => {
    const btn = document.createElement('button');
    btn.className = 'sm-btn';
    btn.textContent = fw.label;
    btn.addEventListener('click', function() {
      copyText(fmtForFramework(fw.key, loc.selector, loc.selectorType, meta), this);
    });
    container.appendChild(btn);
  });
};

// ═══════════════════════════════════════════════════════
//  FLASH / HIGHLIGHT TOGGLE
// ═══════════════════════════════════════════════════════
const toggleFlash = (mode, loc, btn) => {
  const key = `${mode}:${loc.selector}`;
  if (st.activeFlash === key) {
    safeSend({ type: 'clearFlash' });
    st.activeFlash = null;
    btn.classList.remove('active', 'hl-active', 'flash-active');
  } else {
    document.querySelectorAll('.sm-btn.active,.sm-btn.hl-active,.sm-btn.flash-active').forEach((b) => {
      b.classList.remove('active', 'hl-active', 'flash-active');
    });
    safeSend({ type: mode === 'flash' ? 'flashLocator' : 'highlightLocator', selector: loc.selector, selectorType: loc.selectorType });
    st.activeFlash = key;
    btn.classList.add(mode === 'highlight' ? 'hl-active' : 'flash-active');
  }
};

// ═══════════════════════════════════════════════════════
//  STACK
// ═══════════════════════════════════════════════════════
$('btn-add-stack').addEventListener('click', () => {
  if (!st.payload) return;
  const best = st.payload.locators.find((l) => l.matchCount === 1 && l.category !== 'absolute' && l.category !== 'position' && !isIndexOnlyXp(l.selector)) || st.payload.locators[0];
  if (!best || st.stack.some((s) => s.selector === best.selector)) return;
  st.stack.push({ tag: st.payload.tag, text: st.payload.textContent || '', selector: best.selector, selectorType: best.selectorType, id: st.payload.id, ariaLabel: st.payload.ariaLabel, role: st.payload.role, attrs: st.payload.attributes });
  updateStackUI();
});

$('btn-clear-stack').addEventListener('click', () => { st.stack = []; updateStackUI(); $('pom-picker').style.display = 'none'; });
$('btn-export-pom').addEventListener('click', () => {
  const p = $('pom-picker');
  p.style.display = p.style.display === 'none' ? 'flex' : 'none';
});

const updateStackUI = () => {
  $('stack-count').textContent = st.stack.length;
  const list = $('stack-list');
  list.innerHTML = '';
  st.stack.forEach((item, i) => {
    const row = document.createElement('div');
    row.className = 'stack-row';
    row.innerHTML = `<span class="stack-idx">${i + 1}</span><span class="stack-info">&lt;${esc(item.tag)}&gt; ${esc(item.selector.slice(0, 60))}</span>`;
    
    const hlBtn = document.createElement('button');
    hlBtn.className = 'sm-btn';
    hlBtn.textContent = 'Highlight';
    hlBtn._hlActive = false;
    hlBtn.addEventListener('click', () => {
      if (hlBtn._hlActive) {
        safeSend({ type: 'clearFlash' });
        hlBtn._hlActive = false;
        hlBtn.classList.remove('hl-active');
        hlBtn.textContent = 'Highlight';
      } else {
        list.querySelectorAll('.sm-btn.hl-active').forEach((b) => {
          b._hlActive = false;
          b.classList.remove('hl-active');
          b.textContent = 'Highlight';
        });
        safeSend({ type: 'highlightLocator', selector: item.selector, selectorType: item.selectorType });
        hlBtn._hlActive = true;
        hlBtn.classList.add('hl-active');
        hlBtn.textContent = 'Stop';
      }
    });
    
    const rmBtn = document.createElement('button');
    rmBtn.className = 'sm-btn';
    rmBtn.textContent = 'x';
    rmBtn.addEventListener('click', () => { st.stack.splice(i, 1); updateStackUI(); });
    row.appendChild(hlBtn);
    row.appendChild(rmBtn);
    list.appendChild(row);
  });
};

document.querySelectorAll('.pom-btn').forEach((btn) => {
  btn.addEventListener('click', function() {
    if (!st.stack.length) return;
    copyText(generatePOM(st.stack, this.dataset.fw), this);
  });
});

const fieldName = (item) => {
  let raw = item.text || item.id || item.ariaLabel || item.role || item.tag;
  raw = raw.replace(/[^a-zA-Z0-9\s]/g, '').trim().slice(0, 40);
  if (!raw) raw = item.tag;
  const words = raw.split(/\s+/).filter(Boolean);
  return words.map((w, i) => i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('');
};

const generatePOM = (stack, fw) => {
  const items = stack.map((s) => ({ name: fieldName(s), sel: s.selector, tp: s.selectorType, item: s }));
  switch (fw) {
    case 'playwright': {
      let o = "import { type Locator, type Page } from '@playwright/test';\n\nexport class PageModel {\n  readonly page: Page;\n";
      items.forEach((i) => { o += `  readonly ${i.name}: Locator;\n`; });
      o += '\n  constructor(page: Page) {\n    this.page = page;\n';
      items.forEach((i) => {
        const m = { _attrs: i.item.attrs, _tag: i.item.tag, _text: i.item.text, _role: i.item.role, _stableId: true };
        o += `    this.${i.name} = ${fmtForFramework('playwright', i.sel, i.tp, m)};\n`;
      });
      return o + '  }\n}\n';
    }
    case 'selenium': {
      let o = "import org.openqa.selenium.WebElement;\nimport org.openqa.selenium.support.FindBy;\nimport org.openqa.selenium.support.PageFactory;\n\npublic class PageModel {\n";
      items.forEach((i) => {
        const ann = i.tp === 'xpath' ? `@FindBy(xpath = "${i.sel}")` : `@FindBy(css = "${i.sel}")`;
        o += `  ${ann}\n  private WebElement ${i.name};\n\n`;
      });
      return o + "  public PageModel(WebDriver driver) { PageFactory.initElements(driver, this); }\n}\n";
    }
    case 'cypress': {
      let o = 'const selectors = {\n';
      items.forEach((i, idx) => { o += `  ${i.name}: '${i.sel}'${idx < items.length - 1 ? ',' : ''}\n`; });
      return o + '};\nexport default selectors;\n';
    }
    case 'raw': default: {
      const obj = {};
      items.forEach((i) => { obj[i.name] = i.sel; });
      return JSON.stringify(obj, null, 2);
    }
  }
};

// ═══════════════════════════════════════════════════════
//  LIVE VALIDATOR
// ═══════════════════════════════════════════════════════
const detectLocType = (s) => {
  if (!s) return null;
  const t = s.trim();
  if (t.startsWith('/') || t.startsWith('(//') || t.startsWith('//')) return 'xpath';
  if (/^\.\.?\//.test(t)) return 'xpath';
  if (/contains\s*\(|normalize-space|starts-with|text\s*\(\)|following-sibling|preceding-sibling|parent::|child::|descendant::|ancestor::|\[@/.test(t)) return 'xpath';
  return 'css';
};

const updateTypeBadge = (t) => {
  const b = $('val-type-badge');
  b.textContent = t ? t.toUpperCase() : '--';
  b.className = `val-type-badge${t === 'css' ? ' vt-css' : (t === 'xpath' ? ' vt-xpath' : '')}`;
};

let valDb = null;
let valHl = false;
let valFl = false;

const doVal = () => {
  const sel = $('val-input').value.trim();
  if (!sel) {
    $('val-result').innerHTML = '';
    $('val-preview').innerHTML = '';
    updateTypeBadge(null);
    return;
  }
  const t = detectLocType(sel);
  updateTypeBadge(t);
  safeSend({ type: 'validateSelector', selector: sel, selectorType: t });
};

const resetValBtns = () => {
  $('val-highlight').classList.remove('hl-active');
  $('val-highlight').textContent = 'Highlight';
  $('val-flash').classList.remove('flash-active');
  $('val-flash').textContent = 'Flash';
  valHl = false;
  valFl = false;
};

$('val-input').addEventListener('input', () => {
  clearTimeout(valDb);
  if (valHl || valFl) { safeSend({ type: 'clearFlash' }); resetValBtns(); }
  valDb = setTimeout(doVal, 300);
});

$('val-highlight').addEventListener('click', function() {
  const sel = $('val-input').value.trim();
  if (!sel) return;
  if (valHl) {
    safeSend({ type: 'clearFlash' });
    resetValBtns();
  } else {
    if (valFl) { safeSend({ type: 'clearFlash' }); resetValBtns(); }
    safeSend({ type: 'highlightLocator', selector: sel, selectorType: detectLocType(sel) });
    this.classList.add('hl-active');
    this.textContent = 'Stop';
    valHl = true;
  }
});

$('val-flash').addEventListener('click', function() {
  const sel = $('val-input').value.trim();
  if (!sel) return;
  if (valFl) {
    safeSend({ type: 'clearFlash' });
    resetValBtns();
  } else {
    if (valHl) { safeSend({ type: 'clearFlash' }); resetValBtns(); }
    safeSend({ type: 'flashLocator', selector: sel, selectorType: detectLocType(sel) });
    this.classList.add('flash-active');
    this.textContent = 'Stop';
    valFl = true;
  }
});

const renderValidation = (msg) => {
  const el = $('val-result');
  const prev = $('val-preview');
  if (msg.error) {
    el.className = 'val-result val-fail';
    el.textContent = `Invalid: ${msg.error}`;
    prev.innerHTML = '';
  } else if (msg.count === 0) {
    el.className = 'val-result val-fail';
    el.textContent = '0 elements matched';
    prev.innerHTML = '';
  } else {
    el.className = `val-result ${msg.count === 1 ? 'val-ok' : 'val-warn'}`;
    el.textContent = msg.count === 1 ? '1 match -- unique' : `${msg.count} matches`;
    prev.innerHTML = '';
    if (msg.previews) {
      msg.previews.forEach((p) => {
        const d = document.createElement('div');
        d.className = 'val-preview-item';
        d.textContent = `<${p.tag}> "${p.text.slice(0, 50)}"`;
        prev.appendChild(d);
      });
    }
  }
};
