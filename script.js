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
    // Try anonymous auth (if available)
  try {
    const { auth, fa } = window.FB || {};
    if (auth && fa && !fa.currentUser && fa.signInAnonymously) {
      await fa.signInAnonymously(auth);
    }
  } catch (e) { console.log('Anonymous auth not configured:', e?.message || e); }

// Wait until Firebase is ready before touching window.FB
  if (window.FB?.ready) {
    try { await window.FB.ready; } catch (e) { console.error(e); }
  }

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
          },
      (err) => {
        console.warn("Payments listener disabled:", err?.code || err?.message || err);
      }
    );
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
    console.error("Firestore write failed:", e);
    alert("Couldn’t save to the cloud. Check auth/rules/network and retry.");
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


/* ===== Payments Table ===== */
const LS_PAYMENTS_ADMIN = "payments_admin_unlocked";
const PAYMENTS_UNLOCK_CODE = "FallTour@2025";

document.addEventListener("DOMContentLoaded", async () => {
  // Build once at startup (if the screen exists)
  await buildPaymentsTable?.();

  // Firestore realtime updates for payments
  const { db, fs } = window.FB || {};
  if (db) {
    fs.onSnapshot(
      fs.collection(db, "payments"),
      (snap) => {
      const payments = {};
      snap.forEach(doc => {
        const d = doc.data() || {};
        payments[doc.id] = { status: d.status || "Unpaid", ts: d.ts ? (d.ts.toDate ? d.ts.toDate().toISOString() : d.ts) : null };
      });
      updatePaymentsButtons(payments);
          },
      (err) => {
        console.warn("Payments listener disabled:", err?.code || err?.message || err);
      }
    );
  }
});

async function buildPaymentsTable() {
  const tbody = document.querySelector("#payments-table tbody");
  if (!tbody) return; // screen not present
  tbody.innerHTML = "";

  let payments = {};
  try { payments = await readPaymentsRemote(); }
  catch { payments = readPaymentsLocal(); }

  // Build rows
  PEOPLE.forEach(p => {
    const row = document.createElement("tr");
    row.setAttribute("data-code", p.code);

    const nameTd = document.createElement("td");
    nameTd.textContent = p.name;

    const btnTd = document.createElement("td");
    const status = payments[p.code]?.status || "Unpaid";
    const btn = document.createElement("button");
    btn.className = "btn " + (status === "Paid" ? "primary" : "ghost");
    btn.textContent = status;
    btn.dataset.paybtn = "1";
    btn.dataset.code = p.code;
    btn.disabled = !isPaymentsAdmin();

    btn.addEventListener("click", () => {
      if (!isPaymentsAdmin()) return;
      const next = (btn.textContent === "Paid") ? "Unpaid" : "Paid";
      savePaymentStatus(p.code, next, btn);
    });

    btnTd.appendChild(btn);
    row.appendChild(nameTd);
    row.appendChild(btnTd);
    tbody.appendChild(row);
  });

  // Wire unlock
  const input = document.getElementById("payments-code");
  const unlockBtn = document.getElementById("btn-payments-unlock");
  const feedback = document.getElementById("payments-feedback");
  if (unlockBtn) {
    unlockBtn.addEventListener("click", () => {
      const code = (input?.value || "").trim();
      if (code === PAYMENTS_UNLOCK_CODE) {
        localStorage.setItem(LS_PAYMENTS_ADMIN, "1");
        lockPaymentsEditing(false);
        if (feedback) { feedback.textContent = "Editing unlocked."; feedback.className = "feedback ok"; }
      } else {
        localStorage.removeItem(LS_PAYMENTS_ADMIN);
        lockPaymentsEditing(true);
        if (feedback) { feedback.textContent = "Incorrect code."; feedback.className = "feedback err"; }
      }
    });
  }

  // Apply persisted state
  lockPaymentsEditing(!isPaymentsAdmin());
}

