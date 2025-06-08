# Colonist.io Resource Tracker

![image](https://github.com/user-attachments/assets/86491e78-9566-48c8-89b1-531fdb9a6fc6)


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

## How It Works

- Explorer parses the game transaction log in Colonist.io to keep track of which player has which resources. No data is used to determine this that isn't clearly visible in the game.
- The script listens to in-game chat messages to detect resource changes.
- It parses messages for trades, thefts, discards, Monopoly, and other events.
- Player resource counts are updated in real-time based on parsed events.
- Unresolved thefts are tracked, showing possible resource ranges until resolved.
- The UI panel displays each player's resources and updates automatically.

## Acknowledgements

This project was adapted from [glasperfan/explorer](https://github.com/glasperfan/explorer/tree/master).

## Limitations

- Relies on chat messages; may not be 100% accurate if messages are missed or the page is reloaded.
- Unresolved thefts are shown as possible extra resources.

## License

MIT

---

*This project is not affiliated with Colonist.io.*
