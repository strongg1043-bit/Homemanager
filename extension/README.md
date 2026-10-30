# Home Anchor Chrome extension

Manifest V3 toolbar extension for opening the Home Anchor app quickly.

- Toolbar popup: open the dashboard (focuses an existing tab if one is open), open a new tab, or copy the link.
- Right-click menu: "Open Home Anchor".
- Shortcut: `Alt+Shift+H` opens the popup.

## Load it locally

1. Go to `chrome://extensions` and enable **Developer mode**.
2. Click **Load unpacked** and select this `extension/` folder.

The app URL lives in `config.js`.

## Today's chores

Sign in from the popup with your Home Anchor email and password. Children see their own active chores; parents see the whole household. The list matches the app's "Today's Missions" (pending, accepted, needs-retry and awaiting-review tasks). The extension stores only a Firebase refresh token in `chrome.storage.local`, never the password.

Before it works, set `FIREBASE_API_KEY` in `config.js` (same value as `VITE_FIREBASE_API_KEY`). It's a public web identifier, not a secret.