function isPaymentsAdmin() {
  return localStorage.getItem(LS_PAYMENTS_ADMIN) === "1";
}
function lockPaymentsEditing(lock = true) {
  document.querySelectorAll('#payments-table [data-paybtn="1"]').forEach(btn => {
    btn.disabled = !!lock;
  });
}
function updatePaymentsButtons(payments) {
  document.querySelectorAll('#payments-table [data-paybtn="1"]').forEach(btn => {
    const code = btn.dataset.code;
    const status = payments[code]?.status || "Unpaid";
    btn.textContent = status;
    btn.className = "btn " + (status === "Paid" ? "primary" : "ghost");
  });
}

async function savePaymentStatus(code, status, btnEl) {
  try {
    const { db, fs } = window.FB;
    await fs.setDoc(fs.doc(fs.collection(db, "payments"), code), {
      status,
      ts: fs.serverTimestamp(),
    });
    if (btnEl) {
      btnEl.textContent = status;
      btnEl.className = "btn " + (status === "Paid" ? "primary" : "ghost");
    }
  } catch (e) {
    console.error("Firestore write failed:", e);
    alert("Couldn’t save payment status. Check network/auth rules and retry.");
  }
}

function readPaymentsLocal() {
  try { return JSON.parse(localStorage.getItem("trip_payments") || "{}"); }
  catch { return {}; }
}
async function readPaymentsRemote() {
  const { db, fs } = window.FB;
  const snap = await fs.getDocs(fs.collection(db, "payments"));
  const out = {};
  snap.forEach(doc => {
    const data = doc.data() || {};
    out[doc.id] = {
      status: data.status || "Unpaid",
      ts: data.ts ? (data.ts.toDate ? data.ts.toDate().toISOString() : data.ts) : null,
    };
  });
  return out;
}

/* ===== Total Budget Table (client-side) ===== */
const LS_BUDGET_ROWS = "trip_budget_rows_v1";
const LS_BUDGET_ADMIN = "budget_admin_unlocked";
const BUDGET_UNLOCK_CODE = PAYMENTS_UNLOCK_CODE; // same code: FallTour@2025
const BUDGET_TOTAL = 8500;

document.addEventListener("DOMContentLoaded", () => {
  buildBudgetTable?.();
});

function isBudgetAdmin() {
  return localStorage.getItem(LS_BUDGET_ADMIN) === "1";
}

function lockBudgetEditing(lock = true) {
  document.querySelectorAll('#budget-table select, #budget-table input[type="number"]').forEach(el => {
    el.disabled = !!lock;
  });
  const addBtn = document.getElementById("btn-add-budget-row");
  if (addBtn) addBtn.disabled = !!lock;
}

function buildBudgetTable() {
  const table = document.getElementById("budget-table");
  if (!table) return;

  const tbody = table.querySelector("tbody");
  tbody.innerHTML = "";

  // Load saved rows or create 5 starter rows
  const rows = loadBudgetRows() || Array.from({ length: 5 }).map(() => ({ receipt: "", paidBy: "", amount: "" }));

  rows.forEach((row, idx) => {
    tbody.appendChild(makeBudgetRow(row, idx));
  });

  // Wire unlock
  const input = document.getElementById("budget-code");
  const unlockBtn = document.getElementById("btn-budget-unlock");
  const feedback = document.getElementById("budget-feedback");
  if (unlockBtn) {
    unlockBtn.addEventListener("click", () => {
      const code = (input?.value || "").trim();
      if (code === BUDGET_UNLOCK_CODE) {
        localStorage.setItem(LS_BUDGET_ADMIN, "1");
        lockBudgetEditing(false);
        if (feedback) { feedback.textContent = "Editing unlocked."; feedback.className = "feedback ok"; }
      } else {
        localStorage.removeItem(LS_BUDGET_ADMIN);
        lockBudgetEditing(true);
        if (feedback) { feedback.textContent = "Incorrect code."; feedback.className = "feedback err"; }
      }
    });
  }

  // Add row button
  document.getElementById("btn-add-budget-row")?.addEventListener("click", () => {
    const newRow = { receipt: "", paidBy: "", amount: "" };
    const tr = makeBudgetRow(newRow, tbody.children.length);
    tbody.appendChild(tr);
    saveBudgetRows();
    recalcBudgetRemaining();
  });

  // Apply lock state then recalc
  lockBudgetEditing(!isBudgetAdmin());
  recalcBudgetRemaining();
}


