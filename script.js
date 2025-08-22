/* =========================================
   California Trip — script.js (Firestore)
========================================= */

/* ===== 17 people (first 5 letters code) ===== */
const PEOPLE = [
  { code: "NIKHI", name: "NIKHITHA REDD" },
  { code: "KEERT", name: "KEERTHI" },
  { code: "KALYA", name: "KALYANRE" },
  { code: "DINES", name: "DINESH KUMAR" },
  { code: "SRIKA", name: "SRIKANTH" },
  { code: "ABHIS", name: "ABHISH" },
  { code: "SEVIK", name: "SEVIKA" },
  { code: "VAISH", name: "VAISHNAVI" },
  { code: "PRASH", name: "PRASHAN" },
  { code: "TEJAS", name: "TEJASWI REDDY" },
  { code: "CHARA", name: "CHARANRE" },
  { code: "SRINI", name: "SRINIKA" },
  { code: "SANDE", name: "SANDEEP" },
  { code: "PRUDH", name: "PRUDHVI" },
  { code: "SRIJA", name: "SRIJA" },
  { code: "VIVEK", name: "VIVEK REDDY" },
  { code: "THIRU", name: "THIRUMALA" }
];

/* ===== Storage keys ===== */
const LS_RESPONSES = "trip_responses"; // kept only for offline fallback
const LS_CURRENT   = "currentUserCode"; // "NIKHI", ...

/* ===== DOM helpers ===== */
const $  = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

document.addEventListener("DOMContentLoaded", async () => {
  setupStartScreen();
  await buildPeopleGrid();     // now async because it fetches remote data
  wireNavigation();
  decideInitialScreen();

  // ---- Firestore realtime subscription (updates everyone instantly) ----
  const { db, fs } = window.FB || {};
  if (db) {
    fs.onSnapshot(fs.collection(db, "responses"), (snap) => {
      const responses = {};
      snap.forEach(doc => {
        const d = doc.data() || {};
        responses[doc.id] = {
          status: d.status || "Pending",
          ts: d.ts ? (d.ts.toDate ? d.ts.toDate().toISOString() : d.ts) : null,
        };
      });
      updateGridBadges(responses);
      if ($("#screen-emergency")?.classList.contains("active")) {
        renderEmergencyWith(responses);
      }
    });
  }
});

/* ===== Router ===== */
function show(id) {
  $$(".screen").forEach(s => s.classList.remove("active"));
  const node = document.getElementById(id);
  if (node) node.classList.add("active");
  if (id === "screen-emergency") renderEmergency();
}

function decideInitialScreen() {
  const savedUser = localStorage.getItem(LS_CURRENT);
  if (savedUser && PEOPLE.find(p => p.code === savedUser)) {
    // Returning user → skip to Emergency
    show("screen-emergency");
  } else {
    show("screen-start");
  }
}

/* ===== Screen 1: 4 checkboxes gate ===== */
function setupStartScreen() {
  const btn   = $("#btn-start-continue");
  const boxes = $$(".ack");
  if (!btn || boxes.length < 4) return;

  const update = () => { btn.disabled = !boxes.every(b => b.checked); };

  update();
  boxes.forEach(b => {
    b.addEventListener("change", update);
    b.addEventListener("input", update);
  });

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    show("screen-response");
  });
}

