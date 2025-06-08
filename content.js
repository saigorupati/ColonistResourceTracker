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
                const possible = actual + getPossibleTheftCount(player, res);
                td.textContent = possible > actual ? `${actual} (${possible})` : `${actual}`;
                row.appendChild(td);
            });
            tbody.appendChild(row);
        });
        table.appendChild(tbody);

        container.appendChild(table);
    }

    function addResources(player, resourceList) {
        // log('addResources', player, resourceList);
        if (!playerResources[player]) {
            playerResources[player] = { lumber: 0, ore: 0, brick: 0, wool: 0, grain: 0 };
        }

        resourceList.forEach(res => {
            if (RESOURCE_NAMES.includes(res)) {
                playerResources[player][res]++;
            }
        });

        updateTrackerUI();
    }

    function removeResources(player, resourceCosts) {
        // log('removeResources', player, resourceCosts);
        if (!playerResources[player]) return;
        Object.entries(resourceCosts).forEach(([res, count]) => {
            if (RESOURCE_NAMES.includes(res)) {
                playerResources[player][res] = Math.max(0, (playerResources[player][res] || 0) - count);
            }
        });
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
        });;

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
                playerResources[otherPlayer][resource] = 0;
            }
        });

        // Add the total stolen amount to the stealing player
        if (!playerResources[playerName]) {
            playerResources[playerName] = { lumber: 0, ore: 0, brick: 0, wool: 0, grain: 0 };
        }
        playerResources[playerName][resource] = (playerResources[playerName][resource] || 0) + amount;

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
            if (!playerResources[stealer]) {
                playerResources[stealer] = { lumber: 0, ore: 0, brick: 0, wool: 0, grain: 0 };
            }
            playerResources[stealer][resource] = (playerResources[stealer][resource] || 0) + 1;
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
            if (!playerResources[currentUserName]) {
                playerResources[currentUserName] = { lumber: 0, ore: 0, brick: 0, wool: 0, grain: 0 };
            }
            playerResources[currentUserName][resource] = (playerResources[currentUserName][resource] || 0) + 1;
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

        if (possible.length === 0) return; // nothing to steal

        // Check for existing unresolved theft between these players
        let theft = thefts.find(t => !t.solved && t.who.stealer === stealer && t.who.victim === victim);

        if (possible.length === 1) {
            // Only one possible, transfer directly and resolve any existing theft
            transferResource(victim, stealer, possible[0]);
            if (theft) theft.solved = true;
        } else {
            // If theft exists, update possible resources
            if (theft) {
                // Remove impossible resources
                for (const res of Object.keys(theft.what)) {
                    if (!possible.includes(res)) {
                        delete theft.what[res];
                    }
                }
                // If only one remains after update, resolve
                const remaining = Object.keys(theft.what);
                if (remaining.length === 1) {
                    transferResource(victim, stealer, remaining[0]);
                    theft.solved = true;
                }
            } else {
                // Record as new unknown theft
                thefts.push({
                    who: { stealer, victim },
                    what: Object.fromEntries(possible.map(res => [res, 1])),
                    solved: false
                });
            }
        }
    }

    // Call this after any resource change to try to resolve unknown thefts
    function reviewThefts() {
        for (const theft of thefts) {
            if (theft.solved) continue;
            const { stealer, victim } = theft.who;

            // Remove impossible resources (victim has 0)
            const toRemove = [];
            for (const res of Object.keys(theft.what)) {
                if ((playerResources[victim]?.[res] || 0) === 0) {
                    toRemove.push(res);
                }
            }
            toRemove.forEach(res => delete theft.what[res]);

            // If only one possible resource remains, resolve the theft
            const possible = Object.keys(theft.what);
            if (possible.length === 1) {
                const resource = possible[0];
                if (playerResources[victim]?.[resource] > 0) {
                    transferResource(victim, stealer, resource);
                    theft.solved = true;
                }
            } else {
                // If victim has fewer cards than unresolved thefts, remove this theft
                const victimTotal = Object.values(playerResources[victim] || {}).reduce((a, b) => a + b, 0);
                const theftCount = possible.length;
                if (victimTotal < theftCount) {
                    theft.solved = true; // Mark as solved (cannot resolve)
                }
            }
        }

        // Remove solved thefts
        thefts = thefts.filter(t => !t.solved);
    }

    // Helper to transfer a resource
    function transferResource(from, to, resource) {
        // log('transferResource', from, to, resource);

        if (!playerResources[from] || !playerResources[to]) return;
        if (playerResources[from][resource] > 0) {
            playerResources[from][resource]--;
            playerResources[to][resource] = (playerResources[to][resource] || 0) + 1;
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