// Map display name to 5-letter code using PEOPLE
function codeForName(name) {
  const p = PEOPLE.find(x => (x.name || "").toLowerCase().includes((name||"").toLowerCase()));
  // Fallback quick map for the 3 names we use
  if (!p) {
    if ((name||"").toLowerCase().startsWith("tejas")) return "TEJAS";
    if ((name||"").toLowerCase().startsWith("keer")) return "KEERT";
    if ((name||"").toLowerCase().startsWith("srini")) return "SRINI";
  }
  return p?.code || null;
}

async function saveBudgetRow(tr) {
  const { db, fs, storage, st } = window.FB || {};
  if (!db || !storage) { alert("Firebase not ready."); return; }

  const selReceipt = tr.querySelector("select[data-field='receipt']");
  const selPaid    = tr.querySelector("select[data-field='paidBy']");
  const amt        = tr.querySelector('input[data-field="amount"]');
  const textInput  = tr.querySelector('input[data-field="receiptText"]');
  const fileInput  = tr.querySelector('input[data-field="receiptFile"]');

  const receiptType = selReceipt?.value || "";
  const paidByName  = selPaid?.value || "";
  const amountNum   = amt?.value ? Number(amt.value) : NaN;

  if (!paidByName) return alert("Select who paid.");
  if (!receiptType) return alert("Choose a receipt option.");
  if (!Number.isFinite(amountNum) || amountNum < 0) return alert("Enter a valid amount.");

  let fileUrl = "";
  if (fileInput && fileInput.files && fileInput.files[0]) {
    const file = fileInput.files[0];
    // allow images or pdf
    const ok = file.type.startsWith("image/") || file.type === "application/pdf";
    if (!ok) return alert("Only images or PDF allowed.");
    const code = codeForName(paidByName) || "GEN";
    const fn = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;
    const path = `budgets/${code}/${fn}`;
    const r = st.ref(storage, path);
    await st.uploadBytes(r, file);
    fileUrl = await st.getDownloadURL(r);
  }

  const data = {
    receiptType,
    receiptText: receiptType === "Text" ? (textInput?.value || "") : "",
    paidBy: paidByName,
    amount: amountNum,
    fileUrl,
    ts: fs.serverTimestamp()
  };

  // Write to budgets/{code}/rows/{auto}
  const code = codeForName(paidByName);
  if (!code) return alert("Unknown person code for " + paidByName);
  const col = fs.collection(db, `budgets/${code}/rows`);
  // Using setDoc with a random doc id via collection().doc() is not available in v9 tree-shake;
  // Use add via setDoc on doc(collection) with auto id:
  const { doc, setDoc } = fs;
  const newDocRef = fs.doc(col); // create an unbound ref to get random id
  await fs.setDoc(newDocRef, data);
  // Give a tiny visual confirmation
  tr.classList.add("saved");
  setTimeout(() => tr.classList.remove("saved"), 800);
}


