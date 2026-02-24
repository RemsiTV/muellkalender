// script.js

let streets = null;
let calendar = null;
let streetIndex = null;

const STORAGE_KEY_FAVORITE = "favoriteStreet";

const TYPE_LABEL = {
  A: "Restmüll",
  B: "Biomüll",
  C: "Gelber Sack",
  D: "Papier"
};

function pad2(n) {
  return String(n).padStart(2, "0");
}

// ---------- Format helpers ----------

function formatMonthYear(ym) {
  const [year, month] = ym.split("-");
  const d = new Date(Number(year), Number(month) - 1, 1);
  return d.toLocaleDateString("de-DE", { month: "long", year: "numeric" });
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit"
  });
}

function showCurrentDate() {
  const el = document.getElementById("currentDate");
  if (!el) return;

  const now = new Date();
  el.innerText = now.toLocaleDateString("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric"
  });
}

// ---------- Street matching (tolerant) ----------

function normalizeStreet(s) {
  return s
    .toLowerCase()
    .trim()
    .replace(/ß/g, "ss")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/[^a-z0-9]/g, ""); // remove spaces, hyphens, dots, etc.
}

function buildStreetIndex(streetsObj) {
  const idx = {};
  for (const original of Object.keys(streetsObj)) {
    idx[normalizeStreet(original)] = original;
  }
  return idx;
}

function findStreetKey(userInput) {
  const key = normalizeStreet(userInput);
  return streetIndex ? (streetIndex[key] || null) : null;
}

// ---------- Autocomplete ----------

function fillStreetDatalist() {
  const dl = document.getElementById("streetList");
  if (!dl || !streets) return;

  dl.innerHTML = "";

  const names = Object.keys(streets).sort((a, b) => a.localeCompare(b, "de"));
  for (const name of names) {
    const opt = document.createElement("option");
    opt.value = name;
    dl.appendChild(opt);
  }

  console.log("✅ Autocomplete gefüllt:", names.length, "Straßen");
}

// ---------- Favorites ----------

function saveFavoriteStreet(streetName) {
  localStorage.setItem(STORAGE_KEY_FAVORITE, streetName);
}

function loadFavoriteStreet() {
  return localStorage.getItem(STORAGE_KEY_FAVORITE);
}

// ---------- Business logic ----------

function getPickupsThisMonth(streetInputName) {
  const realKey = findStreetKey(streetInputName);
  if (!realKey) return { error: "Straße nicht gefunden (Tippfehler?)." };

  const street = streets[realKey];

  const now = new Date();
  const ym = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;

  const monthEvents = calendar
    .filter(e => e.date.startsWith(ym))
    .sort((a, b) => a.date.localeCompare(b.date));

  const byDate = new Map();

  for (const e of monthEvents) {
    // e = {date:"YYYY-MM-DD", type:"A|B|C|D", zone:Number}
    if (street[e.type] !== e.zone) continue;

    if (!byDate.has(e.date)) byDate.set(e.date, []);
    byDate.get(e.date).push(TYPE_LABEL[e.type]);
  }

  const result = Array.from(byDate.entries()).map(([date, pickups]) => ({
    date,
    pickups
  }));

  return { ym, result, realKey };
}

// ---------- Render ----------

function renderResult(outEl, res) {
  const today = new Date().toISOString().slice(0, 10);
  let nextMarked = false;

  outEl.innerHTML =
    `<h3>Abholtermine für ${res.realKey} (${formatMonthYear(res.ym)})</h3>` +
    res.result
      .map(x => {
        const isNext =
          !nextMarked && x.date >= today ? ((nextMarked = true), true) : false;

        const badges = x.pickups
          .map(p => `<span class="badge">${p}</span>`)
          .join("");

        return `
          <div class="pickup ${isNext ? "next-pickup" : ""}">
            <div class="pickup-date">${formatDate(x.date)}</div>
            <div class="pickup-badges">${badges}</div>
          </div>
        `;
      })
      .join("");
}

// ---------- UI wiring ----------

function setupUI() {
  const input = document.getElementById("streetInput");
  const btn = document.getElementById("checkBtn");
  const out = document.getElementById("output");

  if (!input || !btn || !out) {
    console.error("❌ HTML-Elemente fehlen. Prüfe IDs: streetInput, checkBtn, output");
    return;
  }

  function runSearch() {
    if (!streets || !calendar || !streetIndex) {
      out.innerText = "Daten werden noch geladen...";
      return;
    }

    const streetName = input.value.trim();
    if (!streetName) {
      out.innerText = "Bitte eine Straße eingeben.";
      return;
    }

    const res = getPickupsThisMonth(streetName);

    if (res.error) {
      out.innerText = res.error;
      return;
    }

    if (res.result.length === 0) {
      out.innerText = `Im Monat ${formatMonthYear(res.ym)} gibt es für "${res.realKey}" keine Abholungen.`;
      // trotzdem als Favorit speichern, ist ja eine gültige Straße
      input.value = res.realKey;
      saveFavoriteStreet(res.realKey);
      return;
    }

    // korrekte Schreibweise ins Feld übernehmen
    input.value = res.realKey;

    // ⭐ Favorit speichern (letzte gültige)
    saveFavoriteStreet(res.realKey);

    renderResult(out, res);
  }

  btn.addEventListener("click", runSearch);

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") runSearch();
  });

  // Favorit beim Laden einsetzen + direkt suchen
  const fav = loadFavoriteStreet();
  if (fav) {
    input.value = fav;
    // Autosearch erst, wenn Daten geladen sind -> wird von loadData() getriggert
  }

  // wir geben runSearch zurück, damit loadData() es nach dem Laden nutzen kann
  return { runSearch, input };
}

// ---------- Data load ----------

async function loadData(onReadySearch) {
  try {
    streets = await fetch("./streets.json").then(r => r.json());
    calendar = await fetch("./calendar.json").then(r => r.json());

    streetIndex = buildStreetIndex(streets);
    fillStreetDatalist();

    console.log("✅ Daten geladen:", {
      streetsCount: Object.keys(streets).length,
      calendarEvents: calendar.length
    });

    // Auto-search, wenn Favorit vorhanden
    if (typeof onReadySearch === "function") {
      onReadySearch();
    }
  } catch (err) {
    console.error("❌ Fehler beim Laden der JSON-Dateien:", err);
  }
}

// ---------- Start ----------

showCurrentDate();
const ui = setupUI();

// Wenn UI nicht initialisiert wurde (IDs fehlen), abbrechen
if (ui) {
  loadData(() => {
    const fav = loadFavoriteStreet();
    if (fav) ui.runSearch();
  });
}