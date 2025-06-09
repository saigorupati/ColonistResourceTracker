// ==UserScript==
// @name         Colonist.io Resource Tracker with Toggle
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Track each player's resources with a toggleable panel
// @match        https://colonist.io/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // Inject Roboto font and custom table styles
    const style = document.createElement('style');
    style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap');
    * { font-family: 'Roboto', sans-serif !important; }
    #resource-tracker-panel { background: #fff; }
    .resource-tbl { position: relative; background: #fff; border: none; width: 100%; border-collapse: collapse; }
    .resource-tbl-header { border: none; }
    .resource-tbl-header .resource-tbl-cell { padding: 4px 7px 2px; }
    .resource-tbl-row { border: none; height: 3em; }
    .resource-tbl-row:nth-child(2n-1) { background-color: #eeeeee; }
    .resource-tbl-row:nth-child(2n) { background-color: #f9f9f9; }
    .resource-tbl-cell {
        border: none;
        box-sizing: unset;
        padding: 0 2px;
        text-align: center;
        line-height: normal;
        vertical-align: middle;
    }
    .resource-tbl-row > .resource-tbl-cell:first-child { text-align: left; }
    .resource-tbl-player-col-cell {
        border: none;
        display: inline-flex;
        padding: 0;
        align-items: center; 
        text-align: left;
        line-height: normal;
        height: 100%;
    }
    .resource-tbl-player-col-cell-color {
        width: 6px;
        min-height: 3em;
        height: 100%;
        background-color: #000;
        display: inline-block;
        border-radius: 2px;
        align-self: stretch;
    }
    .resource-tbl-player-name {
        margin: 0 10px 0 4px;
        font-weight: bold;
        text-align: left;
    }
    .resource-tbl-player-col-header {
        font-weight: 600;
        text-transform: uppercase;
        border: none;
        padding-left: 10px;
        font-size: 85%;
        text-align: left;
    }
    .resource-tbl-resource-icon { width: 24px; height: 36px; }
    `;
    document.head.appendChild(style);

    function log(...args) {
        console.log('[ResourceTracker]', ...args);
    }
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

    const CHAT_CONTAINER_CLASS = 'pJOx4Tg4n9S8O1RM16YT';
    const RESOURCE_NAMES = ['lumber','brick','wool', 'grain', 'ore',];
    const playerResources = {}; // { playerName: { lumber: x, ore: x, ... } }

    function createToggleButton() {
        const button = document.createElement('button');
        button.id = 'resource-toggle-btn';
        button.textContent = 'Hide Tracker';
        Object.assign(button.style, {
            position: 'fixed',
            top: '10px',
            left: '230px',
            zIndex: 9999,
            padding: '5px 10px',
            background: '#444',
            color: '#fff',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer',
            fontSize: '12px',
        });

        button.onclick = () => {
            const panel = document.getElementById('resource-tracker-panel');
            if (panel.style.display === 'none') {
                panel.style.display = 'block';
                button.textContent = 'Hide Tracker';
            } else {
                panel.style.display = 'none';
                button.textContent = 'Show Tracker';
            }
        };

        document.body.appendChild(button);
    }

    function createTrackerPanel() {
        const panel = document.createElement('div');
        panel.id = 'resource-tracker-panel';
        Object.assign(panel.style, {
            position: 'fixed',
            top: '40px',
            left: '20px',
            background: '#fff',
            color: '#000',
            padding: '10px',
            borderRadius: '10px',
            zIndex: 9999,
            fontFamily: 'Arial, sans-serif',
            fontSize: '14px',
            maxHeight: '80vh',
            overflowY: 'auto',
            minWidth: '200px',
            boxShadow: '0 0 10px rgba(0,0,0,0.5)',
        });

        panel.innerHTML = `<strong>Resource Tracker</strong><div id="resource-tracker-content" style="margin-top: 10px;"></div>`;
        document.body.appendChild(panel);
    }

    function updateTrackerUI() {
        const container = document.getElementById('resource-tracker-content');
        if (!container) return;

        container.innerHTML = '';

        const table = document.createElement('table');
        table.className = 'resource-tbl';

        // Header row
        const thead = document.createElement('thead');
        thead.className = 'resource-tbl-header';
        const headerRow = document.createElement('tr');

        // Player column header
        const nameHeader = document.createElement('th');
        nameHeader.className = 'resource-tbl-cell resource-tbl-player-col-header';
        nameHeader.textContent = 'Player';
        headerRow.appendChild(nameHeader);

        // Resource headers
        RESOURCE_NAMES.forEach(res => {
            const th = document.createElement('th');
            th.className = 'resource-tbl-cell';
            const img = document.createElement('img');
            img.src = `https://colonist.io/dist/images/card_${res}.svg`;
            img.alt = res;
            img.className = 'resource-tbl-resource-icon';
            th.appendChild(img);
            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        table.appendChild(thead);

        // Body rows
        const tbody = document.createElement('tbody');
        Object.entries(playerResources).forEach(([player, resources]) => {
            const row = document.createElement('tr');
            row.className = 'resource-tbl-row';

            // Player cell with color bar and name
            const nameCell = document.createElement('td');
            nameCell.className = 'resource-tbl-cell';
            const playerColCell = document.createElement('div');
            playerColCell.className = 'resource-tbl-player-col-cell';

            // Color bar
            const colorBar = document.createElement('span');
            colorBar.className = 'resource-tbl-player-col-cell-color';
            colorBar.style.backgroundColor = playerColors[player] || '#000';
            playerColCell.appendChild(colorBar);

            // Player name
            const nameSpan = document.createElement('span');
            nameSpan.style.color = playerColors[player] || '#000';
            nameSpan.className = 'resource-tbl-player-name';
            nameSpan.textContent = player;
            playerColCell.appendChild(nameSpan);

            nameCell.appendChild(playerColCell);
            row.appendChild(nameCell);

            // Resource cells
            RESOURCE_NAMES.forEach(res => {
                const td = document.createElement('td');
                td.className = 'resource-tbl-cell';
                const actual = resources[res] || 0;
                const possibleGain = getPossibleTheftCount(player, res);
                const possibleLoss = getPossibleTheftLossCount(player, res);
                let text = `${Math.max(0, actual)}`;
                if (possibleGain > 0) text += ` (+${possibleGain})`;
                if (possibleLoss > 0 && actual > 0) text += ` (-${Math.min(possibleLoss, actual)})`;
                td.textContent = text;
                row.appendChild(td);
            });
            tbody.appendChild(row);
        });
        table.appendChild(tbody);

        container.appendChild(table);
    }


    function createEmptyResourceObj() {
        return { lumber: 0, ore: 0, brick: 0, wool: 0, grain: 0, total: 0 };
    }


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

    function setupObserver() {
        const chatContainer = document.querySelector(`div.${CHAT_CONTAINER_CLASS}`);
        if (!chatContainer) {
            setTimeout(setupObserver, 1000);
            return;
        }

        const observer = new MutationObserver(mutations => {
            for (const mutation of mutations) {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        handleNewChatMessage(node);
                    }
                });
            }
        });

        observer.observe(chatContainer, { childList: true, subtree: true });
        console.log("Resource tracker initialized.");
    }

    function cleanPlayerName(raw) {
        return raw
            ? raw.trim().replace(/[\s:]+$/, '')
            : "Unknown";
    }

    function parseInitialPlacement(msg) {
        if (!msg.textContent.includes(initialPlacementDoneMessage)) return;

        // Find the inner span with the color style
        const usernameSpan = msg.querySelector('span span[style*="color"]');
        let playerName = cleanPlayerName(usernameSpan ? usernameSpan.innerText : "");
        playerName = playerName.replace(/ received starting resources$/i, '');

        // Extract color from style attribute using regex
        if (usernameSpan && usernameSpan.getAttribute('style')) {
            const style = usernameSpan.getAttribute('style');
            const colorMatch = style.match(/color:\s*(#[0-9A-Fa-f]{6}|#[0-9A-Fa-f]{3}|rgba?\([^)]+\))/);
            if (colorMatch) {
                playerColors[playerName] = colorMatch[1];
            }
        }

        // Get resources from img alt attributes
        const imgs = msg.querySelectorAll('img');
        const resourceList = Array.from(imgs)
            .map(img => img.alt?.toLowerCase())
            .filter(alt => RESOURCE_NAMES.includes(alt));

        if (playerName && resourceList.length > 0) {
            addResources(playerName, resourceList);
        }
    }

    function parseReceivedResources(msg) {
        if (!msg.textContent.includes(receivedResourcesSnippet)) return;
        if (msg.textContent.includes("gave")) return; // Ignore trades

        // Get the username (the inner span inside the message)
        const usernameSpan = msg.querySelector('span span');
        const playerName = cleanPlayerName(usernameSpan ? usernameSpan.innerText : "");

        // Get resources from img alt attributes
        const imgs = msg.querySelectorAll('img');
        const resourceList = Array.from(imgs)
            .map(img => img.alt?.toLowerCase())
            .filter(alt => RESOURCE_NAMES.includes(alt));

        if (playerName && resourceList.length > 0) {
            addResources(playerName, resourceList);
        }
    }

    function parseBuilt(msg) {
        if (!msg.textContent.includes(builtSnippet)) return;

        // Get the username (first span inside the message)
        const usernameSpan = msg.querySelector('span span');
        const playerName = cleanPlayerName(usernameSpan ? usernameSpan.innerText : "");

        // Get the built structure from img alt attribute
        const img = msg.querySelector('img[alt]');
        const builtType = img ? img.alt?.toLowerCase() : "";

        // Define resource costs
        const costs = {
            city:     { grain: 2, ore: 3 },
            road:     { lumber: 1, brick: 1 },
            settlement: { lumber: 1, brick: 1, wool: 1, grain: 1 }
        };

        if (playerName && costs[builtType]) {
            removeResources(playerName, costs[builtType]);
        }
        reviewThefts();
    }

    function parseBought(msg) {
        if (!msg.textContent.includes(boughtSnippet)) return;

        // Get the username (first span inside the message)
        const usernameSpan = msg.querySelector('span span');
        const playerName = cleanPlayerName(usernameSpan ? usernameSpan.innerText : "");

        // Define the cost for a development card
        const devCardCost = { wool: 1, grain: 1, ore: 1 };

        if (playerName) {
            removeResources(playerName, devCardCost);
        }
        reviewThefts();
    }

    function parseTradeBank(msg) {
        if (!msg.textContent.includes(tradeBankGaveSnippet) || !msg.textContent.includes(tradeBankTookSnippet)) return;

        // Get the username (first span inside the message)
        const usernameSpan = msg.querySelector('span span');
        const playerName = cleanPlayerName(usernameSpan ? usernameSpan.innerText : "");

        // Get the main span containing the trade text
        const tradeSpan = usernameSpan ? usernameSpan.parentElement : null;
        if (!tradeSpan) return;

        // Get all child nodes (text and images)
        const nodes = Array.from(tradeSpan.childNodes);

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

    function parseStoleAllOf(msg) {
        // Only handle monopoly card: "stole <number> <resource>"
        const regex = /(.+?) stole (\d+) (\w+)/i;
        const text = msg.textContent;
        const match = text.match(regex);
        if (!match) return;

        const playerName = match[1].trim();
        const amount = parseInt(match[2], 10);
        const resource = match[3].toLowerCase();

        if (!RESOURCE_NAMES.includes(resource) || !playerName || isNaN(amount)) return;

        // Mark as solved any unresolved thefts involving this resource
        thefts.forEach(theft => {
            if (!theft.solved && theft.what[resource]) {
                theft.solved = true;
            }
        });

        // Subtract all of this resource from all other players
        Object.keys(playerResources).forEach(otherPlayer => {
            if (otherPlayer !== playerName) {
                playerResources[otherPlayer].total -= playerResources[otherPlayer][resource];
                if (playerResources[otherPlayer].total < 0) playerResources[otherPlayer].total = 0;
                playerResources[otherPlayer][resource] = 0;
            }
        });
        if (!playerResources[playerName]) {
            playerResources[playerName] = createEmptyResourceObj();
        }
        playerResources[playerName][resource] = (playerResources[playerName][resource] || 0) + amount;
        playerResources[playerName].total += amount;

        reviewThefts();
        updateTrackerUI();
    }

    function parseDiscarded(msg) {
        if (!msg.textContent.includes(discardedSnippet)) return;

        // Get the username (first span inside the message)
        const usernameSpan = msg.querySelector('span span');
        const playerName = cleanPlayerName(usernameSpan ? usernameSpan.innerText : "");

        // Get discarded resources from img alt attributes
        const imgs = msg.querySelectorAll('img');
        const resourceList = Array.from(imgs)
            .map(img => img.alt?.toLowerCase())
            .filter(alt => RESOURCE_NAMES.includes(alt));

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

    function parseTradeWith(msg) {
        if (!msg.textContent.includes(tradedWithSnippet) || !msg.textContent.includes("and got") || !msg.textContent.includes("from")) return;

        // Get all inner spans (usernames)
        const innerSpans = msg.querySelectorAll('span span');
        if (innerSpans.length < 2) return;
        const player1 = cleanPlayerName(innerSpans[0].innerText);
        const player2 = cleanPlayerName(innerSpans[1].innerText);

        // Get all child nodes of the main span
        const tradeSpan = innerSpans[0].parentElement;
        const nodes = Array.from(tradeSpan.childNodes);

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

    function parseStoleFromYou(msg) {
        if (!msg.textContent.includes(stoleFromYouSnippet)) return;
        // log('parseStoleFromYou', msg.textContent);

        // Get the stealing player's name (inner span)
        const usernameSpan = msg.querySelector('span span');
        if (!usernameSpan) return;
        const stealer = cleanPlayerName(usernameSpan.innerText);

        // Get the resource shown (img alt)
        const img = msg.querySelector('img[alt]');
        const resource = img ? img.alt?.toLowerCase() : null;

        if (!stealer || !resource || !RESOURCE_NAMES.includes(resource) || !currentUserName) return;

        // Subtract one resource from current user, add to stealer
        if (playerResources[currentUserName] && playerResources[currentUserName][resource] > 0) {
            playerResources[currentUserName][resource]--;
            playerResources[currentUserName].total--;
            if (!playerResources[stealer]) {
                playerResources[stealer] = createEmptyResourceObj();
            }
            playerResources[stealer][resource] = (playerResources[stealer][resource] || 0) + 1;
            playerResources[stealer].total++;
            reviewThefts();
            updateTrackerUI();
        }
    }

    // Add this function
    function parseYouStoleFrom(msg) {
        if (!msg.textContent.startsWith("You stole")) return;

        // Get the resource (img alt)
        const img = msg.querySelector('img[alt]');
        const resource = img ? img.alt?.toLowerCase() : null;

        // Get the victim's name (inner span)
        const victimSpan = msg.querySelector('span span');
        if (!victimSpan) return;
        const victim = cleanPlayerName(victimSpan.innerText);

        if (!resource || !RESOURCE_NAMES.includes(resource) || !victim || !currentUserName) return;

        // Subtract from victim, add to current user
        if (playerResources[victim] && playerResources[victim][resource] > 0) {
            playerResources[victim][resource]--;
            playerResources[victim].total--;
            if (!playerResources[currentUserName]) {
                playerResources[currentUserName] = createEmptyResourceObj();
            }
            playerResources[currentUserName][resource] = (playerResources[currentUserName][resource] || 0) + 1;
            playerResources[currentUserName].total++;
            reviewThefts();
            updateTrackerUI();
        }
    }

    function parseStoleFrom(msg) {
        if (msg.textContent.includes(stoleFromYouSnippet)) return;
        if (!msg.textContent.includes("stole") || !msg.textContent.includes("from")) return;

        // Get both usernames from inner spans
        const innerSpans = msg.querySelectorAll('span span');
        if (innerSpans.length < 2) return;
        const stealer = cleanPlayerName(innerSpans[0].innerText);
        const victim = cleanPlayerName(innerSpans[1].innerText);

        if (!playerResources[stealer] || !playerResources[victim]) return;

        // Find all possible resources the victim could have lost
        const possible = RESOURCE_NAMES.filter(res => (playerResources[victim][res] || 0) > 0);

        // Move the log here, after variables are defined
        console.log('Adding theft:', { stealer, victim, possible });

        if (possible.length === 0) return; // nothing to steal

        if (possible.length === 1) {
            // Only one possible, transfer directly
            transferResource(victim, stealer, possible[0]);
        } else {
            // Always add a new theft record for each ambiguous theft
            thefts.push({
                who: { stealer, victim },
                what: Object.fromEntries(possible.map(res => [res, 1])),
                solved: false
            });
        }
    }

    function getPossibleTheftLossCount(player, resource) {
        let possible = 0;
        for (const theft of thefts) {
            if (!theft.solved && theft.who.victim === player && theft.what[resource]) {
                possible += theft.what[resource];
            }
        }
        // Cap possible loss at the actual resource count
        return Math.min(possible, (playerResources[player]?.[resource] || 0));
    }

    // Call this after any resource change to try to resolve unknown thefts
    function reviewThefts() {
        // For each player and resource, try to deduce thefts
        for (const player of Object.keys(playerResources)) {
            for (const resourceType of RESOURCE_NAMES) {
                const resourceCount = playerResources[player][resourceType] || 0;
                const theftCount = getPossibleTheftLossCount(player, resourceType);
                const total = resourceCount + theftCount;
                if (total < -1) {
                    throw new Error('Invalid state: ' + resourceType + ' ' + player + ' ' + resourceCount + ' ' + theftCount);
                }
                // The player stole a resource and spent it
                for (const theft of thefts) {
                    if (theft.solved) continue;
                    if (resourceCount === -1 && total === 0 && theft.who.stealingPlayer === player && theft.what[resourceType]) {
                        transferResource(theft.who.targetPlayer, player, resourceType);
                        theft.solved = true;
                    }
                    // The player had a resource stolen and the stealer spent it
                    if (resourceCount === 0 && total === -1 && theft.who.targetPlayer === player && theft.what[resourceType]) {
                        delete theft.what[resourceType];
                        const remaining = Object.keys(theft.what);
                        if (remaining.length === 1) {
                            transferResource(theft.who.targetPlayer, theft.who.stealingPlayer, remaining[0]);
                            theft.solved = true;
                        }
                        break;
                    }
                }
            }
        }
        // New logic: If a player has 0 of a resource, remove that resource from any thefts where they are the stealer
        for (const player of Object.keys(playerResources)) {
            for (const resourceType of RESOURCE_NAMES) {
                if ((playerResources[player][resourceType] || 0) === 0) {
                    for (const theft of thefts) {
                        if (theft.solved) continue;
                        if (theft.who.stealingPlayer === player && theft.what[resourceType]) {
                            delete theft.what[resourceType];
                            const remaining = Object.keys(theft.what);
                            if (remaining.length === 1) {
                                transferResource(theft.who.targetPlayer, theft.who.stealingPlayer, remaining[0]);
                                theft.solved = true;
                            }
                        }
                    }
                }
            }
        }
        // Remove impossible resources if none left in play
        for (const resourceType of RESOURCE_NAMES) {
            const resourceTotalInPlay = Object.values(playerResources).map(r => r[resourceType] || 0).reduce((a, b) => a + b, 0);
            if (resourceTotalInPlay === 0) {
                for (const theft of thefts) {
                    if (theft.solved) continue;
                    delete theft.what[resourceType];
                    const remaining = Object.keys(theft.what);
                    if (remaining.length === 1) {
                        transferResource(theft.who.targetPlayer, theft.who.stealingPlayer, remaining[0]);
                        theft.solved = true;
                    }
                }
            }
        }
        // New logic: If a player has only one nonzero resource and an unresolved theft, resolve it
        for (const theft of thefts) {
            if (theft.solved) continue;
            const victim = theft.who.targetPlayer || theft.who.victim;
            if (!victim || !playerResources[victim]) continue;
            // Find all nonzero resources for the victim
            const nonzero = RESOURCE_NAMES.filter(r => (playerResources[victim][r] || 0) > 0 && theft.what[r]);
            if (nonzero.length === 1) {
                // Only one possible, resolve it
                transferResource(victim, theft.who.stealingPlayer || theft.who.stealer, nonzero[0]);
                theft.solved = true;
            }
        }
        // Final logic: If the sum of actual + possible gains/losses does not match total, resolve ambiguity
        for (const player of Object.keys(playerResources)) {
            const actualTotal = RESOURCE_NAMES.reduce((sum, r) => sum + (playerResources[player][r] || 0), 0);
            let theftsForPlayer = thefts.filter(t => !t.solved && (t.who.targetPlayer === player || t.who.victim === player));
            if (theftsForPlayer.length === 0) continue;
            // For each theft, check if only one resource could possibly be the ambiguous card(s)
            for (const theft of theftsForPlayer) {
                const possibleResources = Object.keys(theft.what).filter(r => (playerResources[player][r] || 0) > 0);
                // If only one possible resource and the sum of actual + thefts matches total, resolve
                if (possibleResources.length === 1) {
                    transferResource(player, theft.who.stealingPlayer || theft.who.stealer, possibleResources[0]);
                    theft.solved = true;
                }
            }
        }
        // Remove solved thefts
        thefts = thefts.filter(t => !t.solved);
    }

    // Helper to transfer a resource
    function transferResource(from, to, resource) {
        if (!playerResources[from]) return;
        if (!playerResources[to]) {
            playerResources[to] = createEmptyResourceObj();
        }
        if ((playerResources[from][resource] || 0) > 0) {
            playerResources[from][resource]--;
            playerResources[from].total--;
            playerResources[to][resource] = (playerResources[to][resource] || 0) + 1;
            playerResources[to].total++;
            updateTrackerUI();
        }
    }

    // Returns the number of possible extra resources a player could have for a resource due to unresolved thefts
    function getPossibleTheftCount(player, resource) {
        let possible = 0;
        for (const theft of thefts) {
            if (!theft.solved && theft.who.stealer === player && theft.what[resource]) {
                possible += theft.what[resource];
            }
        }
        return possible;
    }

    // Call all parse functions for each new message
    function handleNewChatMessage(msg) {
        parseInitialPlacement(msg);
        parseReceivedResources(msg);
        parseBuilt(msg);
        parseBought(msg);
        parseTradeBank(msg);
        parseStoleAllOf(msg);
        parseDiscarded(msg);
        parseStoleFromYou(msg);
        parseStoleFrom(msg);
        parseTradeWith(msg);
        parseYouStoleFrom(msg);
    }

    // Run
    createTrackerPanel();
    createToggleButton();
    setupObserver();
})();
