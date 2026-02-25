# Claude Usage Pacer

A minimal Chrome extension that adds pace markers to your Claude usage page (`claude.ai/settings/usage`).

When you visit the page, it reads the displayed usage percentages and reset times, calculates where linear usage pacing would put you at the current point in each cycle (session, weekly all-models, weekly Sonnet), and overlays a small vertical "pace line" on each progress bar. Supplemental text next to each bar shows whether you're ahead or behind pace (e.g., "+8% ahead" or "−3% behind").

No API calls, no background activity, no data collection — purely a visual enhancement on a page you're already viewing.

## Install

1. Clone or download this repo
2. Open `chrome://extensions` in Chrome
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked** and select this folder
5. Visit [claude.ai/settings/usage](https://claude.ai/settings/usage)

## How it works

The content script runs only on the usage page. It parses each progress bar's reset text ("Resets in 3hr 20min" or "Resets Thu 8:00 AM") to figure out how far through the current cycle you are, then draws an amber pace line at the corresponding percentage. A label like "+12% ahead" (red) or "−5% behind" (green) appears next to each bar so you can see at a glance whether you're burning through usage faster or slower than a steady rate.

## License

MIT
