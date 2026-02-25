// Claude Usage Pacer — content script
// Overlays a "pace line" on each Plan usage progress bar to show
// where linear consumption would place you at the current moment
// in the reset cycle.

(function () {
  "use strict";

  const PACE_LINE_COLOR = "#f59e0b"; // amber-500
  const POLL_INTERVAL = 300; // ms between DOM checks
  const MAX_POLLS = 50; // give up after ~15 s

  // ── Cycle definitions ──────────────────────────────────────────
  // Session: fixed 5-hour window, countdown is displayed.
  // Weekly bars: reset at a specific weekday + time each week.

  const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  /** Parse "Resets in Xhr Ymin" → fraction of cycle elapsed. */
  function parseCountdownReset(text, cycleMins) {
    const m = text.match(/Resets\s+in\s+(?:(\d+)\s*hr?)?\s*(?:(\d+)\s*min)?/i);
    if (!m) return null;
    const hrs = parseInt(m[1] || "0", 10);
    const mins = parseInt(m[2] || "0", 10);
    const remaining = hrs * 60 + mins;
    if (remaining > cycleMins || remaining <= 0) return null;
    return (cycleMins - remaining) / cycleMins;
  }

  /** Parse "Resets Thu 8:00 AM" → fraction of 7-day cycle elapsed. */
  function parseWeeklyReset(text) {
    const m = text.match(
      /Resets\s+(Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s+(\d{1,2}):(\d{2})\s*(AM|PM)/i
    );
    if (!m) return null;

    const dayName = m[1];
    const rawHour = parseInt(m[2], 10);
    const minute = parseInt(m[3], 10);
    const ampm = m[4].toUpperCase();

    let resetHour = rawHour;
    if (ampm === "PM" && rawHour !== 12) resetHour += 12;
    if (ampm === "AM" && rawHour === 12) resetHour = 0;

    const resetDay = WEEKDAYS.indexOf(dayName);
    if (resetDay === -1) return null;

    const now = new Date();
    const nowDay = now.getDay();
    const nowMinutes = nowDay * 24 * 60 + now.getHours() * 60 + now.getMinutes();
    const resetMinutes = resetDay * 24 * 60 + resetHour * 60 + minute;

    const cycle = 7 * 24 * 60;
    // Minutes since last reset (wraps around the week)
    const elapsed = (nowMinutes - resetMinutes + cycle) % cycle;
    // If elapsed is 0 it just reset; if close to cycle it's about to reset.
    // But we want minutes since the LAST reset, which is `cycle - remaining`.
    // Actually: elapsed already represents minutes since last reset when
    // resetMinutes is in the past this week.  If the reset is in the future,
    // elapsed wraps to (cycle - timeUntilReset), which is correct.
    return elapsed / cycle;
  }

  /** Parse reset text → fraction of cycle elapsed [0, 1). */
  function parseFractionElapsed(resetText, label) {
    if (/Resets\s+in\s/i.test(resetText)) {
      const isSession = /current session/i.test(label);
      const cycleMins = isSession ? 5 * 60 : 7 * 24 * 60;
      return parseCountdownReset(resetText, cycleMins);
    }
    return parseWeeklyReset(resetText);
  }

  // ── DOM helpers ────────────────────────────────────────────────

  /** Find the "Plan usage limits" section (first <section> with that heading). */
  function getPlanSection() {
    const sections = document.querySelectorAll("main section");
    for (const sec of sections) {
      const h = sec.querySelector("h2");
      if (h && /plan usage/i.test(h.textContent)) return sec;
    }
    return null;
  }

  /**
   * For a given progress-bar track element, walk up to the outer row and
   * return { label, resetText, usedPct, track }.
   */
  function readBarData(track) {
    const fill = track.querySelector("div[style]");
    const usedMatch = fill && fill.style.width.match(/([\d.]+)%/);
    const usedPct = usedMatch ? parseFloat(usedMatch[1]) : null;

    // Walk up (max 5 levels) to find the row containing the reset label,
    // instead of assuming a fixed parent-chain depth.
    let row = track.parentElement;
    let labelCol = null;
    for (let i = 0; i < 5 && row && row !== document.body; i++) {
      const candidate = row.querySelector(".flex.flex-col");
      if (candidate && /Resets/i.test(candidate.textContent)) {
        labelCol = candidate;
        break;
      }
      row = row.parentElement;
    }

    const label = labelCol?.children[0]?.textContent?.trim() ?? "";
    const resetText = labelCol?.children[1]?.textContent?.trim() ?? "";

    return { label, resetText, usedPct, track, row };
  }

  // ── Rendering ──────────────────────────────────────────────────

  function clearPaceMarkers() {
    document.querySelectorAll(".cup-pace-line, .cup-pace-text").forEach((el) => el.remove());
  }

  function renderPaceLine(track, pacePercent) {
    // Make track position:relative so we can absolutely-position the line
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
    const color = diff >= 0 ? "#ef4444" : "#22c55e"; // red if ahead (consuming fast), green if behind

    const usedP = row ? row.querySelector("p") : null;

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

    if (usedP) {
      usedP.parentElement.insertBefore(span, usedP.nextSibling);
    }
  }

  // ── Main loop ──────────────────────────────────────────────────

  function run() {
    clearPaceMarkers();

    const section = getPlanSection();
    if (!section) return false;

    const tracks = section.querySelectorAll(
      ".h-4.flex.items-center"
    );
    if (tracks.length === 0) return false;

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

  // Try immediately, then poll until the usage bars appear (SPA may hydrate late)
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

  /** Re-apply pace markers whenever the usage section DOM changes. */
  function observeMutations() {
    const target = document.querySelector("main");
    if (!target) return;

    let debounce;
    const observer = new MutationObserver(() => {
      clearTimeout(debounce);
      debounce = setTimeout(run, 500);
    });
    observer.observe(target, { childList: true, subtree: true, characterData: true });
  }
})();
