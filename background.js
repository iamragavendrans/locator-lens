// LocatorLens v5 — Service Worker
'use strict';

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

let panelPort = null;
let boundTabId = null;

async function injectIfNeeded(tabId) {
  try {
    const r = await chrome.tabs.sendMessage(tabId, { type: 'ping' });
    if (r && r.pong) return true;
  } catch (_) {}
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

async function getTargetTab(msg) {
  if (msg.type === 'bindTab') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) {
      boundTabId = tab.id;
      if (panelPort) panelPort.postMessage({ type: 'tabBound', tabId: boundTabId, url: tab.url || '' });
    }
    return null;
  }
  if (msg.type === 'unbindTab') {
    boundTabId = null;
    if (panelPort) panelPort.postMessage({ type: 'tabUnbound' });
    return null;
  }
  if (msg.type === 'getTabState') {
    if (panelPort) {
      if (boundTabId) {
        try {
          const tab = await chrome.tabs.get(boundTabId);
          panelPort.postMessage({ type: 'tabBound', tabId: boundTabId, url: tab.url || '' });
        } catch (_) {
          boundTabId = null;
          panelPort.postMessage({ type: 'tabUnbound' });
        }
      } else {
        panelPort.postMessage({ type: 'tabUnbound' });
      }
    }
    return null;
  }

  if (boundTabId) {
    try { return await chrome.tabs.get(boundTabId); }
    catch (_) { boundTabId = null; if (panelPort) panelPort.postMessage({ type: 'tabUnbound' }); return null; }
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'locatorlens') return;
  panelPort = port;

  port.onMessage.addListener(async msg => {
    const tab = await getTargetTab(msg);
    if (tab === null && ['bindTab','unbindTab','getTabState'].includes(msg.type)) return;
    if (!tab || !tab.id) { port.postMessage({ type: 'error', message: 'No active tab found.' }); return; }
    if (tab.url && /^(chrome|edge|about|devtools):/.test(tab.url)) {
      port.postMessage({ type: 'error', message: 'Cannot run on browser-internal pages.' }); return;
    }

    // Auto-bind on startPicking or setPassive
    if ((msg.type === 'startPicking' || (msg.type === 'setPassive' && msg.enabled)) && !boundTabId) {
      boundTabId = tab.id;
      port.postMessage({ type: 'tabBound', tabId: boundTabId, url: tab.url || '' });
    }

    const ok = await injectIfNeeded(tab.id);
    if (!ok) { port.postMessage({ type: 'error', message: 'Cannot inject into this page.' }); return; }

    const relayed = [
      'startPicking', 'stopPicking', 'setPassive', 'setLock',
      'flashLocator', 'highlightLocator', 'clearFlash',
      'navigateMatch', 'validateSelector'
    ];
    if (relayed.includes(msg.type)) {
      try {
        const result = await chrome.tabs.sendMessage(tab.id, msg);
        if (msg.type === 'validateSelector' && result) port.postMessage({ type: 'validateResult', ...result });
        if (msg.type === 'navigateMatch' && result) port.postMessage({ type: 'navigateResult', ...result });
      } catch (err) { port.postMessage({ type: 'error', message: 'Page not responding: ' + err.message }); }
    }
  });

  port.onDisconnect.addListener(() => { panelPort = null; });
});

chrome.tabs.onRemoved.addListener(tabId => {
  if (tabId === boundTabId) {
    boundTabId = null;
    if (panelPort) panelPort.postMessage({ type: 'tabUnbound' });
  }
});

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!panelPort) return;
  if (boundTabId && sender.tab && sender.tab.id !== boundTabId) return;
  if (msg.type === 'locatorsGenerated' || msg.type === 'pickingCancelled') panelPort.postMessage(msg);
});
