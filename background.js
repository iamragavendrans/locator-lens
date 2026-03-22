// LocatorLens v5 — Service Worker
'use strict';

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

let panelPort = null;

/* ── Inject content script on demand if not already present ─────────────── */
async function injectIfNeeded(tabId) {
  try {
    const resp = await chrome.tabs.sendMessage(tabId, { type: 'ping' });
    if (resp && resp.pong) return true;
  } catch (_) {
    /* not injected yet */
  }
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    await chrome.scripting.insertCSS({ target: { tabId }, files: ['content.css'] });
    await new Promise(r => setTimeout(r, 180));
    return true;
  } catch (err) {
    console.warn('[LL] injection failed:', err.message);
    return false;
  }
}

/* ── Panel opens a long-lived port ──────────────────────────────────────── */
chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'locatorlens') return;
  panelPort = port;

  port.onMessage.addListener(async msg => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) {
      port.postMessage({ type: 'error', message: 'No active tab found.' });
      return;
    }

    /* Block chrome:// and edge:// pages */
    if (tab.url && /^(chrome|edge|about|devtools):/.test(tab.url)) {
      port.postMessage({ type: 'error', message: 'Cannot run on browser-internal pages.' });
      return;
    }

    const ready = await injectIfNeeded(tab.id);
    if (!ready) {
      port.postMessage({ type: 'error', message: 'Could not inject into this page. Try a normal web page.' });
      return;
    }

    /* Relay commands to content script */
    const forwarded = [
      'startPicking', 'stopPicking', 'setPassive',
      'flashLocator', 'clearFlash', 'validateSelector', 'cycleMatch'
    ];

    if (forwarded.includes(msg.type)) {
      try {
        const result = await chrome.tabs.sendMessage(tab.id, msg);
        if (msg.type === 'validateSelector' && result) {
          port.postMessage({ type: 'validateResult', ...result });
        }
      } catch (err) {
        port.postMessage({ type: 'error', message: 'Page did not respond: ' + err.message });
      }
    }
  });

  port.onDisconnect.addListener(() => { panelPort = null; });
});

/* ── Content script → Panel relay ───────────────────────────────────────── */
chrome.runtime.onMessage.addListener((msg, _sender, _sendResponse) => {
  if (!panelPort) return;
  if (msg.type === 'locatorsGenerated' || msg.type === 'pickingCancelled') {
    panelPort.postMessage(msg);
  }
});
