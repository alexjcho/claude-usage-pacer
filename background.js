// Claude Usage Pacer — service worker
// Polls claude.ai usage API every 15 minutes, computes pace delta,
// and renders a +/- badge on the toolbar icon.

importScripts("pace-math.js");

const ALARM_NAME = "usage-poll";
const ALARM_PERIOD = 15; // minutes

const DEFAULTS = { activeEnabled: true, activeStart: 8, activeEnd: 0, badgeMode: "auto" };

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
        badgeMode: r.badgeMode ?? DEFAULTS.badgeMode,
      });
    });
  });
}

// ── Delta computation ─────────────────────────────────────

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

// ── Core poll ──────────────────────────────────────────────

async function poll() {
  try {
    const orgId = await getOrgId();
    if (!orgId) return clearBadge();

    const data = await fetchUsage(orgId);
    if (!data) return clearBadge();

    const cfg = await loadSettings();
    const mode = cfg.badgeMode;

    const d5 = computeDelta(data.five_hour, false, cfg);
    const d7 = computeDelta(data.seven_day, true, cfg);

    let delta;
    if (mode === "five_hour") {
      delta = d5 ?? d7;
    } else if (mode === "seven_day") {
      delta = d7 ?? d5;
    } else {
      // auto: whichever has the higher delta (more urgent)
      if (d5 != null && d7 != null) {
        delta = d5 >= d7 ? d5 : d7;
      } else {
        delta = d5 ?? d7;
      }
    }

    if (delta == null) return clearBadge();
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
