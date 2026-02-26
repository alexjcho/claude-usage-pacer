# Claude Usage Pacer

A Chrome extension that tells you whether you're ahead or behind your Claude usage pace — at a glance from the toolbar, or in detail on the usage page.

## Why

Claude's usage limits reset on a rolling window, but the usage page only shows a progress bar with no sense of *rate*. Are you burning through your quota too fast, or do you have room to keep going? This extension answers that by overlaying pace markers on the usage page and showing a live two-bar icon in the toolbar.

## Features

### Two-bar toolbar icon

The extension icon dynamically shows two colored bars — **left for session (5h)** and **right for weekly (7d)** — so you can see both limits at a glance without opening anything.

Each bar is colored on a continuous gradient:

| Color | Meaning |
|---|---|
| Deep green | Well behind pace — lots of headroom |
| Light green | Comfortably behind pace |
| Yellow | Right on pace |
| Orange | Getting warm — ahead of pace |
| Red | Danger — approaching the limit |
| Gray | No data (inactive session or not logged in) |

A faint gauge arc frames the bars for visual identity. Hover over the icon for exact numbers (e.g., "Session +8% · Weekly -3%").

A service worker polls the Claude usage API every 15 minutes using your existing session cookies.

### Popup pace dashboard

Click the extension icon to see a detailed breakdown without visiting the usage page:

- **Progress bar** per metric — fill width shows utilization, fill color matches the toolbar gradient
- **Pace marker** — a thin white line on the bar showing where steady consumption would place you
- **Delta** — e.g., "+8% ahead" or "-3% behind", color-coded
- **Countdown** — time until the window resets (e.g., "2h 30m left", "3d 12h left")

The popup updates live if a poll fires while it's open.

### Usage page pace lines

When you visit `claude.ai/settings/usage`, the content script overlays amber pace lines on each progress bar showing where steady consumption would place you right now. A label like "+12% ahead" (red) or "-5% behind" (green) appears next to each bar.

### Active hours pacing

Weekly pace calculations are weighted by **active hours** instead of raw clock time. The pace line only advances during your waking hours (default 8 AM – midnight) and freezes overnight. Without this, sleeping for 8 hours would make you look ~5% "behind" by morning.

Configure in the popup:

- **Active hours** — toggle on/off (off falls back to linear 24/7 pacing)
- **Start / End hour** — your typical active window

Session bars (5-hour cycle) always use linear pacing since they're too short for sleep to matter.

## Install

1. Clone or download this repo
2. Open `chrome://extensions` in Chrome
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked** and select this folder

The icon starts working immediately. Click the extension icon for the pace dashboard, or visit [claude.ai/settings/usage](https://claude.ai/settings/usage) for the full pace line overlay.

## Permissions

| Permission | Why |
|---|---|
| `storage` | Save preferences and cache pace data for the popup |
| `cookies` | Read `lastActiveOrg` cookie to identify your Claude organization |
| `alarms` | Schedule the 15-minute polling interval |
| `host_permissions` (`claude.ai`) | Credentialed fetch to the usage API |

## License

MIT