function makeBudgetRow(data, idx) {
  const tr = document.createElement("tr");

  // Receipt dropdown
  const tdReceipt = document.createElement("td");
  const selReceipt = document.createElement("select"); selReceipt.setAttribute("data-field","receipt");
  ["", "Text", "Camera", "Select From Device"].forEach(opt => {
    const o = document.createElement("option");
    o.value = opt;
    o.textContent = opt || "Choose…";
    if (data.receipt === opt) o.selected = true;
    selReceipt.appendChild(o);
  });
  selReceipt.addEventListener("change", () => { saveBudgetRows(); });
  tdReceipt.appendChild(selReceipt);

  // Paid By dropdown
  const tdPaidBy = document.createElement("td");
  const selPaid = document.createElement("select"); selPaid.setAttribute("data-field","paidBy");
  ["", "Tejaswi", "Keerthi", "Srinika"].forEach(opt => {
    const o = document.createElement("option");
    o.value = opt;
    o.textContent = opt || "Choose…";
    if (data.paidBy === opt) o.selected = true;
    selPaid.appendChild(o);
  });
  selPaid.addEventListener("change", () => { saveBudgetRows(); });
  tdPaidBy.appendChild(selPaid);

  // Amount number
  const tdAmt = document.createElement("td");
  const inputAmt = document.createElement("input");
  inputAmt.type = "number"; inputAmt.setAttribute("data-field","amount");
  inputAmt.min = "0";
  inputAmt.step = "1";
  inputAmt.value = data.amount ?? "";
  inputAmt.placeholder = "0";
  inputAmt.addEventListener("input", () => { saveBudgetRows(); recalcBudgetRemaining(); });
  tdAmt.appendChild(inputAmt);

  tr.appendChild(tdReceipt);
  tr.appendChild(tdPaidBy);
  tr.appendChild(tdAmt);

  // Dynamic inputs for receipt: text or file
  const tdExtra = document.createElement("td");
  tdExtra.colSpan = 3;
  tdExtra.style.paddingTop = "8px";

  const inputText = document.createElement("input");
  inputText.type = "text";
  inputText.placeholder = "Describe receipt (only for Text option)";
  inputText.style.display = "none";
  inputText.setAttribute("data-field","receiptText");
  inputText.addEventListener("input", () => { saveBudgetRows(); });

  const inputFile = document.createElement("input");
  inputFile.type = "file";
  inputFile.accept = "image/*,application/pdf";
  inputFile.style.display = "none";
  inputFile.setAttribute("data-field","receiptFile");
  inputFile.addEventListener("change", () => { /* no-op */ });

  // Toggle controls based on receipt type
  function updateReceiptControls() {
    const v = selReceipt.value;
    inputText.style.display = (v === "Text") ? "" : "none";
    inputFile.style.display = (v === "Camera" || v === "Select From Device") ? "" : "none";
    // For "Camera", hint camera
    if (v === "Camera") {
      inputFile.accept = "image/*";
      inputFile.setAttribute("capture", "environment");
    } else {
      inputFile.accept = "image/*,application/pdf";
      inputFile.removeAttribute("capture");
    }
  }
  selReceipt.addEventListener("change", () => { updateReceiptControls(); saveBudgetRows(); });

  tdExtra.appendChild(inputText);
  tdExtra.appendChild(inputFile);

  // Row Save button
  const tdActions = document.createElement("td");
  tdActions.colSpan = 3;
  const btnSave = document.createElement("button");
  btnSave.className = "btn";
  btnSave.textContent = "Save Row";
  btnSave.addEventListener("click", async () => {
    if (!isBudgetAdmin()) return alert("Enter the password to edit.");
    try { await saveBudgetRow(tr); alert("Saved!"); }
    catch (e) { console.error(e); alert("Save failed: " + (e?.message || e)); }
  });
  tdActions.appendChild(btnSave);

  const trExtra = document.createElement("tr");
  const trActions = document.createElement("tr");
  trExtra.appendChild(tdExtra);
  trActions.appendChild(tdActions);

  // insert helpers row after main row
  tr.parentElement && tr.parentElement.appendChild(trExtra);
  tr.parentElement && tr.parentElement.appendChild(trActions);

  updateReceiptControls();

  return tr;
}

function loadBudgetRows() {
  try { return JSON.parse(localStorage.getItem(LS_BUDGET_ROWS) || "null"); }
  catch { return null; }
}

function saveBudgetRows() {
  const rows = [];
  document.querySelectorAll("#budget-table tbody tr").forEach(tr => {
    const selReceipt = tr.querySelector("select:nth-of-type(1)");
    const selPaid = tr.querySelector("select:nth-of-type(2)");
    const amt = tr.querySelector('input[type=\"number\"]');
    rows.push({
      receipt: selReceipt?.value || "",
      paidBy: selPaid?.value || "",
      amount: amt?.value ? Number(amt.value) : ""
    });
  });
  localStorage.setItem(LS_BUDGET_ROWS, JSON.stringify(rows));
}

function recalcBudgetRemaining() {
  let spent = 0;
  document.querySelectorAll('#budget-table input[type="number"]').forEach(inp => {
    const v = Number(inp.value || 0);
    if (!isNaN(v)) spent += v;
  });
  const remaining = Math.max(0, BUDGET_TOTAL - spent);
  const el = document.getElementById("budget-remaining");
  if (el) el.textContent = `$${remaining}`;
}