/* ===== Screen 2: Response ===== */
async function buildPeopleGrid() {
  const grid = $("#people-grid");
  if (!grid) return;

  grid.innerHTML = "";

  let responses = {};
  try { responses = await readResponsesRemote(); }
  catch { responses = readResponsesLocal(); } // offline fallback

  const current = localStorage.getItem(LS_CURRENT);

  PEOPLE.forEach(person => {
    const status = responses[person.code]?.status ?? "Pending";

    const card = document.createElement("div");
    card.className = "person";
    card.dataset.code = person.code;

    const title = document.createElement("h4");
    title.textContent = person.name.toUpperCase();

    const help = document.createElement("div");
    help.className = "muted";
    help.textContent = "Choose a response";

    const badge = document.createElement("span");
    badge.className = "badge " + (
      status === "Interested" ? "ok" :
      status === "Not Interested" ? "no" : "pending"
    );
    badge.textContent = status;

    const group = document.createElement("div");
    group.className = "btn-group";
    const bYes = document.createElement("button");
    bYes.className = "btn";
    bYes.textContent = "Interested";
    const bNo = document.createElement("button");
    bNo.className = "btn";
    bNo.textContent = "Not Interested";

    bYes.addEventListener("click", () => {
      saveResponse(person.code, "Interested", badge);
      show("screen-emergency");   // 👈 immediately go to the Responses page
    });

    bNo.addEventListener("click", () => {
      saveResponse(person.code, "Not Interested", badge);
      // you could also route somewhere here if you want
    });


    group.appendChild(bYes);
    group.appendChild(bNo);

    card.appendChild(title);
    card.appendChild(help);
    card.appendChild(badge);
    card.appendChild(group);
    grid.appendChild(card);
  });

  // lock/unlock based on who validated
  lockAllCards(true);
  const currentCode = current ?? null;
  if (currentCode) unlockCard(currentCode);

  // wire login + next + reset
  $("#btn-validate")?.addEventListener("click", onValidateCode);
  $("#btn-response-next")?.addEventListener("click", () => show("screen-emergency"));
  $("#btn-reset")?.addEventListener("click", resetCurrentUser);
}

function updateGridBadges(responses) {
  $$("#people-grid .person").forEach(card => {
    const code = card.dataset.code;
    const status = responses[code]?.status ?? "Pending";
    const badge = card.querySelector(".badge");
    if (!badge) return;
    badge.className = "badge " + (
      status === "Interested" ? "ok" :
      status === "Not Interested" ? "no" : "pending"
    );
    badge.textContent = status;
  });
}

function lockAllCards(lock = true) {
  $$("#people-grid .person .btn-group").forEach(g => {
    g.querySelectorAll("button").forEach(b => b.disabled = lock);
  });
}
function unlockCard(code) {
  $$("#people-grid .person").forEach(card => {
    const lock = card.dataset.code !== code;
    card.querySelectorAll(".btn-group button").forEach(b => b.disabled = lock);
  });
}

function onValidateCode() {
  const input    = $("#code-input");
  const feedback = $("#code-feedback");
  const code = (input?.value || "").trim().toUpperCase();
  const match = PEOPLE.find(p => p.code === code);

  if (!match) {
    feedback.textContent = "Not found. Enter the first 5 letters of your first name (case-insensitive).";
    feedback.className = "feedback err";
    localStorage.removeItem(LS_CURRENT);
    lockAllCards(true);
    return;
  }

  localStorage.setItem(LS_CURRENT, code);
  feedback.textContent = `Welcome ${match.name}! Your card is unlocked below.`;
  feedback.className = "feedback ok";
  unlockCard(code);
}

async function saveResponse(code, status, badgeEl) {
  try {
    const { db, fs } = window.FB;
    await fs.setDoc(fs.doc(fs.collection(db, "responses"), code), {
      status,
      ts: fs.serverTimestamp(),
    });
    // Optimistic UI; onSnapshot will confirm
    if (badgeEl) {
      badgeEl.className = "badge " + (status === "Interested" ? "ok" : "no");
      badgeEl.textContent = status;
    }
  } catch (e) {
    console.error("Firestore write failed, falling back to localStorage", e);
    const responses = readResponsesLocal();
    responses[code] = { status, ts: new Date().toISOString() };
    localStorage.setItem(LS_RESPONSES, JSON.stringify(responses));
    if (badgeEl) {
      badgeEl.className = "badge " + (status === "Interested" ? "ok" : "no");
      badgeEl.textContent = status;
    }
  }
}

