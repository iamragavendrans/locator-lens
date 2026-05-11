'use strict';
const $ = (id) => document.getElementById(id);

// ═══════════════════════════════════════════════════════
//  STATE & CONSTANTS
// ═══════════════════════════════════════════════════════
const st = { 
  picking: false, 
  passive: false, 
  multi: false, 
  locked: false, 
  payload: null, 
  stack: [], 
  recents: [], 
  activeFlash: null 
};

const THEME_KEY = 'll5_theme';
const viewIds = ['v-idle', 'v-picking', 'v-error', 'v-results'];

// ═══════════════════════════════════════════════════════
//  UTILITIES
// ═══════════════════════════════════════════════════════
const showView = (id) => { 
  viewIds.forEach((v) => { $(v).style.display = 'none'; }); 
  $(id).style.display = ''; 
};

const esc = (s) => { 
  const d = document.createElement('div'); 
  d.textContent = s; 
  return d.innerHTML; 
};

const copyText = (text, btn) => {
  navigator.clipboard.writeText(text).then(() => {
    if (!btn) return;
    const old = btn.innerHTML;
    btn.classList.add('copy-success');
    btn.innerHTML = '<span class="copy-check">✓</span> Copied';
    setTimeout(() => {
      btn.classList.remove('copy-success');
      btn.innerHTML = old;
    }, 1200);
  }).catch(() => {});
};

