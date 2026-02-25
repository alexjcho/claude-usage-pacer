# Claude Usage Pacer

A Chrome extension that shows whether you're ahead or behind your Claude usage pace — both on the usage page and as a toolbar badge.

## Features

### Toolbar badge

The extension icon always shows your pace status as a `+N` or `-N` badge, so you never need to visit the usage page to know where you stand.

| State | Badge | Color |
|---|---|---|
| Ahead of pace (burning fast) | `+8` | Red |
| Behind / on pace | `-3` | Green |
| Not logged in / error | *(empty)* | — |

A service worker polls the Claude usage API every 15 minutes using your existing session cookies.

### Badge tracking mode (new in v2.1.0)

Control which usage bucket the toolbar badge tracks:

| Mode | Behavior |
|---|---|
| **Auto (urgent)** | Surfaces whichever bucket has the higher delta — the one you should worry about. Default. |
| **Session (5hr)** | Always tracks the 5-hour session bar |
| **Weekly** | Always tracks the 7-day weekly bar |

Click the extension icon to change the mode. If a selected bucket isn't available in the API response, the badge falls back to the other one.

### Usage page pace lines

When you visit `claude.ai/settings/usage`, the content script overlays amber pace lines on each progress bar showing where steady consumption would place you right now. A label like "+12% ahead" (red) or "−5% behind" (green) appears next to each bar.

### Active hours pacing

Weekly pace calculations are weighted by **active hours** instead of raw clock time. The pace line only advances during your waking hours (default 8 AM – midnight) and freezes overnight. Without this, sleeping for 8 hours would make you look ~5% "behind" by morning.

Click the extension icon to configure:

- **Badge tracks** — which bucket the badge shows (Auto / Session / Weekly)
- **Toggle** active hours pacing on/off (off falls back to linear 24/7 pacing)
- **Start / End** hour for your typical active window

Session bars (5-hour cycle) always use linear pacing since they're too short for sleep to matter.

## Install

1. Clone or download this repo
2. Open `chrome://extensions` in Chrome
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked** and select this folder

The badge starts working immediately. Visit [claude.ai/settings/usage](https://claude.ai/settings/usage) for the full pace line overlay.

## Permissions

- `storage` — save active hours preferences
- `cookies` — read `lastActiveOrg` cookie to identify your Claude organization
- `alarms` — schedule the 15-minute polling interval
- `host_permissions` for `claude.ai` — credentialed fetch to the usage API

## License

MIT
