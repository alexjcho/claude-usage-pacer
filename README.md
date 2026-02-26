# Claude Usage Pacer

A Chrome extension that tells you whether you're ahead or behind your Claude usage pace — at a glance from the toolbar, or in detail on the usage page.

## Why

Claude's usage limits reset on a rolling window, but the usage page only shows a progress bar with no sense of *rate*. Are you burning through your quota too fast, or do you have room to keep going? This extension answers that by overlaying pace markers and showing a live badge in the toolbar.

## Features

### Toolbar badge

Your pace status is always visible as a `+N` or `-N` badge on the extension icon — no need to visit the usage page.

| State | Badge | Color |
|---|---|---|
| Ahead of pace (burning fast) | `+8` | Red |
| Behind / on pace | `-3` | Green |
| Not logged in / error | *(empty)* | — |

A service worker polls the Claude usage API every 15 minutes using your existing session cookies.

### Badge tracking mode

Control which usage bucket the toolbar badge tracks:

| Mode | Behavior |
|---|---|
| **Auto (urgent)** | Shows whichever bucket has the higher delta — the one you should worry about. *(default)* |
| **Session (5hr)** | Always tracks the 5-hour session bar |
| **Weekly** | Always tracks the 7-day weekly bar |

Click the extension icon to change the mode. If a selected bucket isn't available in the API response, the badge falls back to the other one.

### Usage page pace lines

When you visit `claude.ai/settings/usage`, the content script overlays amber pace lines on each progress bar showing where steady consumption would place you right now. A label like "+12% ahead" (red) or "−5% behind" (green) appears next to each bar.

### Active hours pacing

Weekly pace calculations are weighted by **active hours** instead of raw clock time. The pace line only advances during your waking hours (default 8 AM – midnight) and freezes overnight. Without this, sleeping for 8 hours would make you look ~5% "behind" by morning.

Click the extension icon to configure:

- **Badge tracks** — which bucket the badge shows (Auto / Session / Weekly)
- **Active hours** — toggle on/off (off falls back to linear 24/7 pacing)
- **Start / End hour** — your typical active window

Session bars (5-hour cycle) always use linear pacing since they're too short for sleep to matter.

## Install

1. Clone or download this repo
2. Open `chrome://extensions` in Chrome
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked** and select this folder

The badge starts working immediately. Visit [claude.ai/settings/usage](https://claude.ai/settings/usage) for the full pace line overlay.

## Permissions

| Permission | Why |
|---|---|
| `storage` | Save your preferences (tracking mode, active hours) |
| `cookies` | Read `lastActiveOrg` cookie to identify your Claude organization |
| `alarms` | Schedule the 15-minute polling interval |
| `host_permissions` (`claude.ai`) | Credentialed fetch to the usage API |

## License

MIT
