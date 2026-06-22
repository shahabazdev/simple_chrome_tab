# simple_chrome_tab

Simple extension for chrome to switch between the last visited tab.

This extension is extremely simple, does not extract, store or uses any user data.

Author: [Edgar Bermudez]

## Contributing
If you want to contribute, please fork the repository and use a feature branch. Pull requests are warmly welcome.

Things you can help with:
- Adding a better icon
- Saving the tabs to disk and restoring them in future sessions
- Adding a shortcut to switch to next and previous tab
- Adding a shortcut to switch to a specific tab
- Adding a menu to change the shortcuts



## Usage

Hold **Alt** and tap **Q** to bring up an overlay showing every open tab in the
current window as a responsive grid of square cards (current tab first, then
most-recently-used order), much like the Windows Alt-Tab switcher.

While the overlay is up:

- **Tap Q** again (keep Alt held) to cycle the highlight to the next tab
- **Tab / Shift+Tab** or the **arrow keys** also move the highlight
- **Release Alt** (or press **Enter**) to switch to the highlighted tab
- **Click** any card to switch to that tab directly
- **Esc** (or click outside the grid) to close without switching

A quick Alt+Q then release acts as a classic "jump to the previous tab" toggle,
since the previous tab is pre-selected.

### Shortcuts
```
Alt + Q            - Open the tab switcher / cycle to the next tab
Release Alt / Enter - Switch to the highlighted tab
Tab / Shift+Tab    - Move highlight forward / backward
Arrow keys         - Move highlight within the grid
Esc                - Close without switching
```

> Note: browser pages such as `chrome://`, the Chrome Web Store and the PDF
> viewer don't allow extensions to draw an overlay. On those tabs Alt+Q falls
> back to jumping straight to your previous tab.

## Installation

Simply 
- clone the repo to your local drive
- go to your `chrome://extensions` and activate developer mode. 
- Upload the extension selecting the directory where you cloned this repo into
- Activate the extension simple chrome tab
- thats it, `Alt + Q` to switch away!