function resetCurrentUser() {
  localStorage.removeItem(LS_CURRENT);
  const feedback = $("#code-feedback");
  if (feedback) { feedback.textContent = ""; feedback.className = "feedback"; }
  const input = $("#code-input"); if (input) input.value = "";
  lockAllCards(true);
}

/* ===== Screen 3: Emergency + Table + Gate ===== */
async function renderEmergency() {
  const { db, fs } = window.FB;
  const snap = await fs.getDocs(fs.collection(db, "responses"));

  const responses = {};
  snap.forEach(doc => {
    const d = doc.data() || {};
    responses[doc.id] = {
      status: d.status || "Pending",
      ts: d.ts && d.ts.toDate ? d.ts.toDate() : null, // normalize
    };
  });

  const tbody = document.querySelector("#responses-table tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  PEOPLE.forEach((p, i) => {
    const status = responses[p.code]?.status || "Pending";
    const whenDate = responses[p.code]?.ts;
    const when = whenDate ? whenDate.toLocaleString() : "—";
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${i + 1}</td><td>${p.name}</td><td>${status}</td><td>${when}</td>`;
    tbody.appendChild(tr);
  });

  const notReady = PEOPLE.filter(p => (responses[p.code]?.status || "Pending") !== "Interested");
  const banner = document.querySelector("#gate-banner");
  if (banner) {
    if (notReady.length) {
      banner.classList.remove("hidden");
      banner.textContent = `⛔ Roadmap locked. Not Interested / Missing: ${notReady.map(n => n.name).join(", ")}`;
    } else {
      banner.classList.add("hidden");
      banner.textContent = "";
    }
  }

  document.getElementById("btn-emergency-back")?.addEventListener("click", () => show("screen-response"));
  document.getElementById("btn-emergency-continue")?.addEventListener("click", () => {
    if (notReady.length) { alert("Everyone must be 'Interested' to open the Roadmap."); return; }
    show("day-1");
  });
}


function renderEmergencyWith(responses) {
  const tbody = $("#responses-table tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  PEOPLE.forEach((p, i) => {
    const status = responses[p.code]?.status || "Pending";
    const when = responses[p.code]?.ts ? new Date(responses[p.code].ts).toLocaleString() : "—";
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${i + 1}</td><td>${p.name}</td><td>${status}</td><td>${when}</td>`;
    tbody.appendChild(tr);
  });

  // Gate
  const notReady = PEOPLE.filter(p => (responses[p.code]?.status || "Pending") !== "Interested");
  const banner = $("#gate-banner");
  if (banner) {
    if (notReady.length) {
      banner.classList.remove("hidden");
      banner.textContent = `⛔ Roadmap locked. Not Interested / Missing: ${notReady.map(n => n.name).join(", ")}`;
    } else {
      banner.classList.add("hidden");
      banner.textContent = "";
    }
  }

  // Buttons
  $("#btn-emergency-back")?.addEventListener("click", () => show("screen-response"));
  $("#btn-emergency-continue")?.addEventListener("click", () => {
    if (notReady.length) { alert("Everyone must be 'Interested' to open the Roadmap."); return; }
    show("day-1");
  });
}

/* ===== Navigation for Next/Previous buttons ===== */
function wireNavigation() {
  document.body.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-goto]");
    if (!btn) return;
    const target = btn.getAttribute("data-goto");
    // Rely on the Emergency screen's gate check; no extra check here
    show(target);
  });
}

/* ===== Storage helpers ===== */
function readResponsesLocal() {
  try { return JSON.parse(localStorage.getItem(LS_RESPONSES) || "{}"); }
  catch { return {}; }
}

async function readResponsesRemote() {
  const { db, fs } = window.FB;
  const snap = await fs.getDocs(fs.collection(db, "responses"));
  const out = {};
  snap.forEach(doc => {
    const data = doc.data() || {};
    out[doc.id] = {
      status: data.status || "Pending",
      ts: data.ts ? (data.ts.toDate ? data.ts.toDate().toISOString() : data.ts) : null,
    };
  });
  return out;
}
