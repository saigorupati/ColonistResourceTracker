# Colonist.io Resource Tracker

A Tampermonkey userscript that adds a toggleable panel to track each player's resources in real-time on [Colonist.io](https://colonist.io/).

## Features

- Tracks all players' resources based on in-game chat events.
- Handles trades, thefts, discards, Monopoly, and more.
- Shows possible resource counts when thefts are unresolved.
- Toggleable UI panel for convenience.

## Installation

1. Install [Tampermonkey](https://www.tampermonkey.net/) for your browser.
2. Click "Create a new script" and paste the contents of `content.js` from this repository.
3. Save the script and refresh your Colonist.io game page.

## Usage

- The resource tracker panel appears on the left side of the screen.
- Use the "Hide Tracker" button to toggle visibility.

## Limitations

- Relies on chat messages; may not be 100% accurate if messages are missed or the page is reloaded.
- Unresolved thefts are shown as possible extra resources.

## License

MIT

---

*This project is not affiliated with Colonist.io.*