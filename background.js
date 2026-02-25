// Claude Usage Pacer — service worker
// Polls claude.ai usage API every 15 minutes, computes pace delta,
// and renders a +/- badge on the toolbar icon.

importScripts("pace-math.js");

const ALARM_NAME = "usage-poll";
const ALARM_PERIOD = 15; // minutes

const DEFAULTS = { activeEnabled: true, activeStart: 8, activeEnd: 0 };

// ── Badge helpers ──────────────────────────────────────────

function applyBadge(delta) {
  const text = (delta >= 0 ? "+" : "") + Math.round(delta);
  const bg = delta >= 0 ? "#ef4444" : "#22c55e";
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color: bg });
  chrome.action.setBadgeTextColor({ color: "#ffffff" });
}

function clearBadge() {
  chrome.action.setBadgeText({ text: "" });
  chrome.action.setBadgeBackgroundColor({ color: "#9ca3af" });
}

// ── Data fetching ──────────────────────────────────────────

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
      });
    });
  });
}

// ── Core poll ──────────────────────────────────────────────

async function poll() {
  try {
    const orgId = await getOrgId();
    if (!orgId) return clearBadge();

    const data = await fetchUsage(orgId);
    if (!data) return clearBadge();

    // Prefer weekly bar; fall back to 5-hour
    const bucket = data.seven_day || data.five_hour;
    if (!bucket || bucket.utilization == null || !bucket.resets_at) {
      return clearBadge();
    }

    const usedPct = bucket.utilization; // 0–100
    const resetDate = new Date(bucket.resets_at);
    if (isNaN(resetDate.getTime())) return clearBadge();

    const cfg = await loadSettings();

    // Determine cycle length from bucket key
    const isWeekly = !!data.seven_day;
    const cycleDays = isWeekly ? 7 : 0;

    let paceFraction;
    if (cycleDays >= 1 && cfg.activeEnabled) {
      paceFraction = self.activeHoursFraction(resetDate, cycleDays, cfg);
    } else {
      // Linear fallback: time remaining / total cycle
      const now = new Date();
      const totalMs = isWeekly ? 7 * 24 * 60 * 60 * 1000 : 5 * 60 * 60 * 1000;
      const remaining = resetDate.getTime() - now.getTime();
      if (remaining <= 0 || remaining > totalMs) return clearBadge();
      paceFraction = (totalMs - remaining) / totalMs;
    }

    if (paceFraction == null) return clearBadge();

    const pacePct = paceFraction * 100;
    const delta = usedPct - pacePct;
    applyBadge(delta);
  } catch {
    clearBadge();
  }
}

// ── Alarm management ───────────────────────────────────────

function ensureAlarm() {
  chrome.alarms.get(ALARM_NAME, (existing) => {
    if (!existing) {
      chrome.alarms.create(ALARM_NAME, { periodInMinutes: ALARM_PERIOD });
    }
  });
}

// ── Event listeners ────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  poll();
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: ALARM_PERIOD });
});

chrome.runtime.onStartup.addListener(() => {
  poll();
  ensureAlarm();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) poll();
});

chrome.storage.onChanged.addListener(() => {
  poll();
});