const detectLocType = (s) => {
  if (!s) return null;
  const t = s.trim();
  if (t.startsWith('/') || t.startsWith('(//') || t.startsWith('//')) return 'xpath';
  if (/^\.\.?\//.test(t)) return 'xpath';
  if (/contains\s*\(|normalize-space|starts-with|text\s*\(\)|following-sibling|preceding-sibling|parent::|child::|descendant::|ancestor::|\[@/.test(t)) return 'xpath';
  return 'css';
};

// ═══════════════════════════════════════════════════════
//  PORT & MESSAGING
// ═══════════════════════════════════════════════════════
let port = null;
let portAlive = false;

const onPortMessage = (msg) => {
  try {
    if (msg.type === 'tabBound') { updateTabBar(true, msg.url); return; }
    if (msg.type === 'tabUnbound') {
      updateTabBar(false, '');
      st.payload = null;
      showView('v-idle');
      $('btn-lock').disabled = true;
      $('btn-lock').classList.remove('on-lock');
      st.locked = false;
      return;
    }
    if (msg.type === 'locatorsGenerated') {
      if (st.multi) {
        const best = msg.payload.locators.find(l => l.matchCount === 1) || msg.payload.locators[0];
        st.stack.push({ 
          tag: msg.payload.tag, 
          text: msg.payload.textContent || '', 
          selector: best.selector, 
          selectorType: best.selectorType, 
          id: msg.payload.id, 
          ariaLabel: msg.payload.ariaLabel, 
          role: msg.payload.role, 
          attrs: msg.payload.attributes 
        });
        updateStackUI();
        return;
      }
      if (st.picking) { st.picking = false; updatePickBtn(); }
      st.payload = msg.payload;
      const entry = { tag: msg.payload.tag, text: (msg.payload.textContent || '').slice(0, 30), payload: msg.payload, timestamp: Date.now() };
      st.recents = [entry, ...st.recents.filter(r => r.payload.id !== msg.payload.id || !r.payload.id)].slice(0, 8);
      renderAll(msg.payload);
      showView('v-results');
      $('btn-lock').disabled = false;
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
  } catch (e) { console.error('[LL panel] message handler error:', e); }
};

const connectPort = () => {
  try {
    port = chrome.runtime.connect({ name: 'locatorlens' });
    portAlive = true;
    port.onDisconnect.addListener(() => {
      portAlive = false;
      port = null;
      setTimeout(connectPort, 500);
    });
    port.onMessage.addListener(onPortMessage);
    safeSend({ type: 'getTabState' });
  } catch (e) {
    portAlive = false;
    setTimeout(connectPort, 1000);
  }
};

const safeSend = (msg) => {
  if (!portAlive || !port) {
    connectPort();
    setTimeout(() => { try { if (port) port.postMessage(msg); } catch(_){} }, 600);
    return;
  }
  try { port.postMessage(msg); }
  catch (e) { portAlive = false; connectPort(); }
};

// ═══════════════════════════════════════════════════════
//  LOCATOR RANKING & TEMPLATES
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
  let q = loc.score || 0;
  const s = loc.selector;
  const ic = (s.match(/\[\d+\]/g) || []).length + (s.match(/:nth-child/g) || []).length;
  
  if (s.startsWith('/html') || isIndexOnlyXp(s)) q -= 70;
  if (ic >= 3) q -= 50; else if (ic === 2) q -= 30; else if (ic === 1) q -= 15;
  
  if (loc.category === 'test' || s.includes('data-testid')) q += 20;
  if (loc.category === 'text' || loc.label.includes('text')) q += 15;
  if (s.includes('aria-label') || s.includes('name=')) q += 8;
  
  return q;
};

const getBestLocator = (locs) => {
  if (!locs || !locs.length) return null;
  const candidates = locs.filter(l => l.matchCount === 1);
  if (!candidates.length) return locs[0];
  const sorted = [...candidates].sort((a, b) => dynamicQ(b) - dynamicQ(a));
  return sorted[0];
};

const getRecommendedXPath = (data) => {
  const candidates = data.locators.filter((l) => 
    l.selectorType === 'xpath' && l.matchCount === 1 && l.category !== 'absolute' && l.category !== 'position' && !l.selector.startsWith('/html') && !isIndexOnlyXp(l.selector)
  );
  candidates.sort((a, b) => dynamicQ(b) - dynamicQ(a));
  return candidates[0] || null;
};

const getRecommendedCSS = (data) => {
  const candidates = data.locators.filter((l) => l.selectorType === 'css' && l.matchCount === 1);
  candidates.sort((a, b) => dynamicQ(b) - dynamicQ(a));
  return candidates[0] || null;
};

const fmtForFramework = (fw, sel, tp, loc) => {
  const v = sel.replace(/'/g, "\\'"), d = sel.replace(/"/g, '\\"');
  switch(fw) {
    case 'playwright': {
      if(loc){const a=loc._attrs||{};if(a['data-testid'])return"page.getByTestId('"+a['data-testid']+"')";if(a['aria-label'])return"page.getByLabel('"+a['aria-label']+"')";if(a.placeholder)return"page.getByPlaceholder('"+a.placeholder+"')";if(a.alt)return"page.getByAltText('"+a.alt+"')";if(a.title)return"page.getByTitle('"+a.title+"')";if(loc._role&&loc._text)return"page.getByRole('"+loc._role+"',{name:'"+loc._text.slice(0,50)+"'})";if(loc._text&&loc._text.length<=60)return"page.getByText('"+loc._text.slice(0,60)+"')";}
      return tp==='xpath'?"page.locator('xpath="+v+"')":"page.locator('"+v+"')";
    }
    case 'selenium': {if(loc&&loc._attrs){if(loc._attrs.id&&loc._stableId)return'driver.findElement(By.id("'+loc._attrs.id+'"))';if(loc._attrs.name)return'driver.findElement(By.name("'+loc._attrs.name+'"))';} return tp==='xpath'?'driver.findElement(By.xpath("'+d+'"))':'driver.findElement(By.cssSelector("'+d+'"))';}
    case 'cypress': {if(loc&&loc._attrs){if(loc._attrs['data-testid'])return"cy.get('[data-testid=\""+loc._attrs['data-testid']+"\"]')";} if(tp==='xpath')return"cy.xpath('"+v+"')"; return"cy.get('"+v+"')";}
    case 'wdio': return"$('"+v+"')";
    case 'puppeteer': return tp==='xpath'?"page.$x('"+v+"')":"page.$('"+v+"')";
    case 'robot': return tp==='xpath'?'xpath:'+sel:'css:'+sel;
    case 'raw': default: return sel;
  }
};
const FW_LIST=[{key:'playwright',label:'Playwright TS'},{key:'selenium',label:'Selenium Java'},{key:'cypress',label:'Cypress JS'},{key:'wdio',label:'WebdriverIO'},{key:'puppeteer',label:'Puppeteer'},{key:'raw',label:'Raw'}];

// ═══════════════════════════════════════════════════════
//  RENDERING FUNCTIONS
// ═══════════════════════════════════════════════════════
const renderAll = (data) => {
  renderReference(data);
  renderProperties(data);
  renderLocators(data);
  renderRecents();
  renderBreadcrumbs(data.path);
  updateStackUI();
};

const renderBreadcrumbs = (path) => {
  const container = $('breadcrumbs');
  container.innerHTML = '';
  if (!path || !path.length) return;
  path.forEach((p, i) => {
    const crumb = document.createElement('span');
    crumb.className = 'crumb' + (i === path.length - 1 ? ' crumb-active' : '');
    crumb.textContent = p.tag + (p.id ? `#${p.id}` : '');
    container.appendChild(crumb);
  });
  container.scrollLeft = container.scrollWidth;
};

const renderRecents = () => {
  const list = $('recents-list');
  list.innerHTML = '';
  if (!st.recents.length) { list.innerHTML = '<div class="v-sub" style="padding:10px">No recent items</div>'; return; }
  st.recents.forEach((r) => {
    const d = document.createElement('div');
    d.className = 'recent-item';
    d.innerHTML = `<span class="recent-tag">&lt;${esc(r.tag)}&gt;</span><span class="recent-text">${esc(r.text)}</span>`;
    d.addEventListener('click', () => { st.payload = r.payload; renderAll(r.payload); });
    list.appendChild(d);
  });
};

const renderReference = (data) => {
  const g = $('ref-grid');
  g.innerHTML = '';
  const recXp = getRecommendedXPath(data);
  const recCss = getRecommendedCSS(data);
  const rows = [
    ['XPath', recXp ? recXp.selector : '', recXp ? recXp.matchCount : 0, true],
    ['CSS', recCss ? recCss.selector : '', recCss ? recCss.matchCount : 0, false],
    ['Tag', data.tag, data.tagCount || 0, false],
    ['ID', data.id || '', data.id ? 1 : 0, false]
  ];
  rows.forEach((r) => {
    const k = document.createElement('span'); k.className = 'ref-key'; k.textContent = r[0];
    const v = document.createElement('span'); v.className = `ref-val${r[3] && r[1] ? ' ref-recommended' : ''}`; v.textContent = r[1] || '--'; v.title = r[1] || '';
    if (r[1]) v.addEventListener('click', () => copyText(r[1], v));
    const c = document.createElement('span'); c.className = `ref-count ${r[2] === 1 ? 'cnt-1' : (r[2] > 1 ? 'cnt-n' : 'cnt-0')}`; c.textContent = r[2];
    g.appendChild(k); g.appendChild(v); g.appendChild(c);
  });
};

const renderProperties = (data) => {
  const body = $('props-body');
  body.innerHTML = '';
  const idRow = document.createElement('div');
  idRow.className = 'prop-identity';
  idRow.innerHTML = `<span class="prop-badge prop-badge-tag">&lt;${esc(data.tag)}&gt;</span>`;
  if (data.id) idRow.innerHTML += `<span class="prop-badge prop-badge-amber">id: ${esc(data.id.slice(0, 25))}</span>`;
  if (data.role) idRow.innerHTML += `<span class="prop-badge prop-badge-violet">role: ${esc(data.role)}</span>`;
  body.appendChild(idRow);
  for (const k in data.attributes) {
    if (['class', 'style'].includes(k) || data.attributes[k].length > 200) continue;
    const row = document.createElement('div'); row.className = 'prop-row';
    row.innerHTML = `<span class="prop-key">${esc(k)}</span><span class="prop-val" title="Click to copy">${esc(data.attributes[k])}</span>`;
    const val = data.attributes[k];
    row.querySelector('.prop-val').addEventListener('click', function() { copyText(val, this); });
    body.appendChild(row);
  }
};

const scoreGrade = (s) => (s >= 85 ? { cls: 's-a' } : (s >= 70 ? { cls: 's-b' } : (s >= 50 ? { cls: 's-c' } : { cls: '' })));
const catDot = (c) => ({ test: 'dot-test', aria: 'dot-aria', id: 'dot-id', text: 'dot-text', css: 'dot-css', xpath: 'dot-xpath' }[c] || 'dot-xpath');

const renderLocators = (data) => {
  const locs = data.locators || [];
  const best = getBestLocator(locs);
  
  // Re-sort the whole list by our improved dynamicQ score
  const tl = [...locs].sort((a, b) => dynamicQ(b) - dynamicQ(a));
  
  const bestEl = $('best-card');
  if (best) {
    bestEl.style.display = '';
    bestEl.innerHTML = `
      <div class="best-header">
        <div class="best-badge">${esc(best.selectorType.toUpperCase())}</div>
        <div class="best-label"><strong>${esc(best.category.toUpperCase())}</strong>: ${esc(best.label)}</div>
        <div class="loc-score s-${best.score >= 80 ? 'a' : (best.score >= 60 ? 'c' : 'f')}">${best.score}%</div>
      </div>
      <div class="best-sel">${esc(best.selector)}</div>
      <div class="best-actions">
        <button class="sm-btn active" data-act="copy">Copy</button>
        <button class="sm-btn" data-act="flash">Flash</button>
        <button class="sm-btn" data-act="highlight">Highlight</button>
      </div>
    `;
    bestEl.querySelector('[data-act="copy"]').onclick = function() { copyText(best.selector, this); };
    bestEl.querySelector('[data-act="flash"]').onclick = function() { toggleFlash('flash', best, this); };
    bestEl.querySelector('[data-act="highlight"]').onclick = function() { toggleFlash('highlight', best, this); };
  } else { bestEl.style.display = 'none'; }
  ['stable', 'moderate', 'fragile'].forEach((tier) => {
    const container = $(`tier-${tier}`); const hd = $(`tier-${tier}-hd`); container.innerHTML = '';
    const tl = locs.filter(l => l.tier === tier);
    if (!tl.length) { hd.style.display = 'none'; return; }
    hd.style.display = ''; hd.textContent = tier.charAt(0).toUpperCase() + tier.slice(1) + ' (' + tl.length + ')';
    tl.forEach(loc => container.appendChild(buildLocCard(data, loc, best && loc.selector === best.selector)));
  });
};

const buildLocCard = (data, loc, isBest) => {
  const card = document.createElement('div'); card.className = 'loc-card';
  if (loc.matchCount === 0) card.dataset.zero = 'true';
  const head = document.createElement('div'); head.className = 'loc-head';
  const gred = scoreGrade(loc.score);
  let hh = `<span class="loc-dot ${catDot(loc.category)}"></span><span class="loc-info">${esc(loc.category)} ${esc(loc.label)}</span>`;
  if (isBest) hh += '<span class="loc-best-pill">Recommended</span>';
  hh += `<span class="loc-score ${gred.cls}">${loc.score}%</span>`;
  hh += `<span class="loc-match ${loc.matchCount === 1 ? 'm-unique' : 'm-multi'}">${loc.matchCount}</span>`;
  head.innerHTML = hh;
  head.addEventListener('click', () => { card.classList.toggle('open'); });
  const cbody = document.createElement('div'); cbody.className = 'loc-cbody';
  cbody.innerHTML = `<div class="loc-sel">${esc(loc.selector)}</div><div class="loc-actions"><button class="sm-btn" data-act="copy">Copy</button><button class="sm-btn" data-act="flash">Flash</button><button class="sm-btn" data-act="highlight">Highlight</button><button class="sm-btn" data-act="copy-for">Copy for...</button></div><div class="fw-grid" style="display:none"></div>`;
  cbody.querySelector('[data-act="copy"]').onclick = function() { copyText(loc.selector, this); };
  cbody.querySelector('[data-act="flash"]').onclick = function() { toggleFlash('flash', loc, this); };
  cbody.querySelector('[data-act="highlight"]').onclick = function() { toggleFlash('highlight', loc, this); };
  cbody.querySelector('[data-act="copy-for"]').onclick = () => { const g = cbody.querySelector('.fw-grid'); g.style.display = g.style.display === 'none' ? 'flex' : 'none'; };
  const fwGrid = cbody.querySelector('.fw-grid');
  FW_LIST.forEach(fw => {
    const b = document.createElement('button'); b.className = 'sm-btn'; b.textContent = fw.label;
    b.onclick = function() { copyText(fmtForFramework(fw.key, loc.selector, loc.selectorType, { _attrs: data.attributes, _tag: data.tag, _text: data.textContent }), this); };
    fwGrid.appendChild(b);
  });
  card.appendChild(head); card.appendChild(cbody);
  return card;
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
    document.querySelectorAll('.sm-btn.active,.sm-btn.hl-active,.sm-btn.flash-active').forEach(b => b.classList.remove('active', 'hl-active', 'flash-active'));
    safeSend({ type: mode === 'flash' ? 'flashLocator' : 'highlightLocator', selector: loc.selector, selectorType: loc.selectorType });
    st.activeFlash = key;
    btn.classList.add(mode === 'highlight' ? 'hl-active' : 'flash-active');
  }
};

// ═══════════════════════════════════════════════════════
//  STACK & POM
// ═══════════════════════════════════════════════════════
const updateStackUI = () => {
  const count = st.stack.length;
  $('stack-count').textContent = count;
  $('stack-count-badge').textContent = count;
  const list = $('stack-list'); list.innerHTML = '';
  st.stack.forEach((item, i) => {
    const row = document.createElement('div'); row.className = 'stack-row';
    row.innerHTML = `<span class="stack-idx">${i + 1}</span><span class="stack-info" title="${esc(item.selector)}">&lt;${esc(item.tag)}&gt; ${esc(item.selector.slice(0, 35))}...</span>`;
    
    const hlBtn = document.createElement('button'); hlBtn.className = 'sm-btn'; hlBtn.textContent = 'Highlight';
    hlBtn.onclick = function() { toggleFlash('highlight', item, this); };
    
    const rmBtn = document.createElement('button'); rmBtn.className = 'sm-btn'; rmBtn.textContent = '×';
    rmBtn.onclick = () => { st.stack.splice(i, 1); updateStackUI(); };
    
    row.appendChild(hlBtn);
    row.appendChild(rmBtn);
    list.appendChild(row);
  });
};

const fieldName = (item) => {
  let raw = item.text || item.id || item.tag;
  raw = raw.replace(/[^a-zA-Z0-9\s]/g, '').trim().slice(0, 30);
  return raw.split(/\s+/).map((w, i) => i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('') || 'element';
};

const generatePOM = (stack, fw) => {
  const items = stack.map(s => ({ name: fieldName(s), sel: s.selector, tp: s.selectorType, item: s }));
  if (fw === 'playwright') {
    let o = "import { type Locator, type Page } from '@playwright/test';\n\nexport class PageModel {\n";
    items.forEach(i => { o += `  readonly ${i.name}: Locator;\n`; });
    o += '\n  constructor(page: Page) {\n';
    items.forEach(i => { o += `    this.${i.name} = ${fmtForFramework('playwright', i.sel, i.tp, { _attrs: i.item.attrs, _tag: i.item.tag, _text: i.item.text })};\n`; });
    return o + '  }\n}\n';
  }
  return JSON.stringify(items.reduce((a, i) => ({ ...a, [i.name]: i.sel }), {}), null, 2);
};

// ═══════════════════════════════════════════════════════
//  VALIDATOR
// ═══════════════════════════════════════════════════════
const renderValidation = (msg) => {
  const el = $('val-result'); const prev = $('val-preview');
  if (msg.error) { el.className = 'val-result val-fail'; el.textContent = `Invalid: ${msg.error}`; prev.innerHTML = ''; }
  else if (msg.count === 0) { el.className = 'val-result val-fail'; el.textContent = '0 matches'; prev.innerHTML = ''; }
  else {
    el.className = `val-result ${msg.count === 1 ? 'val-ok' : 'val-warn'}`;
    el.textContent = msg.count === 1 ? '1 match -- unique' : `${msg.count} matches`;
    prev.innerHTML = (msg.previews || []).map(p => `<div class="val-preview-item">&lt;${p.tag}&gt; "${p.text.slice(0, 40)}"</div>`).join('');
  }
};

// ═══════════════════════════════════════════════════════
//  UI INITIALIZATION
// ═══════════════════════════════════════════════════════
const updateTabBar = (bound, url) => {
  const bar = $('tab-bar');
  if (bound) {
    bar.style.display = 'flex';
    try { const u = new URL(url); $('tab-url').textContent = u.hostname + u.pathname.slice(0, 30); }
    catch (_) { $('tab-url').textContent = url.slice(0, 40); }
  } else { bar.style.display = 'none'; }
};

const updatePickBtn = () => {
  const b = $('btn-pick');
  if (st.picking) { b.classList.add('active'); b.textContent = 'Stop'; }
  else { b.classList.remove('active'); b.innerHTML = '<svg width="11" height="11" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="currentColor" stroke-width="1.5"/><line x1="6" y1="1" x2="6" y2="11" stroke="currentColor" stroke-width="1.5"/><line x1="1" y1="6" x2="11" y2="6" stroke="currentColor" stroke-width="1.5"/></svg> +Pick'; }
};

// Event Listeners
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.tab-btn, .tab-pane').forEach(el => el.classList.remove('active'));
    btn.classList.add('active'); $(btn.dataset.tab).classList.add('active');
  };
});

