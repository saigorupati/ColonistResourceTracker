// ==UserScript==
// @name         Colonist.io Resource Tracker with Toggle
// @namespace    http://tampermonkey.net/
// @version      1.2
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
    // Store player colors, resources, and thefts
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
    const builtSnippet = "built a";
    const boughtSnippet = " bought ";
    const tradeBankGaveSnippet = "gave bank";
    const tradeBankTookSnippet = "and took";
    const discardedSnippet = "discarded";
    const tradedWithSnippet = "gave";
    const stoleFromYouSnippet = "from you";
    let thefts = [];
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
            // Resource cells
            let total = 0;
            RESOURCE_NAMES.forEach(res => {
                const td = document.createElement('td');
                const actual = resources[res] || 0;
                total += actual;
                const shown = Math.max(0, actual);
                const countSpan = document.createElement('span');
                countSpan.className = 'resource-tbl-count' + (shown === 0 ? ' resource-tbl-count-zero' : '');
                countSpan.textContent = shown;
                td.appendChild(countSpan);
                const possibleGain = getPossibleTheftCount(player, res);
                const possibleLoss = getPossibleTheftLossCount(player, res);
                if (possibleGain > 0) {
                    const hint = document.createElement('span');
                    hint.className = 'resource-tbl-hint resource-tbl-hint-gain';
                    hint.textContent = `+${possibleGain}?`;
                    hint.title = 'Possible extra cards from unresolved robber steals';
                    td.appendChild(hint);
                }
                if (possibleLoss > 0 && actual > 0) {
                    const hint = document.createElement('span');
                    hint.className = 'resource-tbl-hint resource-tbl-hint-loss';
                    hint.textContent = `-${Math.min(possibleLoss, actual)}?`;
                    hint.title = 'Possible cards lost to unresolved robber steals';
                    td.appendChild(hint);
                }
                row.appendChild(td);
            });
            // Add total cell
            const totalCell = document.createElement('td');
            totalCell.textContent = total;
            row.appendChild(totalCell);
            tbody.appendChild(row);
        });
        table.appendChild(tbody);
        container.appendChild(table);
    }


    // --------------------
    // 4. RESOURCE MANAGEMENT
    // --------------------
    // Create an empty resource object
    function createEmptyResourceObj() {
        return { lumber: 0, ore: 0, brick: 0, wool: 0, grain: 0, total: 0 };
    }

    // Add resources to a player's total
    function addResources(player, resourceList) {
        if (!playerResources[player]) {
            playerResources[player] = createEmptyResourceObj();
        }
        resourceList.forEach(res => {
            if (RESOURCE_NAMES.includes(res)) {
                playerResources[player][res]++;
                playerResources[player].total++;
            }
        });
        // Ensure total is only the sum of RESOURCE_NAMES
        playerResources[player].total = RESOURCE_NAMES.reduce((sum, res) => sum + (playerResources[player][res] || 0), 0);
        updateTrackerUI();
    }

    // Remove resources from a player's total
    function removeResources(player, resourceCosts) {
        if (!playerResources[player]) return;
        Object.entries(resourceCosts).forEach(([res, count]) => {
            if (RESOURCE_NAMES.includes(res)) {
                const before = playerResources[player][res] || 0;
                const toRemove = Math.min(before, count);
                playerResources[player][res] = before - toRemove;
            }
        });
        // Ensure total is only the sum of RESOURCE_NAMES
        playerResources[player].total = RESOURCE_NAMES.reduce((sum, res) => sum + (playerResources[player][res] || 0), 0);
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
        reviewThefts();
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
        reviewThefts();
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
        reviewThefts();
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

        // Resolve any unresolved thefts of this resource first, so the victim
        // counts below include stolen cards of the monopolized resource
        thefts.forEach(theft => {
            if (!theft.solved && theft.what[resource] > 0 &&
                playerResources[theft.victim] && playerResources[theft.victim][resource] > 0) {
                playerResources[theft.victim][resource]--;
                playerResources[theft.victim].total--;
                if (!playerResources[theft.stealer]) playerResources[theft.stealer] = createEmptyResourceObj();
                playerResources[theft.stealer][resource] = (playerResources[theft.stealer][resource] || 0) + 1;
                playerResources[theft.stealer].total++;
                theft.solved = true;
            }
        });
        thefts = thefts.filter(t => !t.solved);

        // Ensure monopoly player exists in playerResources
        if (!playerResources[playerName]) {
            playerResources[playerName] = createEmptyResourceObj();
        }

        // Strip the monopolized resource from every other player
        let totalTaken = 0;
        Object.keys(playerResources).forEach(otherPlayer => {
            if (otherPlayer === playerName) return;
            const currentAmount = playerResources[otherPlayer][resource] || 0;
            if (currentAmount > 0) {
                totalTaken += currentAmount;
                playerResources[otherPlayer][resource] = 0;
                playerResources[otherPlayer].total = RESOURCE_NAMES.reduce((sum, res) => {
                    return sum + (playerResources[otherPlayer][res] || 0);
                }, 0);
            }
        });

        // The message amount comes from the server, so it is the ground truth
        // for what the monopoly player gained; our per-victim estimate may drift.
        playerResources[playerName][resource] = (playerResources[playerName][resource] || 0) + amount;
        playerResources[playerName].total = RESOURCE_NAMES.reduce((sum, res) => {
            return sum + (playerResources[playerName][res] || 0);
        }, 0);

        if (totalTaken !== amount) {
            console.warn(`[parseStoleAllOf] Tracked victims held ${totalTaken} ${resource} but message reports ${amount} stolen.`);
        }

        updateTrackerUI();
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
        reviewThefts();
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
        reviewThefts();
    }

    // Parse messages where resources are stolen from the current user
    function parseStoleFromYou(part) {
        if (!part.textContent.includes(stoleFromYouSnippet)) return;

        // Get the stealing player's name (colored span)
        const usernameSpan = part.querySelector(USERNAME_SPAN_SELECTOR);
        if (!usernameSpan) return;
        const stealer = cleanPlayerName(usernameSpan.textContent);

        // Get the resource shown (img alt)
        const resource = getResourceAlts(part)[0];

        if (!stealer || !resource || !currentUserName) return;

        // The stealer definitely gained this resource; the victim's count may
        // have drifted, so clamp the subtraction at zero instead of dropping the event.
        if (!playerResources[currentUserName]) {
            playerResources[currentUserName] = createEmptyResourceObj();
        }
        if (playerResources[currentUserName][resource] > 0) {
            playerResources[currentUserName][resource]--;
            playerResources[currentUserName].total--;
        }
        if (!playerResources[stealer]) {
            playerResources[stealer] = createEmptyResourceObj();
        }
        playerResources[stealer][resource] = (playerResources[stealer][resource] || 0) + 1;
        playerResources[stealer].total++;
        reviewThefts();
        updateTrackerUI();
    }

    // Parse messages where the current user steals from another player
    function parseYouStoleFrom(part) {
        if (!part.textContent.trim().startsWith("You stole")) return;

        // Get the resource (img alt)
        const resource = getResourceAlts(part)[0];

        // Get the victim's name (colored span)
        const victimSpan = part.querySelector(USERNAME_SPAN_SELECTOR);
        if (!victimSpan) return;
        const victim = cleanPlayerName(victimSpan.textContent);

        if (!resource || !victim || !currentUserName) return;

        // Subtract from victim (clamped at zero), add to current user
        if (playerResources[victim] && playerResources[victim][resource] > 0) {
            playerResources[victim][resource]--;
            playerResources[victim].total--;
        }
        if (!playerResources[currentUserName]) {
            playerResources[currentUserName] = createEmptyResourceObj();
        }
        playerResources[currentUserName][resource] = (playerResources[currentUserName][resource] || 0) + 1;
        playerResources[currentUserName].total++;
        reviewThefts();
        updateTrackerUI();
    }

    // Parse generic steal messages
    function parseStoleFrom(part) {
        if (part.textContent.includes(stoleFromYouSnippet)) return;
        if (!part.textContent.includes("stole") || !part.textContent.includes("from")) return;

        // Example: <span style="color:#223697">Sal</span> stole <img ...> from <span style="color:#E09742">Malti</span>
        const innerSpans = part.querySelectorAll(USERNAME_SPAN_SELECTOR);
        if (innerSpans.length < 2) return;
        const stealer = cleanPlayerName(innerSpans[0].textContent);
        const victim = cleanPlayerName(innerSpans[1].textContent);
        // Only track if both are not the current user
        if (!stealer || !victim || stealer === currentUserName || victim === currentUserName) return;
        // Only track if both exist in playerResources
        if (!playerResources[stealer] || !playerResources[victim]) return;
        // Only track if the stolen card is hidden (card back); known resources are handled elsewhere
        if (getResourceAlts(part).length > 0) return;
        // Take a snapshot of victim's resources at this time
        const what = {};
        RESOURCE_NAMES.forEach(res => what[res] = playerResources[victim][res] || 0);
        thefts.push({ stealer, victim, what, solved: false });
        // Resolve immediately if already determinate and render the +1?/-1?
        // hints now, rather than waiting for the next game event to redraw.
        reviewThefts();
    }

    // A resource is still a candidate for an unresolved theft only if the
    // snapshot had it AND the victim still holds at least one (same test Rule 2
    // uses to rule candidates out). Narrowing here keeps the +n?/-n? hints in
    // sync with the evidence instead of stuck on the frozen snapshot.
    function isTheftCandidate(theft, resource) {
        return !theft.solved && theft.what[resource] > 0 &&
            playerResources[theft.victim] && playerResources[theft.victim][resource] > 0;
    }

    // Get the count of possible theft losses for a player/resource
    function getPossibleTheftLossCount(player, resource) {
        let possible = 0;
        thefts.forEach(theft => {
            if (theft.victim === player && isTheftCandidate(theft, resource)) {
                possible++;
            }
        });
        return possible;
    }

    // Returns the number of possible extra resources a player could have for a resource due to unresolved thefts
    function getPossibleTheftCount(player, resource) {
        let possible = 0;
        thefts.forEach(theft => {
            if (theft.stealer === player && isTheftCandidate(theft, resource)) {
                possible++;
            }
        });
        return possible;
    }

    // Call this after any resource change to try to resolve unknown thefts
    function reviewThefts() {
        // Try to resolve thefts if only one possible resource left for a theft
        thefts.forEach(theft => {
            if (theft.solved) return;
            if (!playerResources[theft.victim]) {
                theft.solved = true; // Victim no longer tracked; theft is unresolvable
                return;
            }
            // Edge case: victim has only one resource type but multiple cards of it
            const possibleResources = RESOURCE_NAMES.filter(res => theft.what[res] > 0);
            if (possibleResources.length === 1) {
                const res = possibleResources[0];
                // The stolen card is certainly `res`, so the stealer definitely
                // gained one — credit it even if the victim's tracked count has
                // drifted to 0. Only decrement the victim when we actually can.
                if (playerResources[theft.victim][res] > 0) {
                    playerResources[theft.victim][res]--;
                    playerResources[theft.victim].total--;
                }
                if (!playerResources[theft.stealer]) playerResources[theft.stealer] = createEmptyResourceObj();
                playerResources[theft.stealer][res] = (playerResources[theft.stealer][res] || 0) + 1;
                playerResources[theft.stealer].total++;
                theft.solved = true;
                return;
            }
            // Edge case: victim spent or gained resources before theft resolved
            // If any resource in theft.what is now 0 for victim, remove it from possibleResources
            let stillPossible = possibleResources.filter(res => playerResources[theft.victim][res] > 0);
            if (stillPossible.length === 1) {
                const res = stillPossible[0];
                playerResources[theft.victim][res]--;
                playerResources[theft.victim].total--;
                if (!playerResources[theft.stealer]) playerResources[theft.stealer] = createEmptyResourceObj();
                playerResources[theft.stealer][res] = (playerResources[theft.stealer][res] || 0) + 1;
                playerResources[theft.stealer].total++;
                theft.solved = true;
                return;
            }
            // Edge case: victim has spent everything the snapshot said they had;
            // the theft can never be resolved, so discard it instead of letting
            // it pollute the (+n)/(-n) hints forever
            if (stillPossible.length === 0) {
                theft.solved = true;
                return;
            }
            // Edge case: resource counts go negative (should not happen)
            RESOURCE_NAMES.forEach(res => {
                if (playerResources[theft.victim] && playerResources[theft.victim][res] < 0) playerResources[theft.victim][res] = 0;
                if (playerResources[theft.stealer] && playerResources[theft.stealer][res] < 0) playerResources[theft.stealer][res] = 0;
            });
        });
        // Remove solved thefts
        thefts = thefts.filter(t => !t.solved);
        updateTrackerUI();
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
