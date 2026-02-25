// Claude Usage Pacer — shared active-hours math
// Used by both content.js (content script) and background.js (service worker).
// Assigned to `self` so they're globals in either context.

/**
 * Count "active" minutes between two Dates.
 * Active window each day is [activeStartH .. activeEndH),
 * where activeEndH=0 means midnight (24). Handles windows
 * that cross midnight (e.g. 8 AM → 2 AM).
 */
self.countActiveMinutes = function (from, to, activeStartH, activeEndH) {
  if (to <= from) return 0;

  const aEnd = activeEndH === 0 ? 24 : activeEndH;
  const crosses = activeStartH >= aEnd;

  let total = 0;
  const cursor = new Date(from);
  cursor.setHours(0, 0, 0, 0);
  if (crosses) cursor.setDate(cursor.getDate() - 1);

  const fromMs = from.getTime();
  const toMs = to.getTime();

  for (let i = 0; i < 12 && cursor.getTime() <= toMs; i++) {
    if (!crosses) {
      const s = new Date(cursor);
      s.setHours(activeStartH, 0, 0, 0);
      const e = new Date(cursor);
      e.setHours(aEnd, 0, 0, 0);
      const os = Math.max(s.getTime(), fromMs);
      const oe = Math.min(e.getTime(), toMs);
      if (oe > os) total += (oe - os) / 60000;
    } else {
      const s1 = new Date(cursor);
      s1.setHours(activeStartH, 0, 0, 0);
      const e1 = new Date(cursor);
      e1.setDate(e1.getDate() + 1);
      e1.setHours(0, 0, 0, 0);
      let os = Math.max(s1.getTime(), fromMs);
      let oe = Math.min(e1.getTime(), toMs);
      if (oe > os) total += (oe - os) / 60000;

      const s2 = new Date(e1);
      const e2 = new Date(e1);
      e2.setHours(activeEndH, 0, 0, 0);
      os = Math.max(s2.getTime(), fromMs);
      oe = Math.min(e2.getTime(), toMs);
      if (oe > os) total += (oe - os) / 60000;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return total;
};

/**
 * Active-hours-weighted fraction elapsed for a cycle.
 * @param {Date}   resetDate  - when the cycle resets
 * @param {number} cycleDays  - length of cycle in days
 * @param {object} cfg        - { activeEnabled, activeStart, activeEnd }
 */
self.activeHoursFraction = function (resetDate, cycleDays, cfg) {
  const now = new Date();
  const cycleStart = new Date(resetDate);
  cycleStart.setDate(cycleStart.getDate() - cycleDays);

  const aEnd = cfg.activeEnd === 0 ? 24 : cfg.activeEnd;
  const crosses = cfg.activeStart >= aEnd;
  const activeHoursPerDay = crosses
    ? 24 - cfg.activeStart + (cfg.activeEnd === 0 ? 0 : cfg.activeEnd)
    : aEnd - cfg.activeStart;

  const totalActive = cycleDays * activeHoursPerDay * 60;
  if (totalActive <= 0) return null;

  const elapsed = self.countActiveMinutes(
    cycleStart, now, cfg.activeStart, cfg.activeEnd
  );
  return Math.min(elapsed / totalActive, 0.999);
};