$('btn-pick').onclick = () => { st.picking = !st.picking; updatePickBtn(); safeSend({ type: st.picking ? 'startPicking' : 'stopPicking' }); if (st.picking) showView('v-picking'); else if (st.payload) showView('v-results'); else showView('v-idle'); };
$('btn-multi').onclick = () => { st.multi = !st.multi; $('btn-multi').classList.toggle('active', st.multi); safeSend({ type: 'setMultiPick', enabled: st.multi }); };
$('btn-passive').onclick = () => { st.passive = !st.passive; $('btn-passive').classList.toggle('on-passive', st.passive); safeSend({ type: 'setPassive', enabled: st.passive }); };
$('btn-lock').onclick = () => { st.locked = !st.locked; $('btn-lock').classList.toggle('on-lock', st.locked); safeSend({ type: 'setLock', enabled: st.locked }); };
$('btn-theme').onclick = () => { const theme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'; document.documentElement.setAttribute('data-theme', theme); localStorage.setItem(THEME_KEY, theme); };
$('btn-unbind').onclick = () => safeSend({ type: 'unbindTab' });
$('btn-add-stack').onclick = () => { if (!st.payload) return; const best = getBestLocator(st.payload.locators); if (!best || st.stack.some(s => s.selector === best.selector)) return; st.stack.push({ tag: st.payload.tag, text: st.payload.textContent, selector: best.selector, selectorType: best.selectorType, attrs: st.payload.attributes }); updateStackUI(); };
$('btn-clear-stack').onclick = () => { st.stack = []; updateStackUI(); $('pom-picker').style.display = 'none'; };
$('btn-export-pom').onclick = () => { const p = $('pom-picker'); p.style.display = p.style.display === 'none' ? 'flex' : 'none'; };
document.querySelectorAll('.pom-btn').forEach(btn => { btn.onclick = function() { if (!st.stack.length) return; copyText(generatePOM(st.stack, this.dataset.fw), this); }; });

let valDb = null;
$('val-input').oninput = () => { clearTimeout(valDb); valDb = setTimeout(() => { const sel = $('val-input').value.trim(); if (!sel) return; safeSend({ type: 'validateSelector', selector: sel, selectorType: detectLocType(sel) }); }, 300); };
$('val-highlight').onclick = function() { const sel = $('val-input').value.trim(); if (sel) safeSend({ type: 'highlightLocator', selector: sel, selectorType: detectLocType(sel) }); };
$('val-flash').onclick = function() { const sel = $('val-input').value.trim(); if (sel) safeSend({ type: 'flashLocator', selector: sel, selectorType: detectLocType(sel) }); };

// Startup
document.documentElement.setAttribute('data-theme', localStorage.getItem(THEME_KEY) || 'dark');
connectPort();
