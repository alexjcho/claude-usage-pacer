// Claude Usage Pacer — service worker
// Polls claude.ai usage API on a configurable interval, computes pace deltas,
// and renders a two-bar color icon on the toolbar.

importScripts("pace-math.js");

const ALARM_NAME = "usage-poll";
const POLL_INTERVAL_DEFAULT = 5; // minutes

const DEFAULTS = { activeEnabled: true, activeStart: 8, activeEnd: 0, pollInterval: POLL_INTERVAL_DEFAULT };

// ── Color mapping ────────────────────────────────────────────

/**
 * Map a pace delta to an RGB color on a 5-stop gradient.
 * -20 → deep green, 0 → yellow, +20 → red.
 * null → gray (no data).
 */
function deltaToColor(delta) {
  if (delta == null) return [80, 80, 80];

  const stops = [
    { at: -20, r: 22,  g: 163, b: 74  }, // green-600
    { at: -10, r: 74,  g: 222, b: 128 }, // green-400
    { at:   0, r: 234, g: 179, b: 8   }, // yellow-500
    { at:  10, r: 249, g: 115, b: 22  }, // orange-500
    { at:  20, r: 239, g: 68,  b: 68  }, // red-500
  ];

  const d = Math.max(-20, Math.min(20, delta));

  for (let i = 0; i < stops.length - 1; i++) {
    if (d <= stops[i + 1].at) {
      const t = (d - stops[i].at) / (stops[i + 1].at - stops[i].at);
      return [
        Math.round(stops[i].r + t * (stops[i + 1].r - stops[i].r)),
        Math.round(stops[i].g + t * (stops[i + 1].g - stops[i].g)),
        Math.round(stops[i].b + t * (stops[i + 1].b - stops[i].b)),
      ];
    }
  }
  return [239, 68, 68];
}

// ── Icon rendering ───────────────────────────────────────────

function renderIcon(d5, d7, size) {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext("2d");
  const s = size;

  const cx = s / 2, cy = s * 0.55;
  const outerR = s * 0.46;
  const thickness = s * 0.1;

  // Gauge arc (top semicircle)
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = thickness;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(cx, cy, outerR, Math.PI, 0);
  ctx.stroke();

  // Two bars inside the gauge
  const barH = s * 0.5;
  const barTop = cy - barH * 0.45;
  const gap = Math.max(2, Math.round(s * 0.1));
  const totalW = s * 0.55;
  const barW = (totalW - gap) / 2;
  const barX = (s - totalW) / 2;
  const r = Math.max(1, Math.round(s * 0.06));

  // Left bar — session (5h)
  const c5 = deltaToColor(d5);
  ctx.fillStyle = `rgb(${c5[0]},${c5[1]},${c5[2]})`;
  ctx.beginPath();
  ctx.roundRect(barX, barTop, barW, barH, r);
  ctx.fill();

  // Right bar — weekly (7d)
  const c7 = deltaToColor(d7);
  ctx.fillStyle = `rgb(${c7[0]},${c7[1]},${c7[2]})`;
  ctx.beginPath();
  ctx.roundRect(barX + barW + gap, barTop, barW, barH, r);
  ctx.fill();

  return ctx.getImageData(0, 0, size, size);
}

function setTwoBarIcon(d5, d7) {
  chrome.action.setIcon({
    imageData: {
      16: renderIcon(d5, d7, 16),
      32: renderIcon(d5, d7, 32),
    },
  });
  chrome.action.setBadgeText({ text: "" });

  const fmt = (d) =>
    d == null ? "—" : (d >= 0 ? "+" : "") + Math.round(d) + "%";
  chrome.action.setTitle({
    title: `Session ${fmt(d5)}  ·  Weekly ${fmt(d7)}`,
  });
}

// ── Data fetching ────────────────────────────────────────────

async function getOrgId() {
  const cookie = await chrome.cookies.get({
    name: "lastActiveOrg",
    url: "https://claude.ai",
  });
  return cookie?.value || null;
}

async function fetchUsage(orgId) {
  const resp = await fetch(
    `https://claude.ai/api/organizations/${orgId}/usage`,
    { credentials: "include" }
  );
  if (!resp.ok) return null;
  return resp.json();
}

function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(Object.keys(DEFAULTS), (r) => {
      resolve({
        activeEnabled: r.activeEnabled ?? DEFAULTS.activeEnabled,
        activeStart: r.activeStart ?? DEFAULTS.activeStart,
        activeEnd: r.activeEnd ?? DEFAULTS.activeEnd,
        pollInterval: r.pollInterval ?? DEFAULTS.pollInterval,
      });
    });
  });
}

// ── Delta computation ────────────────────────────────────────

function computeDelta(bucket, isWeekly, cfg) {
  if (!bucket || bucket.utilization == null || !bucket.resets_at) return null;
  const usedPct = bucket.utilization;
  const resetDate = new Date(bucket.resets_at);
  if (isNaN(resetDate.getTime())) return null;

  const cycleDays = isWeekly ? 7 : 0;
  let paceFraction;
  if (cycleDays >= 1 && cfg.activeEnabled) {
    paceFraction = self.activeHoursFraction(resetDate, cycleDays, cfg);
  } else {
    const now = new Date();
    const totalMs = isWeekly ? 7 * 24 * 60 * 60 * 1000 : 5 * 60 * 60 * 1000;
    const remaining = resetDate.getTime() - now.getTime();
    if (remaining <= 0 || remaining > totalMs) return null;
    paceFraction = (totalMs - remaining) / totalMs;
  }
  if (paceFraction == null) return null;
  return usedPct - paceFraction * 100;
}

// ── Core poll ────────────────────────────────────────────────

async function poll() {
  try {
    const orgId = await getOrgId();
    if (!orgId) return setTwoBarIcon(null, null);

    const data = await fetchUsage(orgId);
    if (!data) return setTwoBarIcon(null, null);

    const cfg = await loadSettings();
    const d5 = computeDelta(data.five_hour, false, cfg);
    const d7 = computeDelta(data.seven_day, true, cfg);

    // Cache for popup
    chrome.storage.local.set({
      _paceData: {
        d5, d7,
        u5: data.five_hour?.utilization ?? null,
        u7: data.seven_day?.utilization ?? null,
        r5: data.five_hour?.resets_at ?? null,
        r7: data.seven_day?.resets_at ?? null,
        ts: Date.now(),
      },
    });

    setTwoBarIcon(d5, d7);
  } catch {
    setTwoBarIcon(null, null);
  }
}

// ── Alarm management ─────────────────────────────────────────

async function resetAlarm(periodInMinutes) {
  await chrome.alarms.clear(ALARM_NAME);
  chrome.alarms.create(ALARM_NAME, { periodInMinutes });
}

async function ensureAlarm() {
  const existing = await chrome.alarms.get(ALARM_NAME);
  if (!existing) {
    const { pollInterval } = await loadSettings();
    chrome.alarms.create(ALARM_NAME, { periodInMinutes: pollInterval });
  }
}

// ── Event listeners ──────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async () => {
  poll();
  const { pollInterval } = await loadSettings();
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: pollInterval });
});

chrome.runtime.onStartup.addListener(() => {
  poll();
  ensureAlarm();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) poll();
});

chrome.storage.onChanged.addListener((changes) => {
  // Ignore _paceData writes to break the poll→store→poll loop
  const keys = Object.keys(changes);
  if (keys.length === 1 && keys[0] === "_paceData") return;

  if (changes.pollInterval) {
    resetAlarm(changes.pollInterval.newValue);
  }
  poll();
});
