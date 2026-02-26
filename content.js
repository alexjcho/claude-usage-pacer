// Claude Usage Pacer — content script
// Overlays a "pace line" on each Plan usage progress bar to show
// where consumption would place you at the current moment
// in the reset cycle, optionally weighted by active (waking) hours.

(function () {
  "use strict";

  const PACE_LINE_COLOR = "#f59e0b"; // amber-500
  const POLL_INTERVAL = 300;
  const MAX_POLLS = 50;

  // ── Delta → color gradient (matches popup & icon) ─────────
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

  const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // ── Active-hours settings (loaded from chrome.storage) ─────
  const DEFAULTS = { activeEnabled: true, activeStart: 8, activeEnd: 0, skipWeekends: false };
  let cfg = { ...DEFAULTS };

  function loadSettings() {
    return new Promise((resolve) => {
      if (chrome?.storage?.local) {
        chrome.storage.local.get(Object.keys(DEFAULTS), (r) => {
          cfg.activeEnabled = r.activeEnabled ?? DEFAULTS.activeEnabled;
          cfg.activeStart = r.activeStart ?? DEFAULTS.activeStart;
          cfg.activeEnd = r.activeEnd ?? DEFAULTS.activeEnd;
          cfg.skipWeekends = r.skipWeekends ?? DEFAULTS.skipWeekends;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  // Re-render when user changes settings in popup
  if (chrome?.storage?.onChanged) {
    chrome.storage.onChanged.addListener(() => {
      loadSettings().then(run);
    });
  }

  // ── Cycle parsing ──────────────────────────────────────────

  /** Parse "Resets in Xhr Ymin" → linear fraction of cycle elapsed. */
  function parseCountdownFraction(text, cycleMins) {
    const m = text.match(/Resets\s+in\s+(?:(\d+)\s*hr?)?\s*(?:(\d+)\s*min)?/i);
    if (!m) return null;
    const hrs = parseInt(m[1] || "0", 10);
    const mins = parseInt(m[2] || "0", 10);
    const remaining = hrs * 60 + mins;
    if (remaining > cycleMins || remaining <= 0) return null;
    return (cycleMins - remaining) / cycleMins;
  }

  /** Parse "Resets Thu 8:00 AM" → next reset Date. */
  function getWeeklyResetDate(text) {
    const m = text.match(
      /Resets\s+(Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s+(\d{1,2}):(\d{2})\s*(AM|PM)/i
    );
    if (!m) return null;

    let resetHour = parseInt(m[2], 10);
    const minute = parseInt(m[3], 10);
    const ampm = m[4].toUpperCase();
    if (ampm === "PM" && resetHour !== 12) resetHour += 12;
    if (ampm === "AM" && resetHour === 12) resetHour = 0;

    const resetDay = WEEKDAYS.indexOf(m[1]);
    if (resetDay === -1) return null;

    const now = new Date();
    const d = new Date(now);
    d.setDate(d.getDate() + ((resetDay - now.getDay() + 7) % 7));
    d.setHours(resetHour, minute, 0, 0);
    if (d <= now) d.setDate(d.getDate() + 7);
    return d;
  }

  /** Weekly reset → fraction elapsed, using active hours when enabled. */
  function parseWeeklyReset(text) {
    const resetDate = getWeeklyResetDate(text);
    if (!resetDate) return null;

    if (cfg.activeEnabled) return activeHoursFraction(resetDate, 7, cfg);

    // Linear fallback (original behaviour)
    const now = new Date();
    const cycle = 7 * 24 * 60;
    const nowMins =
      now.getDay() * 1440 + now.getHours() * 60 + now.getMinutes();
    const resetMins =
      resetDate.getDay() * 1440 +
      resetDate.getHours() * 60 +
      resetDate.getMinutes();
    return ((nowMins - resetMins + cycle) % cycle) / cycle;
  }

  /** Pick countdown vs. weekday format and return fraction [0, 1). */
  function parseFractionElapsed(resetText, label) {
    if (/Resets\s+in\s/i.test(resetText)) {
      const isSession = /current session/i.test(label);
      if (isSession) return parseCountdownFraction(resetText, 5 * 60);

      // Weekly bar in countdown format — derive reset Date for active-hrs calc
      if (cfg.activeEnabled) {
        const m = resetText.match(
          /Resets\s+in\s+(?:(\d+)\s*hr?)?\s*(?:(\d+)\s*min)?/i
        );
        if (m) {
          const hrs = parseInt(m[1] || "0", 10);
          const mins = parseInt(m[2] || "0", 10);
          const resetDate = new Date(Date.now() + (hrs * 60 + mins) * 60000);
          return activeHoursFraction(resetDate, 7, cfg);
        }
      }
      return parseCountdownFraction(resetText, 7 * 24 * 60);
    }
    return parseWeeklyReset(resetText);
  }

  // ── DOM helpers ────────────────────────────────────────────

  function getPlanSection() {
    for (const sec of document.querySelectorAll("main section")) {
      const h = sec.querySelector("h2");
      if (h && /plan usage/i.test(h.textContent)) return sec;
    }
    return null;
  }

  function readBarData(track) {
    const fill = track.querySelector("div[style]");
    const usedMatch = fill && fill.style.width.match(/([\d.]+)%/);
    const usedPct = usedMatch ? parseFloat(usedMatch[1]) : null;

    let row = track.parentElement;
    let labelCol = null;
    for (let i = 0; i < 5 && row && row !== document.body; i++) {
      const c = row.querySelector(".flex.flex-col");
      if (c && /Resets/i.test(c.textContent)) {
        labelCol = c;
        break;
      }
      row = row.parentElement;
    }

    const label = labelCol?.children[0]?.textContent?.trim() ?? "";
    const resetText = labelCol?.children[1]?.textContent?.trim() ?? "";
    return { label, resetText, usedPct, track, row };
  }

  // ── Rendering ──────────────────────────────────────────────

  function clearPaceMarkers() {
    document
      .querySelectorAll(".cup-pace-line, .cup-pace-text")
      .forEach((el) => el.remove());
  }

  function renderPaceLine(track, pacePercent) {
    track.style.position = "relative";
    track.style.overflow = "visible";

    const line = document.createElement("div");
    line.className = "cup-pace-line";
    Object.assign(line.style, {
      position: "absolute",
      left: `${pacePercent}%`,
      top: "-2px",
      bottom: "-2px",
      width: "2px",
      backgroundColor: PACE_LINE_COLOR,
      borderRadius: "1px",
      zIndex: "10",
      pointerEvents: "none",
      transition: "left 0.3s ease",
    });
    track.appendChild(line);
  }

  function renderPaceText(row, usedPct, pacePercent) {
    const diff = usedPct - pacePercent;
    const sign = diff >= 0 ? "+" : "\u2212";
    const abs = Math.abs(diff).toFixed(0);
    const word = diff >= 0 ? "ahead" : "behind";
    const color = deltaToColor(diff);

    const span = document.createElement("span");
    span.className = "cup-pace-text";
    Object.assign(span.style, {
      marginLeft: "6px",
      fontSize: "12px",
      fontWeight: "500",
      color,
      whiteSpace: "nowrap",
    });
    span.textContent = `${sign}${abs}% ${word}`;

    const usedP = row?.querySelector("p");
    if (usedP) usedP.parentElement.insertBefore(span, usedP.nextSibling);
  }

  // ── Main loop ──────────────────────────────────────────────

  function run() {
    clearPaceMarkers();
    const section = getPlanSection();
    if (!section) return false;

    const tracks = section.querySelectorAll(".h-4.flex.items-center");
    if (!tracks.length) return false;

    let injected = 0;
    tracks.forEach((track) => {
      const data = readBarData(track);
      if (data.usedPct === null) return;

      const fraction = parseFractionElapsed(data.resetText, data.label);
      if (fraction === null) return;

      const pacePercent = fraction * 100;
      renderPaceLine(track, pacePercent);
      renderPaceText(data.row, data.usedPct, pacePercent);
      injected++;
    });
    return injected > 0;
  }

  // ── Bootstrap ──────────────────────────────────────────────

  function observeMutations() {
    const target = document.querySelector("main");
    if (!target) return;
    let debounce;
    new MutationObserver(() => {
      clearTimeout(debounce);
      debounce = setTimeout(run, 500);
    }).observe(target, { childList: true, subtree: true, characterData: true });
  }

  loadSettings().then(() => {
    let polls = 0;
    if (run()) {
      observeMutations();
    } else {
      const timer = setInterval(() => {
        polls++;
        if (run() || polls >= MAX_POLLS) {
          clearInterval(timer);
          observeMutations();
        }
      }, POLL_INTERVAL);
    }
  });
})();
