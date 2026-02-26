// ── Pace status ──────────────────────────────────────────────

function deltaToColor(delta) {
  if (delta == null) return "rgb(80,80,80)";
  const stops = [
    { at: -20, r: 22,  g: 163, b: 74  },
    { at: -10, r: 74,  g: 222, b: 128 },
    { at:   0, r: 234, g: 179, b: 8   },
    { at:  10, r: 249, g: 115, b: 22  },
    { at:  20, r: 239, g: 68,  b: 68  },
  ];
  const d = Math.max(-20, Math.min(20, delta));
  for (let i = 0; i < stops.length - 1; i++) {
    if (d <= stops[i + 1].at) {
      const t = (d - stops[i].at) / (stops[i + 1].at - stops[i].at);
      const r = Math.round(stops[i].r + t * (stops[i + 1].r - stops[i].r));
      const g = Math.round(stops[i].g + t * (stops[i + 1].g - stops[i].g));
      const b = Math.round(stops[i].b + t * (stops[i + 1].b - stops[i].b));
      return `rgb(${r},${g},${b})`;
    }
  }
  return "rgb(239,68,68)";
}

function formatCountdown(isoStr) {
  if (!isoStr) return null;
  const ms = new Date(isoStr).getTime() - Date.now();
  if (ms <= 0) return "resetting…";
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m left`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hrs < 24) return `${hrs}h ${remMins}m left`;
  const days = Math.floor(hrs / 24);
  const remHrs = hrs % 24;
  return `${days}d ${remHrs}h left`;
}

function formatDelta(delta) {
  if (delta == null) return "";
  const sign = delta >= 0 ? "+" : "";
  const rounded = Math.round(delta);
  const word = delta >= 0 ? "ahead" : "behind";
  return `${sign}${rounded}% ${word}`;
}

function buildMetric(label, utilization, delta, resetAt) {
  const div = document.createElement("div");
  div.className = "pace-metric";

  const color = deltaToColor(delta);

  // Header row: dot + label + utilization %
  const header = document.createElement("div");
  header.className = "pace-metric-header";

  const dot = document.createElement("div");
  dot.className = "pace-dot";
  dot.style.background = color;
  header.appendChild(dot);

  const lbl = document.createElement("span");
  lbl.className = "pace-metric-label";
  lbl.textContent = label;
  header.appendChild(lbl);

  div.appendChild(header);

  // Progress bar with pace marker
  const track = document.createElement("div");
  track.className = "pace-bar-track";

  const fill = document.createElement("div");
  fill.className = "pace-bar-fill";
  fill.style.width = Math.min(100, Math.max(0, utilization)) + "%";
  fill.style.background = color;
  track.appendChild(fill);

  // Pace marker: utilization - delta = pace position
  const pacePos = utilization - (delta ?? 0);
  if (pacePos > 0 && pacePos < 100) {
    const marker = document.createElement("div");
    marker.className = "pace-bar-marker";
    marker.style.left = pacePos + "%";
    track.appendChild(marker);
  }

  div.appendChild(track);

  // Detail row: delta + countdown
  const detail = document.createElement("div");
  detail.className = "pace-detail";

  const deltaEl = document.createElement("span");
  deltaEl.className = "pace-delta";
  deltaEl.style.color = color;
  deltaEl.textContent = formatDelta(delta);
  detail.appendChild(deltaEl);

  const resetEl = document.createElement("span");
  resetEl.className = "pace-reset";
  resetEl.textContent = formatCountdown(resetAt) ?? "";
  detail.appendChild(resetEl);

  div.appendChild(detail);
  return div;
}

function renderPace(data) {
  const card = document.getElementById("paceCard");
  card.innerHTML = "";

  if (!data || !data.ts) {
    card.innerHTML = '<div class="pace-no-data">No data yet</div>';
    return;
  }

  // Session metric (only show if there's an active session)
  if (data.u5 != null) {
    card.appendChild(buildMetric("Session", data.u5, data.d5, data.r5));
  } else {
    const noSession = document.createElement("div");
    noSession.className = "pace-metric";
    const header = document.createElement("div");
    header.className = "pace-metric-header";
    const dot = document.createElement("div");
    dot.className = "pace-dot";
    dot.style.background = "rgb(80,80,80)";
    header.appendChild(dot);
    const lbl = document.createElement("span");
    lbl.className = "pace-metric-label";
    lbl.style.color = "#505050";
    lbl.textContent = "Session — inactive";
    header.appendChild(lbl);
    noSession.appendChild(header);
    card.appendChild(noSession);
  }

  // Weekly metric
  if (data.u7 != null) {
    card.appendChild(buildMetric("Weekly", data.u7, data.d7, data.r7));
  }
}

// Load cached pace data
chrome.storage.local.get(["_paceData"], (r) => {
  renderPace(r._paceData);
});

// Re-render if data updates while popup is open
chrome.storage.onChanged.addListener((changes) => {
  if (changes._paceData) {
    renderPace(changes._paceData.newValue);
  }
});

// ── Usage page link ──────────────────────────────────────────

document.getElementById("openUsage").addEventListener("click", () => {
  chrome.tabs.create({ url: "https://claude.ai/settings/usage" });
});

// ── Active hours settings ────────────────────────────────────

const startSelect = document.getElementById("startHour");
const endSelect = document.getElementById("endHour");
const toggle = document.getElementById("toggle");
const hoursConfig = document.getElementById("hoursConfig");
const skipWeekendsToggle = document.getElementById("skipWeekends");

function fmt(h) {
  if (h === 0) return "12:00 AM";
  if (h === 12) return "12:00 PM";
  return h < 12 ? `${h}:00 AM` : `${h - 12}:00 PM`;
}

// Start: 5 AM – 12 PM
for (let h = 5; h <= 12; h++) {
  const o = document.createElement("option");
  o.value = h;
  o.textContent = fmt(h);
  startSelect.appendChild(o);
}

// End: 8 PM – 3 AM  (20,21,22,23,0,1,2,3)
for (const h of [20, 21, 22, 23, 0, 1, 2, 3]) {
  const o = document.createElement("option");
  o.value = h;
  o.textContent = h === 0 ? "Midnight" : fmt(h);
  endSelect.appendChild(o);
}

// Load
chrome.storage.local.get(
  ["activeStart", "activeEnd", "activeEnabled", "skipWeekends"],
  (r) => {
    startSelect.value = r.activeStart ?? 8;
    endSelect.value = r.activeEnd ?? 0;
    toggle.checked = r.activeEnabled ?? true;
    skipWeekendsToggle.checked = r.skipWeekends ?? false;
    hoursConfig.classList.toggle("disabled", !toggle.checked);
  }
);

// Save on any change
function save() {
  chrome.storage.local.set({
    activeStart: parseInt(startSelect.value),
    activeEnd: parseInt(endSelect.value),
    activeEnabled: toggle.checked,
    skipWeekends: skipWeekendsToggle.checked,
  });
  hoursConfig.classList.toggle("disabled", !toggle.checked);
}

startSelect.addEventListener("change", save);
endSelect.addEventListener("change", save);
toggle.addEventListener("change", save);
skipWeekendsToggle.addEventListener("change", save);

// ── Poll interval setting ─────────────────────────────────────
const pollIntervalSelect = document.getElementById("pollInterval");

chrome.storage.local.get(["pollInterval"], (r) => {
  pollIntervalSelect.value = r.pollInterval ?? 5;
});

pollIntervalSelect.addEventListener("change", () => {
  chrome.storage.local.set({ pollInterval: parseInt(pollIntervalSelect.value, 10) });
});
