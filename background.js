// Tab Switcher — background service worker.
//
// Responsibilities:
//   1. Track a most-recently-used (MRU) ordering of tabs so the overlay can be
//      ordered like Windows Alt-Tab (current tab first, previous tab next, ...).
//   2. React to the Alt+Q command: first press opens the overlay on the active
//      tab; while it is open each further press advances the selection.
//   3. Switch to the tab the content script commits to.
//
// MRU is kept in chrome.storage.session because the service worker can be torn
// down at any time and would otherwise lose its in-memory state.

const MRU_KEY = 'mruTabIds';

// Tab id where the overlay is currently shown (in-memory; if the worker is
// recycled this resets to null and the next Alt+Q simply re-opens the overlay).
let overlayTabId = null;

async function getMru() {
    const stored = await chrome.storage.session.get(MRU_KEY);
    return stored[MRU_KEY] || [];
}

async function setMru(ids) {
    await chrome.storage.session.set({ [MRU_KEY]: ids });
}

// Move a tab to the front of the MRU list.
async function touchTab(tabId) {
    const mru = await getMru();
    await setMru([tabId, ...mru.filter((id) => id !== tabId)]);
}

chrome.tabs.onActivated.addListener(({ tabId }) => {
    touchTab(tabId);
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
    const mru = await getMru();
    await setMru(mru.filter((id) => id !== tabId));
    if (overlayTabId === tabId) overlayTabId = null;
});

// Seed the MRU with the currently active tab on install/startup.
async function seedActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) await touchTab(tab.id);
}
chrome.runtime.onInstalled.addListener(seedActiveTab);
chrome.runtime.onStartup.addListener(seedActiveTab);

// Build the MRU-ordered list of tabs in the current window, shaped for the UI.
async function buildTabList() {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const mru = await getMru();
    const byId = new Map(tabs.map((t) => [t.id, t]));

    const ordered = [];
    for (const id of mru) {
        if (byId.has(id)) {
            ordered.push(byId.get(id));
            byId.delete(id);
        }
    }
    // Append any tabs not yet seen in the MRU list (e.g. freshly created).
    for (const t of byId.values()) ordered.push(t);

    return ordered.map((t) => ({
        id: t.id,
        title: t.title || t.url || 'Tab',
        favIconUrl: t.favIconUrl || '',
        url: t.url || ''
    }));
}

chrome.commands.onCommand.addListener(async (command) => {
    if (command !== 'switchTab') return;

    const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!active) return;

    // Overlay already open on this tab -> advance the selection instead.
    if (overlayTabId === active.id) {
        chrome.tabs.sendMessage(active.id, { type: 'advance' }).catch(() => {
            overlayTabId = null;
        });
        return;
    }

    const tabs = await buildTabList();
    // Default selection is the previous tab (index 1) so a quick Alt+Q then
    // release behaves like a classic "switch to last tab" toggle.
    const initialIndex = tabs.length > 1 ? 1 : 0;

    overlayTabId = active.id;
    try {
        await chrome.tabs.sendMessage(active.id, { type: 'show', tabs, initialIndex });
    } catch (e) {
        // No content script here (chrome://, the Web Store, PDF viewer, etc.).
        // Fall back to the original behaviour: jump straight to the previous tab.
        overlayTabId = null;
        const previous = tabs[1];
        if (previous) chrome.tabs.update(previous.id, { active: true });
    }
});

chrome.runtime.onMessage.addListener((msg, sender) => {
    if (!msg) return;
    if (msg.type === 'commit') {
        overlayTabId = null;
        if (typeof msg.tabId === 'number') {
            chrome.tabs.update(msg.tabId, { active: true });
        }
    } else if (msg.type === 'cancel') {
        overlayTabId = null;
    }
});
