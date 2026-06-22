// Tab Switcher — content script.
//
// Renders the overlay grid inside a Shadow DOM (so the host page's CSS can't
// leak in), and drives the "hold Alt, tap Q to cycle, release Alt to commit"
// interaction. Selection can also be moved with Tab / arrow keys, and any card
// can be clicked to switch to it directly.

(() => {
    // Content scripts can be injected more than once (e.g. extension reload);
    // guard so we only wire everything up a single time.
    if (window.__tabSwitcherInjected) return;
    window.__tabSwitcherInjected = true;

    const OVERLAY_CSS = `
        :host { all: initial; }
        .backdrop {
            position: fixed; inset: 0;
            display: flex; align-items: center; justify-content: center;
            background: rgba(0, 0, 0, 0.45);
            backdrop-filter: blur(2px);
            font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
        }
        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, 116px);
            gap: 12px;
            padding: 24px;
            max-width: 90vw;
            max-height: 86vh;
            overflow: auto;
            background: rgba(32, 33, 36, 0.94);
            border-radius: 16px;
            box-shadow: 0 12px 48px rgba(0, 0, 0, 0.55);
        }
        .card {
            width: 116px; height: 116px;
            box-sizing: border-box;
            display: flex; flex-direction: column;
            align-items: center; justify-content: center;
            gap: 10px; padding: 12px;
            border-radius: 12px;
            border: 2px solid transparent;
            background: rgba(255, 255, 255, 0.06);
            cursor: pointer;
            transition: background 0.08s ease, border-color 0.08s ease;
        }
        .card:hover { background: rgba(255, 255, 255, 0.12); }
        .card.selected {
            border-color: #8ab4f8;
            background: rgba(138, 180, 248, 0.20);
        }
        .icon {
            width: 32px; height: 32px;
            display: flex; align-items: center; justify-content: center;
            border-radius: 6px;
            background: rgba(255, 255, 255, 0.10);
            color: #e8eaed; font-size: 16px; font-weight: 600;
            overflow: hidden; flex: none;
        }
        .icon img { width: 32px; height: 32px; object-fit: contain; }
        .title {
            font-size: 12px; line-height: 1.3;
            color: #e8eaed; text-align: center;
            width: 100%;
            display: -webkit-box;
            -webkit-line-clamp: 2; -webkit-box-orient: vertical;
            overflow: hidden;
            word-break: break-word;
        }
    `;

    let host = null;
    let shadow = null;
    let grid = null;

    let tabs = [];
    let selected = 0;
    let open = false;

    function ensureOverlay() {
        if (host) return;
        host = document.createElement('div');
        host.style.cssText = 'all: initial; position: fixed; inset: 0; z-index: 2147483647;';
        shadow = host.attachShadow({ mode: 'open' });

        const style = document.createElement('style');
        style.textContent = OVERLAY_CSS;
        shadow.appendChild(style);

        const backdrop = document.createElement('div');
        backdrop.className = 'backdrop';
        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) cancel();
        });

        grid = document.createElement('div');
        grid.className = 'grid';
        backdrop.appendChild(grid);
        shadow.appendChild(backdrop);
    }

    // Build a URL into the browser's cached-favicon service for a page. This is
    // served from cache by the extension, so it never hits the network and
    // cannot trigger the Local Network Access permission prompt.
    function faviconUrl(pageUrl) {
        if (!pageUrl) return '';
        try {
            const url = new URL(chrome.runtime.getURL('/_favicon/'));
            url.searchParams.set('pageUrl', pageUrl);
            url.searchParams.set('size', '32');
            return url.toString();
        } catch (e) {
            return '';
        }
    }

    function render() {
        grid.innerHTML = '';
        tabs.forEach((tab, i) => {
            const card = document.createElement('div');
            card.className = 'card' + (i === selected ? ' selected' : '');

            const icon = document.createElement('div');
            icon.className = 'icon';
            const fallback = (tab.title || tab.url || '?').trim().charAt(0).toUpperCase() || '?';
            // Load favicons from the browser's cache via the _favicon API rather
            // than fetching them live. Fetching a tab's favicon directly (e.g. a
            // localhost dev server) would issue a local-network request and
            // trigger the "Access other apps and services on this device" prompt.
            const faviconSrc = faviconUrl(tab.url);
            if (faviconSrc) {
                const img = document.createElement('img');
                img.src = faviconSrc;
                img.alt = '';
                img.addEventListener('error', () => { icon.textContent = fallback; });
                icon.appendChild(img);
            } else {
                icon.textContent = fallback;
            }

            const title = document.createElement('div');
            title.className = 'title';
            title.textContent = tab.title || tab.url || 'Tab';

            card.appendChild(icon);
            card.appendChild(title);
            // Use mousedown so the switch fires before any blur/focus shuffle.
            card.addEventListener('mousedown', (e) => { e.preventDefault(); commit(i); });
            card.addEventListener('mouseenter', () => { selected = i; updateSelection(); });
            grid.appendChild(card);
        });
    }

    function updateSelection() {
        const cards = shadow.querySelectorAll('.card');
        cards.forEach((c, i) => c.classList.toggle('selected', i === selected));
        if (cards[selected]) cards[selected].scrollIntoView({ block: 'nearest' });
    }

    function columnCount() {
        if (!grid) return 1;
        const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean);
        return Math.max(cols.length, 1);
    }

    function move(delta) {
        if (!open || tabs.length === 0) return;
        selected = (selected + delta + tabs.length) % tabs.length;
        updateSelection();
    }

    function moveRow(dir) {
        if (!open || tabs.length === 0) return;
        const next = selected + dir * columnCount();
        if (next >= 0 && next < tabs.length) {
            selected = next;
            updateSelection();
        }
    }

    function show(data) {
        ensureOverlay();
        tabs = Array.isArray(data.tabs) ? data.tabs : [];
        selected = Math.max(0, Math.min(data.initialIndex || 0, tabs.length - 1));
        open = true;
        render();
        if (!host.isConnected) document.documentElement.appendChild(host);
        host.style.display = 'block';
        window.addEventListener('keydown', onKeyDown, true);
        window.addEventListener('keyup', onKeyUp, true);
        window.addEventListener('blur', onBlur, true);
    }

    function hide() {
        open = false;
        if (host) host.style.display = 'none';
        window.removeEventListener('keydown', onKeyDown, true);
        window.removeEventListener('keyup', onKeyUp, true);
        window.removeEventListener('blur', onBlur, true);
    }

    function commit(index) {
        if (!open) return;
        const idx = typeof index === 'number' ? index : selected;
        const tab = tabs[idx];
        hide();
        safeSend({ type: 'commit', tabId: tab ? tab.id : undefined });
    }

    function cancel() {
        if (!open) return;
        hide();
        safeSend({ type: 'cancel' });
    }

    function safeSend(message) {
        try {
            chrome.runtime.sendMessage(message);
        } catch (e) {
            // Extension context can be invalidated mid-session (e.g. reload).
        }
    }

    function onKeyDown(e) {
        if (!open) return;
        switch (e.key) {
            case 'Tab':
                e.preventDefault(); e.stopPropagation();
                move(e.shiftKey ? -1 : 1);
                break;
            case 'ArrowRight':
                e.preventDefault(); e.stopPropagation(); move(1); break;
            case 'ArrowLeft':
                e.preventDefault(); e.stopPropagation(); move(-1); break;
            case 'ArrowDown':
                e.preventDefault(); e.stopPropagation(); moveRow(1); break;
            case 'ArrowUp':
                e.preventDefault(); e.stopPropagation(); moveRow(-1); break;
            case 'Enter':
            case ' ':
                e.preventDefault(); e.stopPropagation(); commit(); break;
            case 'Escape':
                e.preventDefault(); e.stopPropagation(); cancel(); break;
        }
    }

    function onKeyUp(e) {
        if (!open) return;
        // Releasing the modifier commits the highlighted tab (Alt-Tab feel).
        if (e.key === 'Alt' || e.key === 'Meta') {
            e.preventDefault();
            commit();
        }
    }

    function onBlur() {
        // If the window loses focus while the overlay is up, dismiss it without
        // switching so we never leave a stuck overlay behind.
        if (open) cancel();
    }

    chrome.runtime.onMessage.addListener((msg) => {
        if (!msg) return;
        if (msg.type === 'show') show(msg);
        else if (msg.type === 'advance') move(1);
        else if (msg.type === 'hide') hide();
    });
})();
