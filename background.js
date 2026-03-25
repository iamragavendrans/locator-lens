// LocatorLens v5 — Service Worker (PRD §2)
'use strict';

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

let panelPort = null;

async function injectIfNeeded(tabId) {
  try {
    const r = await chrome.tabs.sendMessage(tabId, { type: 'ping' });
    if (r && r.pong) return true;
  } catch (_) { /* not yet injected */ }
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    await chrome.scripting.insertCSS({ target: { tabId }, files: ['content.css'] });
    await new Promise(r => setTimeout(r, 180));
    return true;
  } catch (err) {
    console.warn('[LL] inject failed:', err.message);
    return false;
  }
}

chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'locatorlens') return;
  panelPort = port;

  port.onMessage.addListener(async msg => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) { port.postMessage({ type: 'error', message: 'No active tab found.' }); return; }
    if (tab.url && /^(chrome|edge|about|devtools):/.test(tab.url)) {
      port.postMessage({ type: 'error', message: 'Cannot run on browser-internal pages.' }); return;
    }
    const ok = await injectIfNeeded(tab.id);
    if (!ok) { port.postMessage({ type: 'error', message: 'Cannot inject into this page. Try a normal web page.' }); return; }

    const relayed = [
      'startPicking', 'stopPicking', 'setPassive',
      'flashLocator', 'highlightLocator', 'clearFlash',
      'navigateMatch', 'validateSelector'
    ];
    if (relayed.includes(msg.type)) {
      try {
        const result = await chrome.tabs.sendMessage(tab.id, msg);
        if (msg.type === 'validateSelector' && result) port.postMessage({ type: 'validateResult', ...result });
        if (msg.type === 'navigateMatch' && result)     port.postMessage({ type: 'navigateResult', ...result });
      } catch (err) { port.postMessage({ type: 'error', message: 'Page not responding: ' + err.message }); }
    }
  });

  port.onDisconnect.addListener(() => { panelPort = null; });
});

chrome.runtime.onMessage.addListener((msg) => {
  if (!panelPort) return;
  if (msg.type === 'locatorsGenerated' || msg.type === 'pickingCancelled') panelPort.postMessage(msg);
});
