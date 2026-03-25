// LocatorLens v5 — Content Script (PRD §4–7)
(function () {
  'use strict';
  if (window.__ll5) return;
  window.__ll5 = true;

  // ═══════════════════════════════════════════════════════════════
  //  CONSTANTS
  // ═══════════════════════════════════════════════════════════════
  const OVR_ID = '__ll5ov__';
  const TAG_ID = '__ll5tg__';
  const FLASH_CLS  = '__ll5flash__';
  const DIM_CLS    = '__ll5dim__';
  const HL_CLS     = '__ll5hl__';
  let overlayEl = null, tagEl = null;

  // ═══════════════════════════════════════════════════════════════
  //  HELPERS
  // ═══════════════════════════════════════════════════════════════

  /* PRD §5.1 — stable ID check (4+ digit run, UUID, framework prefixes, length>55) */
  function isStableId(id) {
    if (!id || id.length > 55) return false;
    if (/^:r[0-9a-z]+:$/i.test(id)) return false;
    if (/^ember\d+$/i.test(id)) return false;
    if (/^react-select-\d/i.test(id)) return false;
    if (/^(mui|ng|v|rc|el|ant|headlessui|radix)-/.test(id)) return false;
    if (/^[a-f0-9]{8,}$/i.test(id)) return false;
    if (/\d{4,}/.test(id) && !/\b(zip|code|phone|year|date)\b/i.test(id)) return false;
    if (/^[a-f0-9-]{36}$/i.test(id)) return false; // UUID
    return true;
  }

  /* PRD §5.2 — Dynamic detection (SelectorsHub isAlphaNumeric / isAttributeDynamic port) */
  function isDynamicClass(cls) {
    if (!cls) return false;
    if (/^css-[a-z0-9]+$/i.test(cls)) return true;             // emotion
    if (/^_[a-z0-9]{5,}$/i.test(cls)) return true;             // CSS modules __hash
    if (/^sc-[a-zA-Z]/.test(cls)) return true;                  // styled-components
    if (/^svelte-[a-z0-9]+$/i.test(cls)) return true;           // Svelte
    if (/^[a-zA-Z]{1,4}[A-Z][a-zA-Z]{1,6}$/.test(cls)) return true; // short mixed-case: bLCLBY, l9NsEV
    if (/^[a-z]{1,3}-[a-f0-9]{4,}/i.test(cls)) return true;    // hash prefix
    // SelectorsHub core: any digit in short alphanumeric class
    if (cls.length <= 10 && /\d/.test(cls) && /^[a-zA-Z0-9]+$/.test(cls)) return true;
    return false;
  }

  function isAttrDynamic(val) {
    if (!val) return false;
    if (/\d{4,}/.test(val)) return true;
    if (/^[a-f0-9]{8,}$/i.test(val)) return true;
    if (/^[a-f0-9-]{36}$/i.test(val)) return true; // UUID
    return false;
  }

  function xpEsc(str) {
    if (!str.includes("'")) return `'${str}'`;
    if (!str.includes('"')) return `"${str}"`;
    return `concat('${str.split("'").join("',\"'\",'")}')`; 
  }

  function cssEsc(str) {
    return CSS.escape ? CSS.escape(str) : str.replace(/([^\w-])/g, '\\$1');
  }

  /* PRD §5.3 — SelectorsHub deleteGarbageFromInnerText port */
  function cleanText(raw) {
    if (!raw) return '';
    let t = raw.trim();
    // Take first non-empty line
    const lines = t.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    t = lines[0] || t;
    // Strip non-ASCII, take longest remaining segment
    const ascii = t.replace(/[^\x20-\x7E]/g, ' ');
    const segs = ascii.split(/\s{3,}/);
    t = segs.reduce((a, b) => b.length > a.length ? b : a, '');
    // Strip content after /
    const slashIdx = t.indexOf('/');
    if (slashIdx > 5) t = t.slice(0, slashIdx);
    return t.replace(/\s+/g, ' ').trim();
  }

  /* Extract phrase for long text (up to comma or maxLen) */
  function extractPhrase(text, maxLen) {
    maxLen = maxLen || 65;
    const t = text.trim().replace(/\s+/g, ' ');
    if (t.length <= maxLen) return t;
    const comma = t.indexOf(', ');
    if (comma > 0 && comma <= maxLen) return t.slice(0, comma);
    const sp = t.lastIndexOf(' ', maxLen);
    if (sp > 10) return t.slice(0, sp);
    return t.slice(0, maxLen);
  }

  function cssCount(sel) { try { return document.querySelectorAll(sel).length; } catch { return -1; } }
  function xpCount(expr) { try { const r = document.evaluate(expr, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null); return r.snapshotLength; } catch { return -1; } }

  function resolveEls(selector, selectorType, max) {
    max = max || 50;
    const els = [];
    try {
      if (selectorType === 'xpath') {
        const r = document.evaluate(selector, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
        for (let i = 0; i < r.snapshotLength && i < max; i++) { const n = r.snapshotItem(i); if (n && n.nodeType === 1) els.push(n); }
      } else {
        const nl = document.querySelectorAll(selector);
        for (let i = 0; i < nl.length && i < max; i++) els.push(nl[i]);
      }
    } catch {}
    return els;
  }

  function getDirectText(el) {
    let t = '';
    for (const n of el.childNodes) { if (n.nodeType === Node.TEXT_NODE) t += n.textContent; }
    return t.replace(/\s+/g, ' ').trim();
  }

  function isLeafElement(el) {
    return el.children.length === 0;
  }

  function nthIndex(el) {
    let idx = 1, sib = el.previousElementSibling;
    while (sib) { idx++; sib = sib.previousElementSibling; }
    return idx;
  }

  function nthOfTypeIndex(el) {
    let idx = 1, sib = el.previousElementSibling;
    while (sib) { if (sib.tagName === el.tagName) idx++; sib = sib.previousElementSibling; }
    return idx;
  }

  function absoluteXpath(el) {
    const parts = [];
    let cur = el;
    while (cur && cur.nodeType === 1) {
      parts.unshift(`${cur.nodeName.toLowerCase()}[${nthOfTypeIndex(cur)}]`);
      cur = cur.parentElement;
    }
    return '/' + parts.join('/');
  }

  /* Walk ancestors to find one with a stable anchor */
  function findAnchorAncestor(el) {
    let cur = el.parentElement;
    let depth = 0;
    while (cur && cur !== document.body && depth < 8) {
      const testAttrs = ['data-testid', 'data-test-id', 'data-cy', 'data-test', 'data-qa', 'data-automation-id', 'data-e2e'];
      for (const ta of testAttrs) {
        if (cur.getAttribute(ta)) return { el: cur, type: 'test-attr', attr: ta, val: cur.getAttribute(ta), score: 78 };
      }
      if (cur.id && isStableId(cur.id)) return { el: cur, type: 'id', val: cur.id, score: 76 };
      if (cur.getAttribute('aria-label')) return { el: cur, type: 'aria', val: cur.getAttribute('aria-label'), score: 75 };
      const stableC = Array.from(cur.classList || []).filter(c => !isDynamicClass(c));
      if (stableC.length > 0 && cssCount(`${cur.tagName.toLowerCase()}.${cssEsc(stableC[0])}`) <= 3) {
        return { el: cur, type: 'class', val: stableC[0], tag: cur.tagName.toLowerCase(), score: 60 };
      }
      cur = cur.parentElement;
      depth++;
    }
    return null;
  }

  // ═══════════════════════════════════════════════════════════════
  //  PRD §5.4 — XPath Optimization (SelectorsHub optimizeXpath port)
  // ═══════════════════════════════════════════════════════════════
  function optimizeXpath(fullXpath) {
    // Find deepest predicate with meaningful anchor (length>3)
    const segments = fullXpath.replace(/^\/\//, '').split('/');
    for (let i = segments.length - 1; i >= 0; i--) {
      if (/\[.{4,}\]/.test(segments[i])) {
        const candidate = '//' + segments.slice(i).join('/');
        if (xpCount(candidate) === 1) return candidate;
      }
    }
    // Fallback: strip leading segments one at a time
    for (let i = 1; i < segments.length; i++) {
      const candidate = '//' + segments.slice(i).join('/');
      if (xpCount(candidate) === 1) return candidate;
    }
    return fullXpath;
  }

  // ═══════════════════════════════════════════════════════════════
  //  LOCATOR ENGINE — PRD §5.1 all strategies
  // ═══════════════════════════════════════════════════════════════
  function generateLocators(el) {
    const tag = el.tagName.toLowerCase();
    const id = el.id || '';
    const name = el.getAttribute('name') || '';
    const type = el.getAttribute('type') || '';
    const rawText = (el.textContent || '').trim();
    const ownText = getDirectText(el);
    const cleaned = cleanText(rawText);
    const attrs = {};
    for (const a of el.attributes) attrs[a.name] = a.value;
    const classList = Array.from(el.classList || []);
    const rect = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const locators = [];
    let seq = 0;

    /* PRD §5.5 scoring adjustment */
    function add(category, label, selector, selectorType, baseScore, extra) {
      const count = selectorType === 'xpath' ? xpCount(selector) : cssCount(selector);
      let score = baseScore;
      if (count === 0) score = 0;
      else if (count === 1) { /* base score stands */ }
      else if (count >= 2 && count <= 5) score = Math.max(score - 14, 1);
      else if (count >= 6 && count <= 20) score = Math.max(score - 28, 1);
      else if (count > 20) score = Math.max(score - 42, 1);
      if (count < 0) score = 0; // invalid selector
      locators.push({
        id: seq++, category, label, selector, selectorType,
        score: Math.round(score), matchCount: Math.max(count, 0),
        ...(extra || {})
      });
    }

    // ── 1. Test Attributes (PRD score 95) ─────────────────────────
    const testAttrs = ['data-testid', 'data-test-id', 'data-cy', 'data-test', 'data-qa', 'data-automation-id', 'data-e2e'];
    for (const ta of testAttrs) {
      const v = el.getAttribute(ta);
      if (v) {
        add('test', `${ta}`, `[${ta}="${v}"]`, 'css', 95);
        add('test', `xpath ${ta}`, `//*[@${ta}=${xpEsc(v)}]`, 'xpath', 95);
      }
    }

    // ── 2. ARIA (PRD scores 78–87) ────────────────────────────────
    const ariaLabel = el.getAttribute('aria-label');
    const ariaLabelledBy = el.getAttribute('aria-labelledby');
    const role = el.getAttribute('role');

    if (ariaLabel) {
      add('aria', 'aria-label', `[aria-label="${ariaLabel}"]`, 'css', 87);
      add('aria', 'xpath aria-label', `//*[@aria-label=${xpEsc(ariaLabel)}]`, 'xpath', 87);
    }
    if (role && ariaLabel) {
      add('aria', 'role+name', `[role="${role}"][aria-label="${ariaLabel}"]`, 'css', 85);
    }
    if (ariaLabelledBy) {
      add('aria', 'aria-labelledby', `[aria-labelledby="${ariaLabelledBy}"]`, 'css', 78);
    }
    if (role) {
      add('aria', 'role', `[role="${role}"]`, 'css', 60);
    }

    // ── 3. Stable ID (PRD score 90) ───────────────────────────────
    if (id && isStableId(id)) {
      add('id', 'id', `#${cssEsc(id)}`, 'css', 90);
      add('id', 'xpath id', `//*[@id=${xpEsc(id)}]`, 'xpath', 90);
    }
    // Auto-generated ID (PRD score 18)
    if (id && !isStableId(id)) {
      add('id', 'auto-id', `#${cssEsc(id)}`, 'css', 18, { warning: 'Auto-generated ID — likely unstable across sessions' });
    }

    // ── 4. Name (PRD score 80) ────────────────────────────────────
    if (name) {
      add('attr', 'name', `[name="${name}"]`, 'css', 80);
      add('attr', 'xpath name', `//*[@name=${xpEsc(name)}]`, 'xpath', 80);
    }

    // ── 5. Placeholder (PRD score 72) ─────────────────────────────
    const placeholder = el.getAttribute('placeholder');
    if (placeholder) {
      add('attr', 'placeholder', `[placeholder="${placeholder}"]`, 'css', 72);
      add('attr', 'xpath placeholder', `//*[@placeholder=${xpEsc(placeholder)}]`, 'xpath', 72);
    }

    // ── 6. Alt text (PRD score 74) ────────────────────────────────
    const alt = el.getAttribute('alt');
    if (alt) {
      add('attr', 'alt', `${tag}[alt="${alt}"]`, 'css', 74);
      add('attr', 'xpath alt', `//${tag}[@alt=${xpEsc(alt)}]`, 'xpath', 74);
    }

    // ── 7. Title (PRD score 63) ───────────────────────────────────
    const title = el.getAttribute('title');
    if (title) {
      add('attr', 'title', `[title="${title}"]`, 'css', 63);
      add('attr', 'xpath title', `//*[@title=${xpEsc(title)}]`, 'xpath', 63);
    }

    // ── 8. Value (PRD score 68) ───────────────────────────────────
    const value = el.getAttribute('value');
    if (value && (tag === 'input' || tag === 'button' || tag === 'option')) {
      add('attr', 'value', `${tag}[value="${value}"]`, 'css', 68);
    }

    // ── 9. For attribute ──────────────────────────────────────────
    const forAttr = el.getAttribute('for');
    if (forAttr) add('attr', 'for', `[for="${forAttr}"]`, 'css', 80);

    // ── 10. Href (PRD score 65) ───────────────────────────────────
    const href = el.getAttribute('href');
    if (href && tag === 'a' && href !== '#' && href !== '/') {
      const clean = href.replace(/[?#].*/, '');
      if (clean && clean.length < 100) add('attr', 'href', `a[href="${clean}"]`, 'css', 65);
      const tail = clean.split('/').filter(Boolean).pop();
      if (tail && tail.length > 1) add('attr', 'xpath href', `//a[contains(@href,${xpEsc(tail)})]`, 'xpath', 65);
    }

    // ── 11. Link text (PRD score 68) ──────────────────────────────
    if (tag === 'a' && cleaned) {
      if (cleaned.length <= 80) add('text', 'link-text', `//a[normalize-space(.)=${xpEsc(cleaned)}]`, 'xpath', 68);
      if (cleaned.length > 30) {
        const partial = extractPhrase(cleaned, 30);
        add('text', 'partial-link-text', `//a[contains(text(),${xpEsc(partial)})]`, 'xpath', 58);
      }
    }

    // ── 12. Text strategies (PRD scores 52–68) ────────────────────
    if (cleaned && cleaned.length > 0) {
      // Text exact text()= for leaf elements (PRD 52)
      if (isLeafElement(el) && cleaned.length <= 80) {
        add('text', 'text-exact', `//${tag}[text()=${xpEsc(cleaned)}]`, 'xpath', 52);
      }
      // normalize-space exact (PRD 68)
      if (cleaned.length <= 80) {
        add('text', 'normalize-space', `//${tag}[normalize-space()=${xpEsc(cleaned)}]`, 'xpath', 68);
      }
      // contains for long text (PRD 64) — uses first phrase
      if (cleaned.length > 3) {
        const phrase = extractPhrase(cleaned, 65);
        const hasJunk = /\s{2,}/.test(rawText.slice(0, 80)) || cleaned.length > 50;
        if (hasJunk || phrase !== cleaned) {
          add('text', 'text-contains', `//${tag}[contains(normalize-space(),${xpEsc(phrase)})]`, 'xpath', 64);
        }
      }
    }

    // ── 13. Class strategies ──────────────────────────────────────
    const staticClasses = classList.filter(c => !isDynamicClass(c));
    const dynamicClasses = classList.filter(c => isDynamicClass(c));

    // Stable class — contains() (PRD score 45)
    for (const cls of staticClasses.slice(0, 3)) {
      add('class', `class .${cls}`, `//${tag}[contains(@class,${xpEsc(cls)})]`, 'xpath', 45);
    }
    // Stable class — multi (PRD score 52)
    if (staticClasses.length >= 2) {
      const a = staticClasses[0], b = staticClasses[1];
      add('class', 'class-multi', `//${tag}[contains(@class,${xpEsc(a)}) and contains(@class,${xpEsc(b)})]`, 'xpath', 52);
    }
    // Dynamic class — contains() (PRD score 28)
    for (const cls of dynamicClasses.slice(0, 2)) {
      add('class', `dyn-class .${cls}`, `//${tag}[contains(@class,${xpEsc(cls)})]`, 'xpath', 28,
        { warning: 'POSSIBLY DYNAMIC — verify stability before using' });
    }
    // Dynamic class — scoped with ancestor (PRD score 40)
    if (dynamicClasses.length > 0) {
      const anc = findAnchorAncestor(el);
      if (anc && anc.type !== 'class') {
        const dc = dynamicClasses[0];
        let ancSel = '';
        if (anc.type === 'test-attr') ancSel = `//*[@${anc.attr}=${xpEsc(anc.val)}]`;
        else if (anc.type === 'id') ancSel = `//*[@id=${xpEsc(anc.val)}]`;
        else if (anc.type === 'aria') ancSel = `//*[@aria-label=${xpEsc(anc.val)}]`;
        if (ancSel) {
          add('class', 'dyn-class-scoped', `${ancSel}//${tag}[contains(@class,${xpEsc(dc)})]`, 'xpath', 40,
            { warning: 'Dynamic class scoped by ancestor — more stable but verify' });
        }
      }
    }

    // ── 14. Child-anchor strategy (PRD score 70) ──────────────────
    const childLinks = el.querySelectorAll(':scope a[href], :scope b, :scope strong, :scope img[alt]');
    const seenChild = new Set();
    for (const ch of Array.from(childLinks).slice(0, 5)) {
      const ct = ch.tagName.toLowerCase();
      if (ct === 'a') {
        const h = ch.getAttribute('href');
        if (h && h.length > 1 && h.length < 120 && !seenChild.has('a-' + h)) {
          seenChild.add('a-' + h);
          const part = h.split('/').filter(Boolean).pop() || h;
          add('hierarchy', 'child-link-href', `//${tag}[.//a[contains(@href,${xpEsc(part)})]]`, 'xpath', 70);
        }
      }
      if ((ct === 'b' || ct === 'strong') && ch.textContent.trim()) {
        const bt = ch.textContent.trim();
        if (bt.length > 1 && bt.length < 80 && !seenChild.has('b-' + bt)) {
          seenChild.add('b-' + bt);
          add('hierarchy', 'child-bold-text', `//${tag}[.//${ct}[normalize-space()=${xpEsc(extractPhrase(bt, 50))}]]`, 'xpath', 65);
        }
      }
      if (ct === 'img') {
        const a2 = ch.getAttribute('alt');
        if (a2 && !seenChild.has('img-' + a2)) {
          seenChild.add('img-' + a2);
          add('hierarchy', 'child-img-alt', `//${tag}[.//img[@alt=${xpEsc(a2)}]]`, 'xpath', 65);
        }
      }
    }

    // ── 15. Ancestor//descendant scoped (PRD score 72–78) ─────────
    const anchor = findAnchorAncestor(el);
    if (anchor) {
      let ancXp = '';
      if (anchor.type === 'test-attr') ancXp = `//*[@${anchor.attr}=${xpEsc(anchor.val)}]`;
      else if (anchor.type === 'id') ancXp = `//*[@id=${xpEsc(anchor.val)}]`;
      else if (anchor.type === 'aria') ancXp = `//*[@aria-label=${xpEsc(anchor.val)}]`;
      else if (anchor.type === 'class') ancXp = `//${anchor.tag}[contains(@class,${xpEsc(anchor.val)})]`;

      if (ancXp) {
        // CSS version
        let ancCss = '';
        if (anchor.type === 'test-attr') ancCss = `[${anchor.attr}="${anchor.val}"]`;
        else if (anchor.type === 'id') ancCss = `#${cssEsc(anchor.val)}`;
        else if (anchor.type === 'aria') ancCss = `[aria-label="${anchor.val}"]`;
        else if (anchor.type === 'class') ancCss = `${anchor.tag}.${cssEsc(anchor.val)}`;

        add('hierarchy', 'ancestor-descendant', `${ancXp}//${tag}`, 'xpath', anchor.score);
        if (ancCss) add('hierarchy', 'ancestor-css', `${ancCss} ${tag}`, 'css', anchor.score - 2);
      }
    }

    // ── 16. Parent/child direct (PRD score 68–74) ─────────────────
    const parent = el.parentElement;
    if (parent && parent !== document.body) {
      const pTag = parent.tagName.toLowerCase();
      const nth = nthIndex(el);
      if (parent.id && isStableId(parent.id)) {
        add('hierarchy', 'parent-id>child', `#${cssEsc(parent.id)} > ${tag}:nth-child(${nth})`, 'css', 74);
        add('hierarchy', 'xpath-parent-id', `//*[@id=${xpEsc(parent.id)}]/${tag}[${nthOfTypeIndex(el)}]`, 'xpath', 72);
      }
      const pTestAttr = testAttrs.find(a => parent.getAttribute(a));
      if (pTestAttr) {
        add('hierarchy', 'parent-testattr>child', `[${pTestAttr}="${parent.getAttribute(pTestAttr)}"] > ${tag}:nth-child(${nth})`, 'css', 74);
      }
      const pStatic = Array.from(parent.classList || []).filter(c => !isDynamicClass(c));
      if (pStatic.length > 0) {
        add('hierarchy', 'parent-class>child', `${pTag}.${cssEsc(pStatic[0])} > ${tag}:nth-child(${nth})`, 'css', 68);
      }
    }

    // ── 17. Following-sibling (PRD score 60) ──────────────────────
    const prevSib = el.previousElementSibling;
    if (prevSib) {
      const pSibTag = prevSib.tagName.toLowerCase();
      const pSibText = cleanText(prevSib.textContent);
      if (pSibTag === 'label' && pSibText) {
        add('hierarchy', 'following-sib-label', `//label[normalize-space()=${xpEsc(extractPhrase(pSibText, 50))}]/following-sibling::${tag}[1]`, 'xpath', 60);
      } else if (pSibText && pSibText.length > 1 && pSibText.length < 60) {
        add('hierarchy', 'following-sibling', `//${pSibTag}[normalize-space()=${xpEsc(pSibText)}]/following-sibling::${tag}[1]`, 'xpath', 60);
      }
    }

    // ── 18. Preceding-sibling (PRD score 55) ──────────────────────
    const nextSib = el.nextElementSibling;
    if (nextSib) {
      const nSibTag = nextSib.tagName.toLowerCase();
      const nSibText = cleanText(nextSib.textContent);
      if (nSibText && nSibText.length > 1 && nSibText.length < 60) {
        add('hierarchy', 'preceding-sibling', `//${nSibTag}[normalize-space()=${xpEsc(nSibText)}]/preceding-sibling::${tag}[1]`, 'xpath', 55);
      }
    }

    // ── 19. AND combos (PRD scores 55–72) ─────────────────────────
    if (role && cleaned && cleaned.length > 1 && cleaned.length <= 80) {
      add('logical', 'role+text', `//*[@role="${role}" and contains(normalize-space(),${xpEsc(extractPhrase(cleaned, 50))})]`, 'xpath', 72);
    }
    if (staticClasses.length > 0 && cleaned && cleaned.length > 1) {
      const cls = staticClasses[0];
      add('logical', 'class+text', `//${tag}[contains(@class,${xpEsc(cls)}) and contains(normalize-space(),${xpEsc(extractPhrase(cleaned, 50))})]`, 'xpath', 63);
    }
    if (dynamicClasses.length > 0 && cleaned && cleaned.length > 1) {
      const dc = dynamicClasses[0];
      add('logical', 'dynclass+text', `//${tag}[contains(@class,${xpEsc(dc)}) and contains(normalize-space(),${xpEsc(extractPhrase(cleaned, 50))})]`, 'xpath', 55,
        { warning: 'Dual-anchor: if class changes, text still matches; if text changes, class still matches' });
    }

    // ── 20. ID starts-with (PRD score 42) ─────────────────────────
    if (id && !isStableId(id) && id.length > 5) {
      // Find stable prefix (before digits or hashes)
      const m = id.match(/^([a-zA-Z_-]{3,})/);
      if (m) {
        add('id', 'id-starts-with', `//${tag}[starts-with(@id,${xpEsc(m[1])})]`, 'xpath', 42,
          { warning: 'Partial ID prefix — verify stability' });
      }
    }

    // ── 21. Anchored CSS path (PRD score 30–82) ───────────────────
    {
      const chain = [];
      let cur = el, depth = 0, anchorScore = 30;
      while (cur && cur !== document.body && cur !== document.documentElement && depth < 10) {
        const ct = cur.tagName.toLowerCase();
        const ci = nthIndex(cur);
        let seg = `${ct}:nth-child(${ci})`;
        // Check for anchor
        const cTestAttr = testAttrs.find(a => cur.getAttribute(a));
        if (cTestAttr) { seg = `[${cTestAttr}="${cur.getAttribute(cTestAttr)}"]`; anchorScore = 82; chain.unshift(seg); break; }
        if (cur.id && isStableId(cur.id)) { seg = `#${cssEsc(cur.id)}`; anchorScore = 78; chain.unshift(seg); break; }
        if (cur.getAttribute('aria-label')) { seg = `[aria-label="${cur.getAttribute('aria-label')}"]`; anchorScore = 75; chain.unshift(seg); break; }
        chain.unshift(seg);
        // Check if unique already
        const candidate = chain.join(' > ');
        if (cssCount(candidate) === 1) { anchorScore = Math.max(anchorScore, 50); break; }
        cur = cur.parentElement;
        depth++;
      }
      if (chain.length > 0) {
        const cssPath = chain.join(' > ');
        add('css', 'css-path', cssPath, 'css', anchorScore);
      }
    }

    // ── 22. Relative XPath with optimization (PRD score 44–83) ────
    {
      // Build full relative path using SelectorsHub attr priority
      const attrPriority = ['placeholder', 'title', 'value', 'name', 'aria-label', 'alt', 'for', 'data-label', 'role', 'type'];
      let relXp = absoluteXpath(el);
      let relScore = 44;
      // Try to optimize
      const optimized = optimizeXpath(relXp);
      if (optimized !== relXp) {
        relXp = optimized;
        relScore = 65;
      }
      // Try attribute-based relative
      for (const attr of attrPriority) {
        const v = el.getAttribute(attr);
        if (v && !isAttrDynamic(v)) {
          const candidate = `//${tag}[@${attr}=${xpEsc(v)}]`;
          if (xpCount(candidate) === 1) { relXp = candidate; relScore = 83; break; }
        }
      }
      add('xpath', 'relative-xpath', relXp, 'xpath', relScore);
    }

    // ── 23. Position-based XPath (PRD score 20) ───────────────────
    {
      const tagCount = cssCount(tag);
      if (tagCount > 0) {
        const els = document.querySelectorAll(tag);
        let posIdx = -1;
        for (let i = 0; i < els.length; i++) { if (els[i] === el) { posIdx = i + 1; break; } }
        if (posIdx > 0) add('position', 'position-xpath', `(//${tag})[${posIdx}]`, 'xpath', 20);
      }
    }

    // ── 24. Absolute XPath (PRD score 8) ──────────────────────────
    add('absolute', 'absolute-xpath', absoluteXpath(el), 'xpath', 8);

    // ── Sort (PRD §5.6) ───────────────────────────────────────────
    locators.sort((a, b) => {
      if (a.category === 'absolute' && b.category !== 'absolute') return 1;
      if (b.category === 'absolute' && a.category !== 'absolute') return -1;
      if (a.category === 'position' && b.category !== 'position' && b.category !== 'absolute') return 1;
      if (b.category === 'position' && a.category !== 'position' && a.category !== 'absolute') return -1;
      return b.score - a.score;
    });

    // ── Tier assignment (PRD §6.3: ≥65 Stable, 30–64 Moderate, <30 Fragile) ──
    for (const loc of locators) {
      if (loc.score >= 65) loc.tier = 'stable';
      else if (loc.score >= 30) loc.tier = 'moderate';
      else loc.tier = 'fragile';
    }

    // ── Metadata ──────────────────────────────────────────────────
    const stableClassList = staticClasses;
    const dynamicClassList = dynamicClasses;
    const tagCount = cssCount(tag);

    return {
      tag, id: id || null, name: name || null,
      classes: classList, stableClasses: stableClassList, dynamicClasses: dynamicClassList,
      attributes: attrs,
      role: role || null,
      ariaLabel: ariaLabel || null,
      textContent: cleaned,
      textPreview: extractPhrase(rawText, 200),
      linkText: tag === 'a' ? cleaned : null,
      rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
      computed: {
        display: cs.display, visibility: cs.visibility, cursor: cs.cursor,
        pointerEvents: cs.pointerEvents, fontSize: cs.fontSize, fontWeight: cs.fontWeight
      },
      tagCount, childCount: el.children.length,
      locators
    };
  }

  // ═══════════════════════════════════════════════════════════════
  //  OVERLAY
  // ═══════════════════════════════════════════════════════════════
  function ensureOverlay() {
    if (overlayEl) return;
    overlayEl = document.createElement('div'); overlayEl.id = OVR_ID;
    tagEl = document.createElement('div'); tagEl.id = TAG_ID;
    overlayEl.appendChild(tagEl);
    document.documentElement.appendChild(overlayEl);
  }

  function showOverlay(el) {
    ensureOverlay();
    const r = el.getBoundingClientRect();
    Object.assign(overlayEl.style, {
      position:'fixed', top:r.top+'px', left:r.left+'px', width:r.width+'px', height:r.height+'px',
      display:'block', pointerEvents:'none', zIndex:'2147483646',
      outline:'2px solid #6366f1', background:'rgba(99,102,241,0.07)',
      boxSizing:'border-box', transition:'top .08s,left .08s,width .08s,height .08s'
    });
    const cls = Array.from(el.classList||[]).slice(0,2).join('.');
    tagEl.textContent = el.tagName.toLowerCase() + (el.id ? '#'+el.id.slice(0,20) : '') + (cls ? '.'+cls.slice(0,30) : '');
    Object.assign(tagEl.style, {
      position:'absolute', bottom:'100%', left:'0', background:'#6366f1', color:'#fff',
      fontSize:'10px', fontFamily:'monospace', padding:'2px 6px', borderRadius:'3px 3px 0 0',
      whiteSpace:'nowrap', maxWidth:'300px', overflow:'hidden', textOverflow:'ellipsis'
    });
  }

  function flashGreen() {
    if (!overlayEl) return;
    overlayEl.style.outline = '2px solid #10b981'; overlayEl.style.background = 'rgba(16,185,129,0.12)';
    setTimeout(() => { if (overlayEl) { overlayEl.style.outline = '2px solid #6366f1'; overlayEl.style.background = 'rgba(99,102,241,0.07)'; } }, 400);
  }

  function hideOverlay() { if (overlayEl) overlayEl.style.display = 'none'; }

  // ═══════════════════════════════════════════════════════════════
  //  PRD §7 — FLASH & HIGHLIGHT MODES
  // ═══════════════════════════════════════════════════════════════
  let activeMode = null; // 'flash' | 'highlight'
  let activeEls = [];

  function clearAllModes() {
    // Clear flash
    document.querySelectorAll('.' + FLASH_CLS).forEach(el => {
      el.classList.remove(FLASH_CLS);
      if (el.dataset.ll5Prev !== undefined) { el.style.outline = el.dataset.ll5Prev; delete el.dataset.ll5Prev; }
      el.style.zIndex = '';
    });
    // Clear highlight
    document.querySelectorAll('.' + DIM_CLS).forEach(el => {
      el.classList.remove(DIM_CLS);
      el.style.opacity = ''; el.style.transition = '';
    });
    document.querySelectorAll('.' + HL_CLS).forEach(el => {
      el.classList.remove(HL_CLS);
      if (el.dataset.ll5Prev !== undefined) { el.style.outline = el.dataset.ll5Prev; delete el.dataset.ll5Prev; }
      el.style.boxShadow = ''; el.style.zIndex = ''; el.style.opacity = '';
    });
    activeMode = null;
    activeEls = [];
  }

  /* PRD §7.1 — Flash Mode: amber pulsing outline */
  function flashElements(els) {
    clearAllModes();
    activeMode = 'flash';
    activeEls = els;
    for (const el of els) {
      el.dataset.ll5Prev = el.style.outline || '';
      el.classList.add(FLASH_CLS);
      el.style.outline = '2px solid #f59e0b';
      el.style.outlineOffset = '1px';
      el.style.zIndex = '2147483640';
    }
    if (els[0]) els[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  /* PRD §7.2 — Highlight Mode: dim everything, violet glow on target */
  function highlightElements(els) {
    clearAllModes();
    activeMode = 'highlight';
    activeEls = els;
    const targetSet = new Set(els);
    // Collect ancestors and descendants to exclude from dimming
    const excluded = new Set();
    for (const el of els) {
      excluded.add(el);
      let anc = el.parentElement;
      while (anc) { excluded.add(anc); anc = anc.parentElement; }
      el.querySelectorAll('*').forEach(d => excluded.add(d));
    }
    // Dim all body children
    document.querySelectorAll('body *').forEach(el => {
      if (el === overlayEl || el === tagEl) return;
      if (excluded.has(el)) return;
      el.classList.add(DIM_CLS);
      el.style.opacity = '0.2';
      el.style.transition = 'opacity 0.15s';
    });
    // Highlight targets
    for (const el of els) {
      el.dataset.ll5Prev = el.style.outline || '';
      el.classList.add(HL_CLS);
      el.style.opacity = '1';
      el.style.outline = '2px solid #6366f1';
      el.style.outlineOffset = '2px';
      el.style.boxShadow = '0 0 0 4px rgba(99,102,241,0.25)';
      el.style.zIndex = '2147483642';
    }
    if (els[0]) els[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // ═══════════════════════════════════════════════════════════════
  //  PICKER (PRD §4.1 — composedPath)
  // ═══════════════════════════════════════════════════════════════
  const state = { picking: false, passive: false, lastTarget: null };

  function resolveTarget(e) {
    // PRD §4.1: composedPath()[0] for shadow DOM
    const path = e.composedPath ? e.composedPath() : [];
    let t = path[0] || e.target;
    if (t === overlayEl || t === tagEl) t = state.lastTarget || document.elementFromPoint(e.clientX, e.clientY);
    return (t && t !== overlayEl && t !== tagEl) ? t : null;
  }

  function onPickMove(e) {
    const t = resolveTarget(e);
    if (!t) return;
    state.lastTarget = t;
    showOverlay(t);
  }

  function onPickClick(e) {
    e.preventDefault(); e.stopImmediatePropagation(); e.stopPropagation();
    const t = resolveTarget(e);
    if (!t) return;
    flashGreen();
    stopPick();
    chrome.runtime.sendMessage({ type: 'locatorsGenerated', payload: generateLocators(t) });
  }

  function onPickKey(e) {
    if (e.key === 'Escape') { stopPick(); chrome.runtime.sendMessage({ type: 'pickingCancelled' }); }
  }

  function startPick() {
    state.picking = true;
    ensureOverlay(); overlayEl.style.display = '';
    document.addEventListener('mousemove', onPickMove, true);
    document.addEventListener('click', onPickClick, true);
    document.addEventListener('keydown', onPickKey, true);
    document.documentElement.style.cursor = 'crosshair';
  }

  function stopPick() {
    state.picking = false; hideOverlay();
    document.removeEventListener('mousemove', onPickMove, true);
    document.removeEventListener('click', onPickClick, true);
    document.removeEventListener('keydown', onPickKey, true);
    document.documentElement.style.cursor = '';
  }

  // ═══════════════════════════════════════════════════════════════
  //  PASSIVE MODE (PRD §4.2)
  // ═══════════════════════════════════════════════════════════════
  function onPassiveClick(e) {
    if (!state.passive || state.picking) return;
    const t = resolveTarget(e);
    if (!t) return;
    // Green flash 600ms
    ensureOverlay();
    const r = t.getBoundingClientRect();
    Object.assign(overlayEl.style, {
      position:'fixed', top:r.top+'px', left:r.left+'px', width:r.width+'px', height:r.height+'px',
      display:'block', pointerEvents:'none', zIndex:'2147483646',
      outline:'2px solid #10b981', background:'rgba(16,185,129,0.08)', boxSizing:'border-box'
    });
    tagEl.textContent = t.tagName.toLowerCase();
    Object.assign(tagEl.style, { position:'absolute', bottom:'100%', left:'0', background:'#10b981', color:'#fff', fontSize:'10px', fontFamily:'monospace', padding:'2px 6px', borderRadius:'3px 3px 0 0', whiteSpace:'nowrap' });
    setTimeout(() => hideOverlay(), 600);
    chrome.runtime.sendMessage({ type: 'locatorsGenerated', payload: generateLocators(t) });
  }
  document.addEventListener('click', onPassiveClick, true);

  // ═══════════════════════════════════════════════════════════════
  //  MESSAGE HANDLER
  // ═══════════════════════════════════════════════════════════════
  chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
    switch (msg.type) {
      case 'ping': sendResponse({ pong: true }); break;
      case 'startPicking': startPick(); sendResponse({ ok: true }); break;
      case 'stopPicking': stopPick(); sendResponse({ ok: true }); break;
      case 'setPassive': state.passive = !!msg.enabled; sendResponse({ ok: true }); break;
      case 'flashLocator': {
        const els = resolveEls(msg.selector, msg.selectorType);
        flashElements(els);
        sendResponse({ ok: true, count: els.length });
        break;
      }
      case 'highlightLocator': {
        const els = resolveEls(msg.selector, msg.selectorType);
        highlightElements(els);
        sendResponse({ ok: true, count: els.length });
        break;
      }
      case 'clearFlash': clearAllModes(); sendResponse({ ok: true }); break;
      case 'navigateMatch': {
        const els = resolveEls(msg.selector, msg.selectorType);
        const idx = Math.max(0, Math.min(msg.index || 0, els.length - 1));
        if (els[idx]) els[idx].scrollIntoView({ behavior: 'smooth', block: 'center' });
        sendResponse({ ok: true, total: els.length, index: idx });
        break;
      }
      case 'validateSelector': {
        let count = -1, error = null, previews = [];
        try {
          const els = resolveEls(msg.selector, msg.selectorType, 5);
          count = msg.selectorType === 'xpath' ? xpCount(msg.selector) : cssCount(msg.selector);
          previews = els.slice(0, 5).map(el => ({
            tag: el.tagName.toLowerCase(),
            text: (el.textContent || '').trim().slice(0, 60)
          }));
        } catch (e) { error = e.message; }
        sendResponse({ selector: msg.selector, selectorType: msg.selectorType, count, error, previews });
        break;
      }
      default: sendResponse({ ok: false });
    }
    return true;
  });

})();
