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

    // --------------------
    // 1. STYLE INJECTION
    // --------------------
    // Inject Roboto font and custom table styles for the tracker UI
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
    const CHAT_CONTAINER_CLASS = 'pJOx4Tg4n9S8O1RM16YT';
    const RESOURCE_NAMES = ['lumber','brick','wool', 'grain', 'ore',];
    const playerResources = {}; // { playerName: { lumber: x, ore: x, ... } }

    // --------------------
    // 3. UI CREATION
    // --------------------
    // Create the toggle button for showing/hiding the tracker
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

    // Create the main tracker panel
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

    // Update the tracker UI with the latest resource data
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
        // Add Total header
        const totalHeader = document.createElement('th');
        totalHeader.className = 'resource-tbl-cell';
        totalHeader.textContent = 'Total';
        headerRow.appendChild(totalHeader);
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
            let total = 0;
            RESOURCE_NAMES.forEach(res => {
                const td = document.createElement('td');
                td.className = 'resource-tbl-cell';
                const actual = resources[res] || 0;
                total += actual;
                const possibleGain = getPossibleTheftCount(player, res);
                const possibleLoss = getPossibleTheftLossCount(player, res);
                let text = `${Math.max(0, actual)}`;
                if (possibleGain > 0) text += ` (+${possibleGain})`;
                if (possibleLoss > 0 && actual > 0) text += ` (-${Math.min(possibleLoss, actual)})`;
                td.textContent = text;
                row.appendChild(td);
            });
            // Add total cell
            const totalCell = document.createElement('td');
            totalCell.className = 'resource-tbl-cell';
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
    // Setup an observer for new chat messages
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

    // Clean and normalize player names
    function cleanPlayerName(raw) {
        return raw
            ? raw.trim().replace(/[\s:]+$/, '')
            : "Unknown";
    }

    // Parse initial placement messages to set up players and resources
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

    // Parse received resources messages
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

    // Parse building messages (cities, roads, settlements)
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

    // Parse development card purchase messages
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

    // Parse trade with bank messages
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

    // Parse monopoly card messages (steal resources)
    function parseStoleAllOf(msg) {
        // Handle monopoly card: "<player> stole <number> <resource>" or with <img alt="resource">
        let text = msg.textContent;
        let playerName, amount, resource;
        // Try to match the original text format
        let match = text.match(/(.+?) stole (\d+) (\w+)/i);
        if (match) {
            playerName = match[1].trim();
            amount = parseInt(match[2], 10);
            resource = match[3].toLowerCase();
            console.log('[parseStoleAllOf] matched text:', { playerName, amount, resource });
        } else {
            // Try to match the format with an <img> tag for the resource
            const span = msg.querySelector('span');
            console.log('[parseStoleAllOf] span:', span);
            if (span) {
                const img = span.querySelector('img[alt]');
                console.log('[parseStoleAllOf] img:', img);
                if (img) {
                    resource = img.getAttribute('alt').toLowerCase();
                    const beforeImg = span.textContent.match(/(.+?) stole (\d+)/i);
                    if (beforeImg) {
                        playerName = beforeImg[1].trim();
                        amount = parseInt(beforeImg[2], 10);
                        console.log('[parseStoleAllOf] matched img:', { playerName, amount, resource });
                    }
                }
            }
        }
        console.log('[parseStoleAllOf] final values:', { playerName, amount, resource });
        if (!RESOURCE_NAMES.includes(resource) || !playerName || isNaN(amount)) {
            console.warn('[parseStoleAllOf] invalid monopoly event:', { playerName, amount, resource });
            return;
        }

        // --- IMPROVED LOGIC: resolve all unresolved thefts for this resource ---
        // For each unresolved theft where the victim lost this resource, resolve it as this resource
        console.log('[parseStoleAllOf] thefts before resolving:', JSON.parse(JSON.stringify(thefts)));
        thefts.forEach(theft => {
            if (!theft.solved && theft.what[resource] > 0 && playerResources[theft.victim][resource] > 0) {
                console.log('[parseStoleAllOf] resolving theft:', theft);
                playerResources[theft.victim][resource]--;
                playerResources[theft.victim].total--;
                if (!playerResources[theft.stealer]) playerResources[theft.stealer] = createEmptyResourceObj();
                playerResources[theft.stealer][resource] = (playerResources[theft.stealer][resource] || 0) + 1;
                playerResources[theft.stealer].total++;
                theft.solved = true;
            }
        });
        console.log('[parseStoleAllOf] thefts after resolving:', JSON.parse(JSON.stringify(thefts)));
        console.log('[parseStoleAllOf] playerResources before monopoly:', JSON.parse(JSON.stringify(playerResources)));

        // Subtract all of this resource from all other players and count total taken
        let totalTaken = 0;
        Object.keys(playerResources).forEach(otherPlayer => {
            if (otherPlayer !== playerName) {
                const taken = playerResources[otherPlayer][resource] || 0;
                totalTaken += taken;
                playerResources[otherPlayer].total -= taken;
                if (playerResources[otherPlayer].total < 0) playerResources[otherPlayer].total = 0;
                playerResources[otherPlayer][resource] = 0;
                console.log(`[parseStoleAllOf] ${otherPlayer} lost ${taken} ${resource}`);
            }
        });
        if (!playerResources[playerName]) {
            playerResources[playerName] = createEmptyResourceObj();
        }
        // Add the actual amount shown in the message (should match totalTaken, but use message for robustness)
        playerResources[playerName][resource] = (playerResources[playerName][resource] || 0) + amount;
        playerResources[playerName].total = RESOURCE_NAMES.reduce((sum, res) => sum + (playerResources[playerName][res] || 0), 0);
        console.log('[parseStoleAllOf] playerResources after monopoly:', JSON.parse(JSON.stringify(playerResources)));
        updateTrackerUI();
    }

    // Parse discarded resources messages
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

    // Parse trade messages between players
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

    // Parse messages where resources are stolen from the current user
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

    // Parse generic steal messages
    function parseStoleFrom(msg) {
        if (msg.textContent.includes(stoleFromYouSnippet)) return;
        if (!msg.textContent.includes("stole") || !msg.textContent.includes("from")) return;

        // Example: <span><span style="font-weight:600;word-break:break-all;color:#223697">Sal</span> stole <img ...> from <span style="font-weight:600;word-break:break-all;color:#E09742">Malti</span></span>
        const span = msg.querySelector('span');
        if (!span) return;
        const innerSpans = span.querySelectorAll('span');
        if (innerSpans.length < 2) return;
        const stealer = cleanPlayerName(innerSpans[0].innerText);
        const victim = cleanPlayerName(innerSpans[1].innerText);
        // Only track if both are not the current user
        if (!stealer || !victim || stealer === currentUserName || victim === currentUserName) return;
        // Only track if both exist in playerResources
        if (!playerResources[stealer] || !playerResources[victim]) return;
        // Get the resource (should be card back, so unknown)
        const img = span.querySelector('img');
        const resource = img ? img.alt?.toLowerCase() : null;
        // Only track if resource is unknown (card back)
        if (resource && RESOURCE_NAMES.includes(resource)) return; // If resource is known, handled elsewhere
        // Take a snapshot of victim's resources at this time
        const what = {};
        RESOURCE_NAMES.forEach(res => what[res] = playerResources[victim][res] || 0);
        thefts.push({ stealer, victim, what, solved: false });
    }

    // Get the count of possible theft losses for a player/resource
    function getPossibleTheftLossCount(player, resource) {
        let possible = 0;
        thefts.forEach(theft => {
            if (!theft.solved && theft.victim === player && theft.what[resource] > 0) {
                possible++;
            }
        });
        return possible;
    }

    // Returns the number of possible extra resources a player could have for a resource due to unresolved thefts
    function getPossibleTheftCount(player, resource) {
        let possible = 0;
        thefts.forEach(theft => {
            if (!theft.solved && theft.stealer === player && theft.what[resource] > 0) {
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
            // Edge case: victim has only one resource type but multiple cards of it
            const possibleResources = RESOURCE_NAMES.filter(res => theft.what[res] > 0);
            if (possibleResources.length === 1) {
                const res = possibleResources[0];
                if (playerResources[theft.victim][res] > 0) {
                    playerResources[theft.victim][res]--;
                    playerResources[theft.victim].total--;
                    if (!playerResources[theft.stealer]) playerResources[theft.stealer] = createEmptyResourceObj();
                    playerResources[theft.stealer][res] = (playerResources[theft.stealer][res] || 0) + 1;
                    playerResources[theft.stealer].total++;
                }
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
            // Edge case: resource counts go negative (should not happen)
            RESOURCE_NAMES.forEach(res => {
                if (playerResources[theft.victim][res] < 0) playerResources[theft.victim][res] = 0;
                if (playerResources[theft.stealer][res] < 0) playerResources[theft.stealer][res] = 0;
            });
        });
        // Remove solved thefts
        thefts = thefts.filter(t => !t.solved);
        updateTrackerUI();
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
