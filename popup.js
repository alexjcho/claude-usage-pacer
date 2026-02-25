const startSelect = document.getElementById("startHour");
const endSelect = document.getElementById("endHour");
const toggle = document.getElementById("toggle");
const hoursConfig = document.getElementById("hoursConfig");

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
  ["activeStart", "activeEnd", "activeEnabled"],
  (r) => {
    startSelect.value = r.activeStart ?? 8;
    endSelect.value = r.activeEnd ?? 0;
    toggle.checked = r.activeEnabled ?? true;
    hoursConfig.classList.toggle("disabled", !toggle.checked);
  }
);

// Save on any change
function save() {
  chrome.storage.local.set({
    activeStart: parseInt(startSelect.value),
    activeEnd: parseInt(endSelect.value),
    activeEnabled: toggle.checked,
  });
  hoursConfig.classList.toggle("disabled", !toggle.checked);
}

startSelect.addEventListener("change", save);
endSelect.addEventListener("change", save);
toggle.addEventListener("change", save);
