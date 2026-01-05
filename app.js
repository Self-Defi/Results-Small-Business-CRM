const CSV_PATH = "data/leads.csv";

/* ---------------------------
   Utilities
--------------------------- */
function setText(id, v) {
  const el = document.getElementById(id);
  if (el) el.textContent = v;
}

function parseCSV(t) {
  const lines = t.trim().split(/\r?\n/);
  if (!lines.length) return [];
  const headers = lines[0].split(",").map(s => s.trim());

  return lines.slice(1).map(line => {
    const cols = line.split(",").map(s => s.trim());
    const r = {};
    headers.forEach((k, i) => r[k] = cols[i] ?? "");
    return r;
  });
}

function toNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function money(n) {
  const v = Math.round(toNum(n));
  return "$" + v.toLocaleString();
}

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

function groupCount(rows, key) {
  const m = new Map();
  for (const r of rows) {
    const k = (r[key] || "Unknown").trim() || "Unknown";
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

function renderList(id, entries) {
  const ul = document.getElementById(id);
  if (!ul) return;
  ul.innerHTML = "";
  for (const [k, v] of entries) {
    const li = document.createElement("li");
    li.textContent = `${k}: ${v}`;
    ul.appendChild(li);
  }
}

function renderTable(tbodySelector, rows, cols) {
  const tb = document.querySelector(tbodySelector);
  if (!tb) return;
  tb.innerHTML = "";

  for (const r of rows) {
    const tr = document.createElement("tr");

    // keep raw record on the row for click actions
    tr.dataset.leadId = r._raw?.lead_id || "";

    for (const c of cols) {
      const td = document.createElement("td");
      td.textContent = (r[c] ?? "").toString() || "—";
      tr.appendChild(td);
    }
    tb.appendChild(tr);
  }
}

/* ---------------------------
   Demo Data Generator
--------------------------- */
function seededRand(seed) {
  // simple deterministic PRNG
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function makeDemoRows(count = 88) {
  const rand = seededRand(20260105);

  const companies = [
    "Acme Co", "Orbit LLC", "Northwind", "Skyline Inc", "Pine Labs",
    "Cobalt Systems", "Juniper Works", "Atlas Freight", "Copperhouse",
    "Nova Retail", "Helios Fitness", "Banyan Tech", "Kite Logistics",
    "Vanta Media", "Keystone Dental", "Saffron Foods", "Marble & Co",
    "Cedar Capital", "Lumen Solar", "Vertex Consulting"
  ];

  const stages = ["Inbound", "Contacted", "Qualified", "Proposal", "Negotiation", "Closed Won", "Closed Lost"];
  const owners = ["Sales", "Owner", "Alex", "Jordan", "Taylor", "Sam"];
  const actions = ["Book call", "Send proposal", "Follow up", "Re-engage", "Finalize terms", "Need intro", "Check budget"];

  const today = isoToday();
  const rows = [];

  for (let i = 1; i <= count; i++) {
    const lead_id = `LEAD-${5000 + i}`;
    const company = companies[Math.floor(rand() * companies.length)] + (rand() > 0.85 ? " +" : "");
    const stage = stages[Math.floor(rand() * stages.length)];
    const owner = owners[Math.floor(rand() * owners.length)];

    // create some “stalled” distribution
    const baseDays = Math.floor(rand() * 18); // 0-17
    const extraStall = rand() > 0.72 ? Math.floor(7 + rand() * 18) : 0; // more stalled
    const days_in_stage = baseDays + extraStall;

    // deal values: small biz mix
    const deal_value =
      stage === "Closed Won" ? (8000 + Math.floor(rand() * 52000)) :
      stage === "Closed Lost" ? (0 + Math.floor(rand() * 8000)) :
      (1500 + Math.floor(rand() * 60000));

    const next_action = actions[Math.floor(rand() * actions.length)];
    const last_updated = today;

    rows.push({
      lead_id,
      company,
      stage,
      owner,
      days_in_stage: String(days_in_stage),
      deal_value: String(deal_value),
      next_action,
      last_updated
    });
  }

  // ensure some always-stalled “top” rows
  rows[0] = { ...rows[0], company: "Northwind", stage: "Proposal", days_in_stage: "26", deal_value: "84000", next_action: "Exec follow-up", last_updated: today };
  rows[1] = { ...rows[1], company: "Atlas Freight", stage: "Negotiation", days_in_stage: "21", deal_value: "65000", next_action: "Finalize terms", last_updated: today };
  rows[2] = { ...rows[2], company: "Lumen Solar", stage: "Qualified", days_in_stage: "18", deal_value: "42000", next_action: "Send proposal", last_updated: today };

  return rows;
}

/* ---------------------------
   State
--------------------------- */
const state = {
  raw: [],
  norm: [],
  stalledThreshold: 7,
  demoMode: false,
  search: "",
  stage: "__all__",
  selectedLeadId: null
};

/* ---------------------------
   Controls + Drawer
--------------------------- */
function qs(id) { return document.getElementById(id); }

function openDrawer() {
  const d = qs("drawer");
  if (!d) return;
  d.setAttribute("aria-hidden", "false");
}

function closeDrawer() {
  const d = qs("drawer");
  if (!d) return;
  d.setAttribute("aria-hidden", "true");
  state.selectedLeadId = null;
}

function fillDrawer(record) {
  setText("dTitle", record.company || "Deal");
  setText("dSub", `${record.stage || "—"} • ${money(record.deal_value)} • ${record.owner || "—"}`);

  setText("dLead", record.lead_id || "—");
  setText("dStage", record.stage || "—");
  setText("dOwner", record.owner || "—");
  setText("dDays", String(record.days_in_stage ?? "—"));
  setText("dValue", money(record.deal_value));
  setText("dUpdated", record.last_updated || "—");

  const input = qs("dNextAction");
  if (input) input.value = record.next_action || "";
}

function getRecordByLeadId(leadId) {
  return state.raw.find(r => (r.lead_id || "") === leadId) || null;
}

function updateRecord(leadId, patch) {
  const idx = state.raw.findIndex(r => (r.lead_id || "") === leadId);
  if (idx === -1) return;
  state.raw[idx] = { ...state.raw[idx], ...patch, last_updated: isoToday() };
  // Re-normalize
  state.norm = normalize(state.raw);
  renderAll();
}

/* ---------------------------
   Normalization + Filters
--------------------------- */
function normalize(rows) {
  return rows.map(r => ({
    ...r,
    days: toNum(r.days_in_stage),
    val: toNum(r.deal_value)
  }));
}

function matchesSearch(r, q) {
  if (!q) return true;
  const hay = [
    r.lead_id, r.company, r.stage, r.owner, r.next_action
  ].join(" ").toLowerCase();
  return hay.includes(q);
}

function applyFilters(normRows) {
  const q = (state.search || "").trim().toLowerCase();
  const stage = state.stage;

  return normRows.filter(r => {
    const stageOk = (stage === "__all__") ? true : (String(r.stage || "") === stage);
    const searchOk = matchesSearch(r, q);
    return stageOk && searchOk;
  });
}

/* ---------------------------
   Rendering
--------------------------- */
function buildStageOptions(rows) {
  const sel = qs("stageFilter");
  if (!sel) return;

  const stages = [...new Set(rows.map(r => String(r.stage || "Unknown")))].sort();
  const current = state.stage;

  // keep "All"
  sel.innerHTML = `<option value="__all__">All</option>` + stages.map(s => {
    const safe = s.replace(/"/g, "&quot;");
    return `<option value="${safe}">${s}</option>`;
  }).join("");

  // restore selection if exists
  sel.value = stages.includes(current) ? current : "__all__";
}

function renderAll() {
  const todayISO = isoToday();
  setText("asOf", "As of: " + todayISO);

  const norm = state.norm;
  const totalCount = norm.length;
  setText("totalCount", "Leads: " + totalCount);

  const threshold = state.stalledThreshold;
  const filtered = applyFilters(norm);

  const stalled = filtered
    .filter(r => r.days >= threshold && String(r.stage || "") !== "Closed Won" && String(r.stage || "") !== "Closed Lost")
    .sort((a, b) => b.days - a.days);

  setText("stalledCount", "Stalled: " + stalled.length);
  setText("viewCount", `Showing: ${filtered.length} (${stalled.length} stalled)`);

  const totalValue = filtered.reduce((s, r) => s + r.val, 0);
  const stalledValue = stalled.reduce((s, r) => s + r.val, 0);

  setText("totalValue", money(totalValue));
  setText("stalledValue", money(stalledValue));
  setText("stalledValuePill", "Stalled $: " + money(stalledValue));

  const byStage = groupCount(stalled, "stage");
  renderList("byStage", byStage);
  setText("worstStage", byStage[0] ? (byStage[0][0] + " (" + byStage[0][1] + ")") : "—");

  const topDeal = [...filtered].sort((a, b) => b.val - a.val)[0];
  setText("topDeal", topDeal ? (topDeal.company + " (" + money(topDeal.val) + ")") : "—");

  const tableRows = stalled.map(r => ({
    Lead: r.lead_id,
    Company: r.company,
    Stage: r.stage,
    "Days in Stage": String(r.days),
    Value: money(r.val),
    Owner: r.owner,
    "Next Action": r.next_action,
    Updated: r.last_updated || "—",
    _raw: r
  }));

  renderTable("#mainTable tbody", tableRows.slice(0, 25),
    ["Lead", "Company", "Stage", "Days in Stage", "Value", "Owner", "Next Action", "Updated"]);

  wireRowClicks();
}

function wireRowClicks() {
  const tbody = document.querySelector("#mainTable tbody");
  if (!tbody) return;

  // Remove existing handlers by cloning (simple, reliable for small tables)
  const clone = tbody.cloneNode(true);
  tbody.parentNode.replaceChild(clone, tbody);

  clone.addEventListener("click", (e) => {
    const tr = e.target.closest("tr");
    if (!tr) return;

    const leadId = tr.dataset.leadId;
    if (!leadId) return;

    state.selectedLeadId = leadId;
    const rec = getRecordByLeadId(leadId);
    if (!rec) return;

    fillDrawer(rec);
    openDrawer();
  });
}

/* ---------------------------
   Export + Copy
--------------------------- */
function toCSV(rows) {
  const headers = ["lead_id","company","stage","owner","days_in_stage","deal_value","next_action","last_updated"];
  const lines = [headers.join(",")];

  for (const r of rows) {
    const line = headers.map(h => {
      const v = (r[h] ?? "").toString();
      // escape commas/quotes
      if (v.includes(",") || v.includes('"') || v.includes("\n")) {
        return `"${v.replace(/"/g, '""')}"`;
      }
      return v;
    }).join(",");
    lines.push(line);
  }

  return lines.join("\n");
}

function download(filename, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    alert("Copied to clipboard.");
  } catch {
    // fallback
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    alert("Copied to clipboard.");
  }
}

/* ---------------------------
   Data Loading
--------------------------- */
async function loadCSV() {
  const res = await fetch(CSV_PATH, { cache: "no-store" });
  if (!res.ok) throw new Error("CSV fetch failed: " + res.status);
  const text = await res.text();
  return parseCSV(text);
}

async function hydrate() {
  const demo = qs("toggleDemo");
  state.demoMode = !!(demo && demo.checked);

  let rows = [];
  if (state.demoMode) {
    rows = makeDemoRows(88);
  } else {
    try {
      rows = await loadCSV();
    } catch (e) {
      console.warn(e);
      // graceful fallback to demo if CSV fails
      rows = makeDemoRows(88);
      if (demo) demo.checked = true;
      state.demoMode = true;
    }
  }

  state.raw = rows;
  state.norm = normalize(rows);

  buildStageOptions(rows);
  renderAll();
}

/* ---------------------------
   Event Wiring
--------------------------- */
function wireControls() {
  const btnRefresh = qs("btnRefresh");
  const toggleDemo = qs("toggleDemo");
  const stalledDays = qs("stalledDays");
  const stalledDaysLabel = qs("stalledDaysLabel");
  const stageFilter = qs("stageFilter");
  const searchBox = qs("searchBox");
  const btnExport = qs("btnExport");
  const btnCopyJson = qs("btnCopyJson");

  if (stalledDays && stalledDaysLabel) {
    stalledDaysLabel.textContent = String(state.stalledThreshold);
    stalledDays.addEventListener("input", () => {
      state.stalledThreshold = toNum(stalledDays.value);
      stalledDaysLabel.textContent = String(state.stalledThreshold);
      renderAll();
    });
  }

  if (toggleDemo) {
    toggleDemo.addEventListener("change", () => hydrate());
  }

  if (btnRefresh) {
    btnRefresh.addEventListener("click", () => hydrate());
  }

  if (stageFilter) {
    stageFilter.addEventListener("change", () => {
      state.stage = stageFilter.value;
      renderAll();
    });
  }

  if (searchBox) {
    let t = null;
    searchBox.addEventListener("input", () => {
      clearTimeout(t);
      t = setTimeout(() => {
        state.search = searchBox.value || "";
        renderAll();
      }, 120);
    });
  }

  if (btnExport) {
    btnExport.addEventListener("click", () => {
      const filtered = applyFilters(state.norm);
      const csv = toCSV(filtered.map(r => ({
        lead_id: r.lead_id,
        company: r.company,
        stage: r.stage,
        owner: r.owner,
        days_in_stage: String(r.days_in_stage ?? r.days),
        deal_value: String(r.deal_value ?? r.val),
        next_action: r.next_action,
        last_updated: r.last_updated
      })));
      download(`pipeline_export_${isoToday()}.csv`, csv);
    });
  }

  if (btnCopyJson) {
    btnCopyJson.addEventListener("click", async () => {
      const filtered = applyFilters(state.norm).map(r => ({
        lead_id: r.lead_id,
        company: r.company,
        stage: r.stage,
        owner: r.owner,
        days_in_stage: toNum(r.days_in_stage),
        deal_value: toNum(r.deal_value),
        next_action: r.next_action,
        last_updated: r.last_updated
      }));
      await copyToClipboard(JSON.stringify(filtered, null, 2));
    });
  }

  // Drawer controls
  const btnCloseDrawer = qs("btnCloseDrawer");
  const drawerBackdrop = qs("drawerBackdrop");

  if (btnCloseDrawer) btnCloseDrawer.addEventListener("click", closeDrawer);
  if (drawerBackdrop) drawerBackdrop.addEventListener("click", closeDrawer);

  const btnMarkContacted = qs("btnMarkContacted");
  const btnSaveAction = qs("btnSaveAction");
  const btnNudge = qs("btnNudge");
  const btnCloseLost = qs("btnCloseLost");
  const dNextAction = qs("dNextAction");

  if (btnMarkContacted) {
    btnMarkContacted.addEventListener("click", () => {
      if (!state.selectedLeadId) return;
      updateRecord(state.selectedLeadId, { stage: "Contacted" });
      const rec = getRecordByLeadId(state.selectedLeadId);
      if (rec) fillDrawer(rec);
    });
  }

  if (btnSaveAction) {
    btnSaveAction.addEventListener("click", () => {
      if (!state.selectedLeadId) return;
      const val = dNextAction ? dNextAction.value.trim() : "";
      updateRecord(state.selectedLeadId, { next_action: val || "—" });
      const rec = getRecordByLeadId(state.selectedLeadId);
      if (rec) fillDrawer(rec);
    });
  }

  if (btnNudge) {
    btnNudge.addEventListener("click", () => {
      if (!state.selectedLeadId) return;
      const rec = getRecordByLeadId(state.selectedLeadId);
      if (!rec) return;
      const newDays = toNum(rec.days_in_stage) + 3;
      updateRecord(state.selectedLeadId, { days_in_stage: String(newDays) });
      const rec2 = getRecordByLeadId(state.selectedLeadId);
      if (rec2) fillDrawer(rec2);
    });
  }

  if (btnCloseLost) {
    btnCloseLost.addEventListener("click", () => {
      if (!state.selectedLeadId) return;
      updateRecord(state.selectedLeadId, { stage: "Closed Lost", deal_value: "0" });
      const rec = getRecordByLeadId(state.selectedLeadId);
      if (rec) fillDrawer(rec);
    });
  }
}

/* ---------------------------
   Boot
--------------------------- */
(async function main() {
  setText("asOf", "As of: " + isoToday());
  wireControls();
  await hydrate();
})().catch(e => {
  console.error(e);
  alert("App failed to start. Check console.");
});
