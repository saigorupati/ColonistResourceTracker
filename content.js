// ==UserScript==
// @name         Colonist.io Resource Tracker with Toggle
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  Track each player's resources with a toggleable panel
// @match        https://colonist.io/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // --------------------
    // 1. STYLE INJECTION
    // --------------------
    // Inject Roboto font and custom table styles for the tracker UI
    const style = document.createElement('style');
    style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap');
    #resource-tracker-panel, #resource-tracker-panel * { font-family: 'Roboto', sans-serif; box-sizing: border-box; }
    #resource-tracker-panel {
        position: fixed;
        top: 40px;
        left: 20px;
        z-index: 9999;
        background: rgba(22, 25, 32, 0.94);
        color: #e9ecf1;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 10px;
        box-shadow: 0 6px 24px rgba(0, 0, 0, 0.45);
        font-size: 13px;
        min-width: 240px;
        max-height: 80vh;
        overflow: hidden;
        user-select: none;
        backdrop-filter: blur(6px);
    }
    #resource-tracker-header {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 7px 8px 7px 12px;
        cursor: grab;
        background: rgba(255, 255, 255, 0.05);
        border-bottom: 1px solid rgba(255, 255, 255, 0.07);
        font-weight: 700;
        letter-spacing: 0.3px;
    }
    #resource-tracker-header:active { cursor: grabbing; }
    #resource-tracker-collapse {
        margin-left: auto;
        border: none;
        background: transparent;
        color: #9aa3b2;
        cursor: pointer;
        font-size: 13px;
        line-height: 1;
        padding: 3px 6px;
        border-radius: 5px;
    }
    #resource-tracker-collapse:hover { background: rgba(255, 255, 255, 0.1); color: #fff; }
    #resource-tracker-content {
        overflow-y: auto;
        max-height: calc(80vh - 34px);
        padding: 6px 8px 8px;
    }
    #resource-tracker-empty { color: #8b93a3; font-size: 12px; padding: 6px 4px; }
    .resource-tbl { width: 100%; border-collapse: collapse; }
    .resource-tbl th { padding: 2px 4px 6px; font-weight: 500; text-align: center; }
    .resource-tbl-resource-icon { width: 17px; height: 24px; vertical-align: middle; }
    .resource-tbl-resource-emoji { font-size: 15px; }
    .resource-tbl-total-header { font-size: 11px; color: #9aa3b2; }
    .resource-tbl-row td { padding: 5px 4px; text-align: center; vertical-align: middle; }
    .resource-tbl-row:nth-child(2n-1) td { background: rgba(255, 255, 255, 0.045); }
    .resource-tbl-row td:first-child { border-radius: 6px 0 0 6px; text-align: left; }
    .resource-tbl-row td:last-child { border-radius: 0 6px 6px 0; font-weight: 700; }
    .resource-tbl-row-you td { background: rgba(255, 214, 90, 0.09) !important; }
    .resource-tbl-player-col-cell { display: flex; align-items: center; min-width: 0; }
    .resource-tbl-player-col-cell-color {
        width: 4px;
        height: 16px;
        border-radius: 2px;
        flex: none;
        border: 1px solid rgba(255, 255, 255, 0.25);
    }
    .resource-tbl-player-name {
        margin-left: 6px;
        font-weight: 700;
        max-width: 100px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .resource-tbl-count { font-weight: 500; }
    .resource-tbl-count-zero { color: #6d7585; }
    .resource-tbl-hint { display: block; font-size: 10px; line-height: 1.2; }
    .resource-tbl-hint-gain { color: #7fd188; }
    .resource-tbl-hint-loss { color: #e08585; }
    `;
    document.head.appendChild(style);

    // --------------------
    // 2. GLOBAL VARIABLES
    // --------------------
    // Store player colors and resources
    let currentUserName = localStorage.getItem('colonistResourceTrackerUser');
    if (!currentUserName) {
        currentUserName = prompt('Enter your Colonist.io username for resource tracking:');
        if (currentUserName) {
            localStorage.setItem('colonistResourceTrackerUser', currentUserName);
        }
    }
    const playerColors = {}; // { playerName: color }
    const initialPlacementDoneMessage = "received starting resources";
    const receivedResourcesSnippet = "got";
    const yearOfPlentySnippet = "took from bank";
    const builtSnippet = "built a";
    const boughtSnippet = " bought ";
    const tradeBankGaveSnippet = "gave bank";
    const tradeBankTookSnippet = "and took";
    const discardedSnippet = "discarded";
    const tradedWithSnippet = "gave";
    const stoleFromYouSnippet = "from you";
    // Colonist class names are "<prefix>-<build hash>" (e.g. feedMessage-O8TLknGe);
    // the hash changes every build, so match on the stable prefix only.
    const FEED_MESSAGE_SELECTOR = '[class*="feedMessage-"]';
    const MESSAGE_PART_SELECTOR = '[class*="messagePart-"]';
    const SCROLL_ITEM_SELECTOR = '[class*="scrollItemContainer-"]';
    const USERNAME_SPAN_SELECTOR = 'span[style*="color"]';
    const RESOURCE_NAMES = ['lumber','brick','wool', 'grain', 'ore',];
    const playerResources = {}; // { playerName: { lumber: x, ore: x, ... } }
    // Colonist's card icon URLs are content-hashed and change per build, so
    // they can't be hardcoded; harvest them from feed messages as they appear
    // and fall back to emoji until then.
    const RESOURCE_EMOJI = { lumber: '\u{1FAB5}', brick: '\u{1F9F1}', wool: '\u{1F411}', grain: '\u{1F33E}', ore: '\u{1FAA8}' };
    const ICONS_KEY = 'colonistResourceTrackerIcons';
    const POS_KEY = 'colonistResourceTrackerPos';
    const COLLAPSE_KEY = 'colonistResourceTrackerCollapsed';
    let resourceIconUrls = {};
    try {
        resourceIconUrls = JSON.parse(localStorage.getItem(ICONS_KEY)) || {};
    } catch (e) {
        resourceIconUrls = {};
    }

    // --------------------
    // 3. UI CREATION
    // --------------------
    // Let the user drag the panel around by its header; position is saved
    function makeDraggable(panel, handle) {
        let startX, startY, startLeft, startTop, dragging = false;
        handle.addEventListener('mousedown', e => {
            if (e.target.id === 'resource-tracker-collapse') return;
            dragging = true;
            startX = e.clientX;
            startY = e.clientY;
            const rect = panel.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;
            e.preventDefault();
        });
        document.addEventListener('mousemove', e => {
            if (!dragging) return;
            const left = Math.min(Math.max(0, startLeft + e.clientX - startX), window.innerWidth - 60);
            const top = Math.min(Math.max(0, startTop + e.clientY - startY), window.innerHeight - 40);
            panel.style.left = left + 'px';
            panel.style.top = top + 'px';
        });
        document.addEventListener('mouseup', () => {
            if (!dragging) return;
            dragging = false;
            const rect = panel.getBoundingClientRect();
            localStorage.setItem(POS_KEY, JSON.stringify({ left: rect.left, top: rect.top }));
        });
    }

    // Create the main tracker panel with a draggable header and collapse toggle
    function createTrackerPanel() {
        const panel = document.createElement('div');
        panel.id = 'resource-tracker-panel';
        panel.innerHTML = `
            <div id="resource-tracker-header">
                <span>Resource Tracker</span>
                <button id="resource-tracker-collapse" title="Collapse">▾</button>
            </div>
            <div id="resource-tracker-content"></div>`;
        document.body.appendChild(panel);

        // Restore saved position, clamped to the current viewport
        try {
            const pos = JSON.parse(localStorage.getItem(POS_KEY));
            if (pos) {
                panel.style.left = Math.min(Math.max(0, pos.left), window.innerWidth - 60) + 'px';
                panel.style.top = Math.min(Math.max(0, pos.top), window.innerHeight - 40) + 'px';
            }
        } catch (e) { /* ignore corrupt saved position */ }

        const content = panel.querySelector('#resource-tracker-content');
        const collapseBtn = panel.querySelector('#resource-tracker-collapse');
        const setCollapsed = collapsed => {
            content.style.display = collapsed ? 'none' : '';
            collapseBtn.textContent = collapsed ? '▸' : '▾';
            collapseBtn.title = collapsed ? 'Expand' : 'Collapse';
            localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '');
        };
        collapseBtn.onclick = () => setCollapsed(content.style.display !== 'none');
        if (localStorage.getItem(COLLAPSE_KEY) === '1') setCollapsed(true);

        makeDraggable(panel, panel.querySelector('#resource-tracker-header'));
        updateTrackerUI();
    }

    // Update the tracker UI with the latest resource data
    function updateTrackerUI() {
        const container = document.getElementById('resource-tracker-content');
        if (!container) return;
        container.innerHTML = '';

        const players = Object.entries(playerResources);
        if (players.length === 0) {
            const empty = document.createElement('div');
            empty.id = 'resource-tracker-empty';
            empty.textContent = 'Waiting for game events…';
            container.appendChild(empty);
            return;
        }

        const table = document.createElement('table');
        table.className = 'resource-tbl';
        // Header row
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        headerRow.appendChild(document.createElement('th')); // player column
        // Resource headers: real card icon once seen in the feed, emoji until then
        RESOURCE_NAMES.forEach(res => {
            const th = document.createElement('th');
            if (resourceIconUrls[res]) {
                const img = document.createElement('img');
                img.src = resourceIconUrls[res];
                img.alt = res;
                img.title = res;
                img.className = 'resource-tbl-resource-icon';
                th.appendChild(img);
            } else {
                const span = document.createElement('span');
                span.className = 'resource-tbl-resource-emoji';
                span.textContent = RESOURCE_EMOJI[res];
                span.title = res;
                th.appendChild(span);
            }
            headerRow.appendChild(th);
        });
        // Total header
        const totalHeader = document.createElement('th');
        totalHeader.className = 'resource-tbl-total-header';
        totalHeader.textContent = 'Σ';
        totalHeader.title = 'Total';
        headerRow.appendChild(totalHeader);
        thead.appendChild(headerRow);
        table.appendChild(thead);
        // Body rows
        const tbody = document.createElement('tbody');
        players.forEach(([player, resources]) => {
            const row = document.createElement('tr');
            row.className = 'resource-tbl-row';
            if (player === currentUserName) row.classList.add('resource-tbl-row-you');
            // Player cell with color bar and name
            const nameCell = document.createElement('td');
            const playerColCell = document.createElement('div');
            playerColCell.className = 'resource-tbl-player-col-cell';
            // Color bar
            const colorBar = document.createElement('span');
            colorBar.className = 'resource-tbl-player-col-cell-color';
            colorBar.style.backgroundColor = playerColors[player] || '#888';
            playerColCell.appendChild(colorBar);
            // Player name
            const nameSpan = document.createElement('span');
            nameSpan.className = 'resource-tbl-player-name';
            nameSpan.textContent = player;
            nameSpan.title = player;
            playerColCell.appendChild(nameSpan);
            nameCell.appendChild(playerColCell);
            row.appendChild(nameCell);
            // Resource cells: show the guaranteed count (lo); if the possible
            // maximum (hi) is higher, mark the uncertain slack with a "+n?" hint.
            RESOURCE_NAMES.forEach(res => {
                const td = document.createElement('td');
                const lo = resources.lo[res] || 0;
                const hi = resources.hi[res] || 0;
                const countSpan = document.createElement('span');
                countSpan.className = 'resource-tbl-count' + (lo === 0 ? ' resource-tbl-count-zero' : '');
                countSpan.textContent = lo;
                td.appendChild(countSpan);
                if (hi > lo) {
                    const hint = document.createElement('span');
                    hint.className = 'resource-tbl-hint resource-tbl-hint-gain';
                    hint.textContent = `+${hi - lo}?`;
                    hint.title = 'Possible extra cards from unresolved robber steals';
                    td.appendChild(hint);
                }
                row.appendChild(td);
            });
            // Total cell: the exact hand size (known precisely even when card
            // types are not).
            const totalCell = document.createElement('td');
            totalCell.textContent = resources.total;
            row.appendChild(totalCell);
            tbody.appendChild(row);
        });
        table.appendChild(tbody);
        container.appendChild(table);
    }


    // --------------------
    // 4. RESOURCE MANAGEMENT (interval model)
    // --------------------
    // A robber steal takes a random card whose type we usually can't see, so a
    // player's holding of each resource is a RANGE, not a single number. We track
    // per resource a guaranteed minimum `lo` and a possible maximum `hi`, plus an
    // exact `total` (every event — gain, spend, steal — changes the total by a
    // known amount, even when the card's type is unknown). This keeps totals
    // correct and never invents cards, while honestly showing type uncertainty.

    function emptyCounts() {
        const o = {};
        RESOURCE_NAMES.forEach(r => o[r] = 0);
        return o;
    }
    function createEmptyResourceObj() {
        return { lo: emptyCounts(), hi: emptyCounts(), total: 0 };
    }
    function ensurePlayer(player) {
        if (!playerResources[player]) playerResources[player] = createEmptyResourceObj();
        return playerResources[player];
    }

    // Arc-consistency: a resource can't exceed the total left after every other
    // resource's minimum, nor fall below the total minus every other's maximum.
    // Tightening after each event collapses ranges back to certainty when the
    // surrounding facts force it.
    function tightenPlayer(P) {
        for (let iter = 0; iter < 3; iter++) {
            RESOURCE_NAMES.forEach(r => {
                let sumLoOthers = 0, sumHiOthers = 0;
                RESOURCE_NAMES.forEach(x => { if (x !== r) { sumLoOthers += P.lo[x]; sumHiOthers += P.hi[x]; } });
                P.hi[r] = Math.min(P.hi[r], P.total - sumLoOthers);
                P.lo[r] = Math.max(P.lo[r], P.total - sumHiOthers, 0);
                if (P.hi[r] < 0) P.hi[r] = 0;
                if (P.lo[r] < 0) P.lo[r] = 0;
                if (P.lo[r] > P.hi[r]) P.lo[r] = P.hi[r]; // drift safety
            });
        }
    }

    // Add known cards (dice income, trades received, Year of Plenty, etc.)
    function addResources(player, resourceList) {
        const P = ensurePlayer(player);
        resourceList.forEach(res => {
            if (RESOURCE_NAMES.includes(res)) { P.lo[res]++; P.hi[res]++; P.total++; }
        });
        updateTrackerUI();
    }

    // Remove known cards (builds, dev-card buys, discards, trades/bank given).
    // The card type is known, so both bounds and the total drop by the count.
    function removeResources(player, resourceCosts) {
        if (!playerResources[player]) return;
        const P = playerResources[player];
        Object.entries(resourceCosts).forEach(([res, count]) => {
            if (RESOURCE_NAMES.includes(res)) {
                P.lo[res] = Math.max(0, P.lo[res] - count);
                P.hi[res] = Math.max(0, P.hi[res] - count);
                P.total -= count;
            }
        });
        if (P.total < 0) P.total = 0;
        tightenPlayer(P);
        updateTrackerUI();
    }

    // A steal whose card we CAN see (to/from the current user): exact transfer.
    function stealKnown(victim, stealer, res) {
        if (!RESOURCE_NAMES.includes(res)) return;
        const V = ensurePlayer(victim), S = ensurePlayer(stealer);
        V.lo[res] = Math.max(0, V.lo[res] - 1);
        V.hi[res] = Math.max(0, V.hi[res] - 1);
        V.total = Math.max(0, V.total - 1);
        S.lo[res]++; S.hi[res]++; S.total++;
        tightenPlayer(V); tightenPlayer(S);
        updateTrackerUI();
    }

    // A hidden steal between two other players: exactly one card moves, but its
    // type is only known to be one the victim could hold. Total is exact for
    // both; the type stays a range (widening the possibilities) until later
    // events pin it down.
    function stealHidden(victim, stealer) {
        const V = ensurePlayer(victim), S = ensurePlayer(stealer);
        const cands = RESOURCE_NAMES.filter(r => V.hi[r] > 0);
        if (cands.length === 0) return; // victim has no cards we can account for
        V.total -= 1; S.total += 1;
        if (cands.length === 1) {
            const r = cands[0];
            V.lo[r] = Math.max(0, V.lo[r] - 1); V.hi[r] -= 1;
            S.lo[r]++; S.hi[r]++;
        } else {
            // victim may have lost any candidate; stealer may have gained any
            cands.forEach(r => { V.lo[r] = Math.max(0, V.lo[r] - 1); });
            cands.forEach(r => { S.hi[r] += 1; });
        }
        tightenPlayer(V); tightenPlayer(S);
        updateTrackerUI();
    }

    // Monopoly: the server tells us how many cards the player collected, which
    // is ground truth. Every other player ends with zero of that resource; we
    // charge each their guaranteed amount first, then spread the remainder over
    // whoever still had possible (uncertain) copies.
    function applyMonopoly(mono, res, amount) {
        if (!RESOURCE_NAMES.includes(res)) return;
        const M = ensurePlayer(mono);
        const victims = Object.keys(playerResources).filter(p => p !== mono);
        const loss = {};
        let remaining = amount;
        victims.forEach(p => { const P = playerResources[p]; loss[p] = Math.min(P.lo[res], remaining); remaining -= loss[p]; });
        for (const p of victims) {
            if (remaining <= 0) break;
            const P = playerResources[p];
            const add = Math.min(P.hi[res] - loss[p], remaining);
            loss[p] += add; remaining -= add;
        }
        victims.forEach(p => {
            const P = playerResources[p];
            P.lo[res] = 0; P.hi[res] = 0;
            P.total = Math.max(0, P.total - loss[p]);
            tightenPlayer(P);
        });
        M.lo[res] += amount; M.hi[res] += amount; M.total += amount;
        tightenPlayer(M);
        if (remaining > 0) {
            console.warn(`[applyMonopoly] ${remaining} ${res} unaccounted — victim tracking had drifted before the monopoly.`);
        }
        updateTrackerUI();
    }


    // --------------------
    // 5. CHAT MESSAGE HANDLING
    // --------------------
    // Messages processed once by element identity (an insertion can fire
    // mutations at several tree levels) and once by feed position (the
    // virtual scroller destroys and recreates rows as the user scrolls).
    const processedMessages = new WeakSet();
    // data-index is assigned once per feed item and stays stable for the life
    // of the game, so dedupe on it globally. The previous WeakMap keyed by the
    // scroller element broke on scroll: the virtual scroller destroys and
    // recreates rows, and each recreated element started with an empty seen-set,
    // so already-counted messages (e.g. "got"/received) were added again and
    // every player's totals crept upward.
    const seenFeedIndices = new Set();

    function isDuplicateMessage(msg) {
        const item = msg.closest(SCROLL_ITEM_SELECTOR);
        const index = item ? item.getAttribute('data-index') : null;
        if (index !== null) {
            if (seenFeedIndices.has(index)) return true;
            seenFeedIndices.add(index);
            return false;
        }
        // No feed index (rare) — fall back to element identity so a node that
        // fires several mutations at once is still only processed once.
        if (processedMessages.has(msg)) return true;
        processedMessages.add(msg);
        return false;
    }

    function processMessage(msg) {
        if (isDuplicateMessage(msg)) return;
        handleNewChatMessage(msg);
    }

    // Setup an observer for new chat messages. The feed container's class
    // hash changes between builds, so observe the whole body and filter for
    // feed messages instead of depending on a specific container class.
    function setupObserver() {
        if (!document.body) {
            setTimeout(setupObserver, 1000);
            return;
        }

        // Process messages already in the DOM (e.g. script loaded mid-game)
        document.querySelectorAll(FEED_MESSAGE_SELECTOR).forEach(processMessage);

        const observer = new MutationObserver(mutations => {
            for (const mutation of mutations) {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType !== Node.ELEMENT_NODE) return;
                    if (node.matches(FEED_MESSAGE_SELECTOR)) processMessage(node);
                    node.querySelectorAll(FEED_MESSAGE_SELECTOR).forEach(processMessage);
                });
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });
        console.log("Resource tracker initialized.");
    }

    // The message text lives in a messagePart span next to the avatar image;
    // scoping all queries to it keeps avatar <img alt="bot"> etc. out of parsing.
    function getMessagePart(msg) {
        if (msg.matches(MESSAGE_PART_SELECTOR)) return msg;
        return msg.querySelector(MESSAGE_PART_SELECTOR);
    }

    // Get resource names from img alt attributes within an element
    function getResourceAlts(root) {
        return Array.from(root.querySelectorAll('img'))
            .map(img => img.alt ? img.alt.toLowerCase() : '')
            .filter(alt => RESOURCE_NAMES.includes(alt));
    }

    // Clean and normalize player names
    function cleanPlayerName(raw) {
        return raw
            ? raw.trim().replace(/[\s:]+$/, '')
            : "Unknown";
    }

    // Every feed message renders usernames as colored spans, so learn player
    // colors from any message rather than only the starting-resources one.
    function registerPlayerColors(part) {
        part.querySelectorAll(USERNAME_SPAN_SELECTOR).forEach(span => {
            const name = cleanPlayerName(span.textContent);
            if (!name || name === "Unknown") return;
            const colorMatch = span.getAttribute('style').match(/color:\s*(#[0-9A-Fa-f]{6}|#[0-9A-Fa-f]{3}|rgba?\([^)]+\))/);
            if (colorMatch) {
                playerColors[name] = colorMatch[1];
            }
        });
    }

    // Cache resource card icon URLs from feed messages for the panel header
    function captureResourceIcons(part) {
        let changed = false;
        part.querySelectorAll('img').forEach(img => {
            const alt = img.alt ? img.alt.toLowerCase() : '';
            if (RESOURCE_NAMES.includes(alt) && resourceIconUrls[alt] !== img.src) {
                resourceIconUrls[alt] = img.src;
                changed = true;
            }
        });
        if (changed) {
            localStorage.setItem(ICONS_KEY, JSON.stringify(resourceIconUrls));
            updateTrackerUI();
        }
    }

    // Parse initial placement messages to set up players and resources
    function parseInitialPlacement(part) {
        if (!part.textContent.includes(initialPlacementDoneMessage)) return;

        const usernameSpan = part.querySelector(USERNAME_SPAN_SELECTOR);
        let playerName = cleanPlayerName(usernameSpan ? usernameSpan.textContent : "");
        playerName = playerName.replace(/ received starting resources$/i, '');

        const resourceList = getResourceAlts(part);

        if (playerName && resourceList.length > 0) {
            addResources(playerName, resourceList);
        }
    }

    // Parse received resources messages
    function parseReceivedResources(part) {
        if (!part.textContent.includes(receivedResourcesSnippet)) return;
        if (part.textContent.includes("gave")) return; // Ignore trades
        if (part.textContent.includes(initialPlacementDoneMessage)) return; // Handled by parseInitialPlacement

        const usernameSpan = part.querySelector(USERNAME_SPAN_SELECTOR);
        const playerName = cleanPlayerName(usernameSpan ? usernameSpan.textContent : "");

        const resourceList = getResourceAlts(part);

        if (playerName && resourceList.length > 0) {
            addResources(playerName, resourceList);
        }
    }

    // Parse building messages (cities, roads, settlements)
    function parseBuilt(part) {
        if (!part.textContent.includes(builtSnippet)) return;

        const usernameSpan = part.querySelector(USERNAME_SPAN_SELECTOR);
        const playerName = cleanPlayerName(usernameSpan ? usernameSpan.textContent : "");

        // Define resource costs
        const costs = {
            city:     { grain: 2, ore: 3 },
            road:     { lumber: 1, brick: 1 },
            settlement: { lumber: 1, brick: 1, wool: 1, grain: 1 }
        };

        // Find the structure icon among the message images
        const builtType = Array.from(part.querySelectorAll('img'))
            .map(img => img.alt ? img.alt.toLowerCase() : '')
            .find(alt => costs[alt]);

        if (playerName && builtType) {
            removeResources(playerName, costs[builtType]);
        }
    }

    // Parse development card purchase messages
    function parseBought(part) {
        if (!part.textContent.includes(boughtSnippet)) return;

        const usernameSpan = part.querySelector(USERNAME_SPAN_SELECTOR);
        const playerName = cleanPlayerName(usernameSpan ? usernameSpan.textContent : "");

        // Define the cost for a development card
        const devCardCost = { wool: 1, grain: 1, ore: 1 };

        if (playerName) {
            removeResources(playerName, devCardCost);
        }
    }

    // Parse trade with bank messages
    function parseTradeBank(part) {
        if (!part.textContent.includes(tradeBankGaveSnippet) || !part.textContent.includes(tradeBankTookSnippet)) return;

        const usernameSpan = part.querySelector(USERNAME_SPAN_SELECTOR);
        const playerName = cleanPlayerName(usernameSpan ? usernameSpan.textContent : "");

        // Get all child nodes (text and images) of the message part
        const nodes = Array.from(part.childNodes);

        // Find indices for "gave bank" and "and took"
        let gaveIdx = -1, tookIdx = -1;
        nodes.forEach((node, idx) => {
            if (node.nodeType === Node.TEXT_NODE) {
                if (node.textContent.includes("gave bank")) gaveIdx = idx;
                if (node.textContent.includes("and took")) tookIdx = idx;
            }
        });
        if (gaveIdx === -1 || tookIdx === -1) return;

        // Collect given resources (between gaveIdx and tookIdx)
        const givenImgs = nodes.slice(gaveIdx + 1, tookIdx).filter(n => n.tagName === "IMG");
        const givenList = givenImgs
            .map(img => img.alt?.toLowerCase())
            .filter(alt => RESOURCE_NAMES.includes(alt));

        // Collect received resources (after tookIdx)
        const receivedImgs = nodes.slice(tookIdx + 1).filter(n => n.tagName === "IMG");
        const receivedList = receivedImgs
            .map(img => img.alt?.toLowerCase())
            .filter(alt => RESOURCE_NAMES.includes(alt));

        // Build resource cost object for given resources
        const givenCost = {};
        givenList.forEach(res => {
            givenCost[res] = (givenCost[res] || 0) + 1;
        });

        if (playerName) {
            if (givenList.length > 0) removeResources(playerName, givenCost);
            if (receivedList.length > 0) addResources(playerName, receivedList);
        }
    }

    // Parse monopoly card messages (steal resources)
    function parseStoleAllOf(part) {
        // Handle monopoly card: "<player> stole <number> <resource>" or with <img alt="resource">
        const text = part.textContent;
        if (!text.includes(" stole ")) return;

        let playerName, amount, resource;
        // Try to match the original text format
        let match = text.match(/(.+?) stole (\d+) (\w+)/i);
        if (match) {
            playerName = match[1].trim();
            amount = parseInt(match[2], 10);
            resource = match[3].toLowerCase();
        } else {
            // Try to match the format where the resource is shown as an <img>
            const resources = getResourceAlts(part);
            const beforeImg = text.match(/(.+?) stole (\d+)/i);
            if (resources.length > 0 && beforeImg) {
                playerName = beforeImg[1].trim();
                amount = parseInt(beforeImg[2], 10);
                resource = resources[0];
            }
        }
        if (!RESOURCE_NAMES.includes(resource) || !playerName || isNaN(amount)) {
            return; // Regular robber steals have no number, only monopoly does
        }

        applyMonopoly(playerName, resource, amount);
    }

    // Parse Year of Plenty: "<player> took from bank <res> <res>". Distinct from
    // a bank trade ("gave bank ... and took ..."), so match the exact phrase.
    function parseYearOfPlenty(part) {
        if (!part.textContent.includes(yearOfPlentySnippet)) return;
        const usernameSpan = part.querySelector(USERNAME_SPAN_SELECTOR);
        const playerName = cleanPlayerName(usernameSpan ? usernameSpan.textContent : "");
        const resourceList = getResourceAlts(part);
        if (playerName && resourceList.length > 0) {
            addResources(playerName, resourceList);
        }
    }

    // Parse discarded resources messages
    function parseDiscarded(part) {
        if (!part.textContent.includes(discardedSnippet)) return;

        const usernameSpan = part.querySelector(USERNAME_SPAN_SELECTOR);
        const playerName = cleanPlayerName(usernameSpan ? usernameSpan.textContent : "");

        const resourceList = getResourceAlts(part);

        // Build resource cost object for discarded resources
        const discardCost = {};
        resourceList.forEach(res => {
            discardCost[res] = (discardCost[res] || 0) + 1;
        });

        if (playerName && resourceList.length > 0) {
            removeResources(playerName, discardCost);
        }
    }

    // Parse trade messages between players
    function parseTradeWith(part) {
        if (!part.textContent.includes(tradedWithSnippet) || !part.textContent.includes("and got") || !part.textContent.includes("from")) return;

        // Get the two usernames (colored spans)
        const innerSpans = part.querySelectorAll(USERNAME_SPAN_SELECTOR);
        if (innerSpans.length < 2) return;
        const player1 = cleanPlayerName(innerSpans[0].textContent);
        const player2 = cleanPlayerName(innerSpans[1].textContent);

        // Get all child nodes of the message part
        const nodes = Array.from(part.childNodes);

        // Find indices for "gave", "and got", "from"
        let gaveIdx = -1, gotIdx = -1, fromIdx = -1;
        nodes.forEach((node, idx) => {
            if (node.nodeType === Node.TEXT_NODE) {
                if (node.textContent.includes("gave")) gaveIdx = idx;
                if (node.textContent.includes("and got")) gotIdx = idx;
                if (node.textContent.includes("from")) fromIdx = idx;
            }
        });
        if (gaveIdx === -1 || gotIdx === -1 || fromIdx === -1) return;

        // Resources given by player1 (between gaveIdx and gotIdx)
        const givenImgs = nodes.slice(gaveIdx + 1, gotIdx).filter(n => n.tagName === "IMG");
        const givenList = givenImgs.map(img => img.alt?.toLowerCase()).filter(alt => RESOURCE_NAMES.includes(alt));

        // Resources received by player1 (between gotIdx and fromIdx)
        const gotImgs = nodes.slice(gotIdx + 1, fromIdx).filter(n => n.tagName === "IMG");
        const gotList = gotImgs.map(img => img.alt?.toLowerCase()).filter(alt => RESOURCE_NAMES.includes(alt));

        // Build resource cost objects
        const givenCost = {};
        givenList.forEach(res => { givenCost[res] = (givenCost[res] || 0) + 1; });
        const gotCost = {};
        gotList.forEach(res => { gotCost[res] = (gotCost[res] || 0) + 1; });

        // Update resources for both players
        if (player1 && player2) {
            if (givenList.length > 0) removeResources(player1, givenCost);
            if (gotList.length > 0) addResources(player1, gotList);
            if (gotList.length > 0) removeResources(player2, gotCost);
            if (givenList.length > 0) addResources(player2, givenList);
        }
    }

    // Parse messages where resources are stolen from the current user. We see
    // our own stolen card, so the resource is known — an exact transfer.
    function parseStoleFromYou(part) {
        if (!part.textContent.includes(stoleFromYouSnippet)) return;

        const usernameSpan = part.querySelector(USERNAME_SPAN_SELECTOR);
        if (!usernameSpan) return;
        const stealer = cleanPlayerName(usernameSpan.textContent);
        const resource = getResourceAlts(part)[0];

        if (!stealer || !resource || !currentUserName) return;
        stealKnown(currentUserName, stealer, resource);
    }

    // Parse messages where the current user steals from another player. We see
    // the card we took, so the resource is known — an exact transfer.
    function parseYouStoleFrom(part) {
        if (!part.textContent.trim().startsWith("You stole")) return;

        const resource = getResourceAlts(part)[0];
        const victimSpan = part.querySelector(USERNAME_SPAN_SELECTOR);
        if (!victimSpan) return;
        const victim = cleanPlayerName(victimSpan.textContent);

        if (!resource || !victim || !currentUserName) return;
        stealKnown(victim, currentUserName, resource);
    }

    // Parse hidden steals between two other players. The card's type is unknown,
    // so exactly one card moves victim -> stealer with the type left uncertain.
    function parseStoleFrom(part) {
        if (part.textContent.includes(stoleFromYouSnippet)) return;
        if (!part.textContent.includes("stole") || !part.textContent.includes("from")) return;

        // Example: <span style="color:#223697">Sal</span> stole <img ...> from <span style="color:#E09742">Malti</span>
        const innerSpans = part.querySelectorAll(USERNAME_SPAN_SELECTOR);
        if (innerSpans.length < 2) return;
        const stealer = cleanPlayerName(innerSpans[0].textContent);
        const victim = cleanPlayerName(innerSpans[1].textContent);
        // Only track hidden steals between two other players; steals involving
        // the current user are revealed and handled by the parsers above.
        if (!stealer || !victim || stealer === currentUserName || victim === currentUserName) return;
        if (!playerResources[stealer] || !playerResources[victim]) return;
        // Only hidden (card-back) steals reach here; a shown resource means the
        // message is a known steal handled elsewhere.
        if (getResourceAlts(part).length > 0) return;
        stealHidden(victim, stealer);
    }

    // Call all parse functions for each new message
    function handleNewChatMessage(msg) {
        const part = getMessagePart(msg);
        if (!part) return;
        registerPlayerColors(part);
        captureResourceIcons(part);
        parseInitialPlacement(part);
        parseReceivedResources(part);
        parseBuilt(part);
        parseBought(part);
        parseTradeBank(part);
        parseYearOfPlenty(part);
        parseStoleAllOf(part);
        parseDiscarded(part);
        parseStoleFromYou(part);
        parseStoleFrom(part);
        parseTradeWith(part);
        parseYouStoleFrom(part);
    }

    // Run
    createTrackerPanel();
    setupObserver();
})();
