/*
 * Learn Labs 2 & 3 — Checksums and Verification of Payee.
 *
 * This file is loaded AFTER learn-labs.js and BEFORE learn.js. It only
 * registers labs "2" and "3" on the shared window.LearnLabs map so it
 * cannot clobber labs owned by other agents.
 *
 *   Lab 2: "Is It Real? Checksums"        — MOD-97 IBAN validation
 *   Lab 3: "Right Person? VoP"            — name verification + outcomes
 *
 * Each lab is a function(main, helpers) where helpers = { el, glossify,
 * markComplete, getProgress }.
 */
(function () {
  "use strict";

  // HTML escape helper (prevents XSS from API/user data)
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  // Guard against redefinition / parallel agents. We always merge into the
  // shared map rather than replacing it.
  window.LearnLabs = window.LearnLabs || {};

  const VALID_IBAN_DE = "DE89370400440532013000";
  const VALID_IBAN_GB = "GB29NWBK60161331926819";
  const INVALID_IBAN_GB = "GB29NWBK60161331926818"; // last digit flipped

  // Shared API helpers ------------------------------------------------------

  async function validateIban(value) {
    const res = await fetch("/api/validate?value=" + encodeURIComponent(value));
    if (!res.ok) throw new Error("Validation request failed");
    return res.json();
  }

  async function verifyPayee(iban, name) {
    const res = await fetch("/api/verify-payee", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ iban, name }),
    });
    if (!res.ok) throw new Error("Verification request failed");
    return res.json();
  }

  // =========================================================================
  // LAB 2 — Is It Real? Checksums
  // =========================================================================
  LearnLabs["2"] = function (main, helpers) {
    const { el, glossify, markComplete } = helpers;

    // ── Header ──────────────────────────────────────────────
    const header = el("div", "lab-header");
    header.innerHTML = `
      <div class="lab-badge">Lab 2</div>
      <h1>Is It Real? Checksums</h1>
      <p>How banks catch a wrong account number before a single cent moves.</p>`;
    main.appendChild(header);

    // ── Concept: why checksums ──────────────────────────────
    const c1 = el("div", "concept");
    c1.innerHTML = `
      <h2>Why IBANs have checksums</h2>
      <p>${glossify(
        "Imagine sending money to a 22-character account number you typed by hand. One wrong digit and the payment disappears into a stranger's account. To stop that, every IBAN has a built-in safety net called a checksum. It's a tiny piece of math baked into the number itself: change a single digit and the math stops working, so the IBAN is flagged as invalid before any money leaves your account."
      )}</p>
      <p>The clever bit is that the check uses an algorithm called ${glossify(
        "MOD-97"
      )} — and it works no matter which country the IBAN comes from.</p>`;
    main.appendChild(c1);

    // ── Concept: the MOD-97 check ───────────────────────────
    const c2 = el("div", "concept");
    c2.innerHTML = `
      <h2>The MOD-97 check</h2>
      <p>Here's the simple version: <strong>the 3rd and 4th characters of an IBAN are a 2-digit checksum</strong>. They're calculated from all the other characters in the number. When a bank receives an IBAN, it shuffles the characters around, treats them as one giant number, divides by 97, and checks the remainder. If the remainder isn't exactly <strong>1</strong>, the IBAN is broken.</p>
      <p>The practical upshot: <strong>if even one digit is wrong, the checksum won't match.</strong> A typo is caught in milliseconds, not after the money has gone.</p>`;
    main.appendChild(c2);

    // ── Demo 1: try a valid IBAN ────────────────────────────
    const demo1 = el("div", "demo");
    demo1.innerHTML = `
      <div class="demo-label">Try a valid IBAN</div>
      <p class="muted" style="margin-bottom:0.75rem">Here's a real-format German IBAN. Click <strong>Check</strong> to validate it.</p>
      <input class="lab-input" id="lab2-valid-input" value="${VALID_IBAN_DE}">
      <button class="lab-btn" id="lab2-valid-btn">Check</button>
      <div class="lab-result" id="lab2-valid-result"></div>`;
    main.appendChild(demo1);

    async function runValid() {
      const input = document.getElementById("lab2-valid-input").value.trim();
      const box = document.getElementById("lab2-valid-result");
      box.className = "lab-result show";
      box.innerHTML = `<span class="muted">Checking…</span>`;
      try {
        const r = await validateIban(input);
        if (r.valid) {
          box.className = "lab-result show lab-result-success";
          box.innerHTML = `
            <p><span class="badge badge-green">VALID</span> &nbsp;This IBAN passes the ${glossify(
              "MOD-97"
            )} checksum.</p>
            <p class="muted" style="margin-top:4px">The two checksum digits (here <span class="mono">89</span>) match what the math says they should be. Format is correct.</p>`;
        } else {
          box.className = "lab-result show lab-result-error";
          box.innerHTML = `<p><span class="badge badge-red">INVALID</span> &nbsp;${esc(
            (r.errors || ["Checksum failed"]).join("; ")
          )}</p>`;
        }
      } catch (e) {
        box.className = "lab-result show lab-result-error";
        box.innerHTML = `<p class="muted">Error: ${esc(e.message)}</p>`;
      }
    }
    document.getElementById("lab2-valid-btn").addEventListener("click", runValid);

    // ── Demo 2: break it ────────────────────────────────────
    const demo2 = el("div", "demo");
    demo2.innerHTML = `
      <div class="demo-label">Break it!</div>
      <p class="muted" style="margin-bottom:0.75rem">Same IBAN, but change <strong>one digit</strong> — any digit. Then hit Check and watch the checksum fail.</p>
      <input class="lab-input" id="lab2-broken-input" value="${VALID_IBAN_DE}">
      <button class="lab-btn" id="lab2-broken-btn">Check</button>
      <div class="lab-result" id="lab2-broken-result"></div>`;
    main.appendChild(demo2);

    async function runBroken() {
      const input = document.getElementById("lab2-broken-input").value.trim();
      const box = document.getElementById("lab2-broken-result");
      // Highlight the field as "tampered"
      const field = document.getElementById("lab2-broken-input");
      if (input !== VALID_IBAN_DE) {
        field.classList.add("seg-invalid");
      } else {
        field.classList.remove("seg-invalid");
      }
      box.className = "lab-result show";
      box.innerHTML = `<span class="muted">Checking…</span>`;
      try {
        const r = await validateIban(input);
        if (r.valid) {
          box.className = "lab-result show lab-result-success";
          box.innerHTML = `<p><span class="badge badge-green">VALID</span> &nbsp;This still passes — you haven't actually changed it yet. Edit a digit above and try again.</p>`;
        } else {
          box.className = "lab-result show lab-result-error";
          box.innerHTML = `
            <p><span class="badge badge-red">INVALID</span> &nbsp;Checksum mismatch.</p>
            <p class="muted" style="margin-top:4px"><strong>Why?</strong> You changed a digit, so the giant number no longer leaves a remainder of 1 when divided by 97. The two checksum digits (89) no longer fit the rest of the IBAN, so the bank rejects it instantly — no money lost.</p>`;
        }
      } catch (e) {
        box.className = "lab-result show lab-result-error";
        box.innerHTML = `<p class="muted">Error: ${esc(e.message)}</p>`;
      }
    }
    document.getElementById("lab2-broken-btn").addEventListener("click", runBroken);

    // ── Callout: format vs existence ────────────────────────
    const callout = el("div", "callout");
    callout.innerHTML = `
      <div class="callout-title">Format vs. Existence</div>
      A valid checksum only proves the IBAN is <strong>formatted correctly</strong>. It does <strong>not</strong> prove the account exists, or that it belongs to the person you think. That's a separate problem — and it's exactly what <strong>Verification of Payee</strong> solves in Lab 3.`;
    main.appendChild(callout);

    // ── Exercise: find the typo ─────────────────────────────
    const exercise = el("div", "exercise");
    exercise.innerHTML = `
      <div class="exercise-header">
        <span class="exercise-badge">?</span>
        <span class="exercise-title">Exercise: Find the typo</span>
      </div>
      <p class="exercise-prompt">Two IBANs below differ by a single digit. One is valid, one has a typo. Use the checker on each and pick the valid one.</p>
      <div class="demo-label">Option A</div>
      <div class="mono" style="margin-bottom:0.5rem">${VALID_IBAN_GB}</div>
      <div class="demo-label">Option B</div>
      <div class="mono" style="margin-bottom:0.75rem">${INVALID_IBAN_GB}</div>
      <div style="display:flex; gap:0.5rem; flex-wrap:wrap">
        <button class="lab-btn secondary" data-ex-pick="A">Check Option A</button>
        <button class="lab-btn secondary" data-ex-pick="B">Check Option B</button>
      </div>
      <div class="lab-result" id="lab2-ex-result" style="margin-top:0.75rem"></div>`;
    main.appendChild(exercise);

    const exResult = () => document.getElementById("lab2-ex-result");
    exercise.querySelectorAll("[data-ex-pick]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const pick = btn.dataset.exPick;
        const value = pick === "A" ? VALID_IBAN_GB : INVALID_IBAN_GB;
        const box = exResult();
        box.className = "lab-result show";
        box.innerHTML = `<span class="muted">Checking Option ${pick}…</span>`;
        try {
          const r = await validateIban(value);
          if (r.valid && pick === "A") {
            box.className = "lab-result show lab-result-success";
            box.innerHTML = `
              <p><span class="badge badge-green">CORRECT</span> &nbsp;Option A is the valid IBAN.</p>
              <p class="muted" style="margin-top:4px">Option B ends in <span class="mono">…6818</span> instead of <span class="mono">…6819</span> — one digit off — so its checksum fails. That single typo is enough for a bank to refuse the payment.</p>`;
            markComplete("2");
          } else if (!r.valid && pick === "B") {
            box.className = "lab-result show lab-result-warn";
            box.innerHTML = `
              <p><span class="badge badge-amber">INVALID</span> &nbsp;Right — Option B fails the checksum.</p>
              <p class="muted" style="margin-top:4px">But B is the broken one. Now check <strong>Option A</strong> to confirm it's the valid account.</p>`;
          } else if (r.valid && pick === "B") {
            // Shouldn't happen, but handle gracefully.
            box.className = "lab-result show lab-result-success";
            box.innerHTML = `<p>Option B validated — interesting. Now confirm Option A too.</p>`;
          } else {
            box.className = "lab-result show lab-result-warn";
            box.innerHTML = `<p><span class="badge badge-amber">INVALID</span> &nbsp;Option A failed the checksum. Try the other one.</p>`;
          }
        } catch (e) {
          box.className = "lab-result show lab-result-error";
          box.innerHTML = `<p class="muted">Error: ${esc(e.message)}</p>`;
        }
      });
    });

    // ── Lab nav ─────────────────────────────────────────────
    appendLabNav(main, "1", "3");
  };

  // =========================================================================
  // LAB 3 — Right Person? Verification of Payee
  // =========================================================================
  LearnLabs["3"] = function (main, helpers) {
    const { el, glossify, markComplete } = helpers;

    // ── Header ──────────────────────────────────────────────
    const header = el("div", "lab-header");
    header.innerHTML = `
      <div class="lab-badge">Lab 3</div>
      <h1>Right Person? Verification of Payee</h1>
      <p>What if the account number is valid — but you're paying the wrong person?</p>`;
    main.appendChild(header);

    // ── Concept: the problem VoP solves ─────────────────────
    const c1 = el("div", "concept");
    c1.innerHTML = `
      <h2>The problem VoP solves</h2>
      <p>${glossify(
        "A valid IBAN only means the number is formatted correctly (you saw that in Lab 2). It says nothing about <em>who owns the account</em>. Here's the fraud scenario: a scammer tells you their sort code and account number — perfectly valid — and asks you to send money to “Alice.” You type Alice's name, but the account actually belongs to the scammer. The money leaves. It's gone."
      )}</p>
      <p>${glossify(
        "Verification of Payee (VoP) catches this <strong>before</strong> you send. When you enter a beneficiary name, the receiving bank quietly checks it against the name on the account and tells your bank how close they are. The UK equivalent is Confirmation of Payee (CoP); in the EU, VoP became mandatory in 2025."
      )}</p>`;
    main.appendChild(c1);

    // ── Concept: the four outcomes ──────────────────────────
    const c2 = el("div", "concept");
    c2.innerHTML = `
      <h2>The four outcomes</h2>
      <p>Every VoP check returns exactly one of these:</p>
      <table style="width:100%; border-collapse:collapse; font-size:0.875rem; margin-top:0.5rem">
        <thead>
          <tr style="text-align:left; border-bottom:1px solid var(--border)">
            <th style="padding:0.4rem 0.5rem">Outcome</th>
            <th style="padding:0.4rem 0.5rem">When</th>
            <th style="padding:0.4rem 0.5rem">What you learn</th>
          </tr>
        </thead>
        <tbody>
          <tr style="border-bottom:1px solid var(--border)">
            <td style="padding:0.4rem 0.5rem"><span class="badge badge-green">MATCH</span></td>
            <td style="padding:0.4rem 0.5rem">Names are ≥ 90% similar</td>
            <td style="padding:0.4rem 0.5rem">Right account. Safe to send.</td>
          </tr>
          <tr style="border-bottom:1px solid var(--border)">
            <td style="padding:0.4rem 0.5rem"><span class="badge badge-amber">CLOSE_MATCH</span></td>
            <td style="padding:0.4rem 0.5rem">75% – 90% similar (likely a typo)</td>
            <td style="padding:0.4rem 0.5rem">The real name is returned so you can confirm.</td>
          </tr>
          <tr style="border-bottom:1px solid var(--border)">
            <td style="padding:0.4rem 0.5rem"><span class="badge badge-red">NO_MATCH</span></td>
            <td style="padding:0.4rem 0.5rem">Under 75% similar</td>
            <td style="padding:0.4rem 0.5rem">Name withheld — almost certainly the wrong account.</td>
          </tr>
          <tr>
            <td style="padding:0.4rem 0.5rem"><span class="muted">NOT_CHECKED</span></td>
            <td style="padding:0.4rem 0.5rem">The bank doesn't participate</td>
            <td style="padding:0.4rem 0.5rem">No answer available — proceed with caution.</td>
          </tr>
        </tbody>
      </table>`;
    main.appendChild(c2);

    // ── Interactive demo: try it yourself ───────────────────
    const demo = el("div", "demo");
    demo.innerHTML = `
      <div class="demo-label">Try it yourself</div>
      <p class="muted" style="margin-bottom:0.75rem">Enter a beneficiary IBAN and the name <em>as the payer typed it</em>, then verify. The account behind this IBAN belongs to <strong>John Smith</strong>.</p>
      <div style="margin-bottom:0.5rem">
        <label class="demo-label" for="lab3-iban" style="margin-bottom:2px">IBAN</label>
        <input class="lab-input" id="lab3-iban" value="${VALID_IBAN_GB}">
      </div>
      <div style="margin-bottom:0.5rem">
        <label class="demo-label" for="lab3-name" style="margin-bottom:2px">Name (as payer entered)</label>
        <input class="lab-input" id="lab3-name" placeholder="e.g. John Smith">
      </div>
      <button class="lab-btn" id="lab3-verify-btn">Verify</button>
      <div class="lab-result" id="lab3-result"></div>`;
    main.appendChild(demo);

    // ── Pre-built scenarios ─────────────────────────────────
    const scenarios = el("div", "demo");
    scenarios.innerHTML = `
      <div class="demo-label">Quick scenarios</div>
      <p class="muted" style="margin-bottom:0.75rem">One click fills the form and runs the check.</p>
      <div style="display:flex; gap:0.5rem; flex-wrap:wrap">
        <button class="lab-btn secondary" data-scenario="match">✓ Exact match</button>
        <button class="lab-btn secondary" data-scenario="close">⚠ Close match (typo)</button>
        <button class="lab-btn secondary" data-scenario="nomatch">✗ No match (fraud)</button>
      </div>`;
    main.appendChild(scenarios);

    const SCENARIOS = {
      match: { name: "John Smith" },
      close: { name: "Jon Smyth" },
      nomatch: { name: "Fraudster McScam" },
    };

    // Outcome → score-bar colour + result panel tone
    const TONE = {
      MATCH: { bar: "var(--green)", tone: "lab-result-success", badge: "badge-green" },
      CLOSE_MATCH: { bar: "var(--amber)", tone: "lab-result-warn", badge: "badge-amber" },
      NO_MATCH: { bar: "var(--red)", tone: "lab-result-error", badge: "badge-red" },
      NOT_CHECKED: { bar: "var(--ink-3)", tone: "lab-result-warn", badge: "badge-amber" },
    };

    async function runVerify(opts = {}) {
      const iban = document.getElementById("lab3-iban").value.trim();
      const name = (opts.name != null ? opts.name : document.getElementById("lab3-name").value).trim();
      if (opts.name != null) {
        document.getElementById("lab3-name").value = opts.name;
      }
      if (!iban || !name) return;
      const box = document.getElementById("lab3-result");
      box.className = "lab-result show";
      box.innerHTML = `<span class="muted">Verifying…</span>`;
      try {
        const r = await verifyPayee(iban, name);
        const tone = TONE[r.outcome] || TONE.NOT_CHECKED;
        const pct = r.score != null ? Math.round(r.score * 100) : 0;

        let html = `
          <div style="display:flex; align-items:center; gap:0.75rem; margin-bottom:0.5rem">
            <span class="badge ${esc(tone.badge)}">${esc(r.outcome)}</span>
            ${r.score != null ? `<span class="muted">similarity: <strong>${esc(r.score.toFixed(2))}</strong> (${esc(pct)}%)</span>` : ""}
          </div>`;

        if (r.score != null) {
          html += `
            <div class="score-bar-container">
              <div class="score-bar-fill" style="width:${pct}%; background:${tone.bar}">${pct}%</div>
            </div>`;
        }

        if (r.outcome === "CLOSE_MATCH" && r.account_holder_name) {
          html += `
            <p style="margin-top:0.5rem"><strong>Real name on the account:</strong> <span class="mono">${esc(r.account_holder_name)}</span></p>
            <p class="muted" style="margin-top:2px">Because it's a close match, the bank returns the real name so the payer can eyeball it before sending.</p>`;
        } else if (r.outcome === "NO_MATCH") {
          html += `<p style="margin-top:0.5rem"><strong>Real name on the account:</strong> <span class="muted">withheld</span></p>
            <p class="muted" style="margin-top:2px">On a clear mismatch the bank does <em>not</em> reveal the real name — that's a privacy safeguard (see the callout below).</p>`;
        } else if (r.outcome === "MATCH") {
          html += `<p class="muted" style="margin-top:0.5rem">Names line up closely enough — safe to proceed.</p>`;
        } else if (r.outcome === "NOT_CHECKED") {
          html += `<p class="muted" style="margin-top:0.5rem">No account found for that IBAN, or the bank doesn't participate in VoP. No result available.</p>`;
        }

        if (r.advice) {
          html += `<p class="muted" style="margin-top:0.5rem; font-style:italic">${esc(r.advice)}</p>`;
        }

        box.className = "lab-result show " + tone.tone;
        box.innerHTML = html;
      } catch (e) {
        box.className = "lab-result show lab-result-error";
        box.innerHTML = `<p class="muted">Error: ${esc(e.message)}</p>`;
      }
    }

    document.getElementById("lab3-verify-btn").addEventListener("click", () => runVerify());
    document.getElementById("lab3-name").addEventListener("keydown", (e) => {
      if (e.key === "Enter") runVerify();
    });
    scenarios.querySelectorAll("[data-scenario]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const s = SCENARIOS[btn.dataset.scenario];
        runVerify({ name: s.name });
      });
    });

    // ── Exercise: find a close match ────────────────────────
    const exercise = el("div", "exercise");
    exercise.innerHTML = `
      <div class="exercise-header">
        <span class="exercise-badge">?</span>
        <span class="exercise-title">Exercise: Find a close match</span>
      </div>
      <p class="exercise-prompt">Type a name that scores <strong>between 0.75 and 0.90</strong> against account <span class="mono">${VALID_IBAN_GB}</span> (owned by “John Smith”). What outcome do you get?</p>
      <div style="display:flex; gap:0.5rem; flex-wrap:wrap; align-items:flex-end">
        <div style="flex:1; min-width:220px">
          <label class="demo-label" for="lab3-ex-name" style="margin-bottom:2px">Your name</label>
          <input class="lab-input" id="lab3-ex-name" placeholder="Try a deliberate misspelling…">
        </div>
        <button class="lab-btn" id="lab3-ex-btn">Verify &amp; check</button>
      </div>
      <div class="lab-result" id="lab3-ex-result" style="margin-top:0.75rem"></div>`;
    main.appendChild(exercise);

    document.getElementById("lab3-ex-btn").addEventListener("click", async () => {
      const iban = VALID_IBAN_GB;
      const name = document.getElementById("lab3-ex-name").value.trim();
      const box = document.getElementById("lab3-ex-result");
      if (!name) {
        box.className = "lab-result show lab-result-warn";
        box.innerHTML = `<p class="muted">Enter a name first.</p>`;
        return;
      }
      box.className = "lab-result show";
      box.innerHTML = `<span class="muted">Verifying…</span>`;
      try {
        const r = await verifyPayee(iban, name);
        const tone = TONE[r.outcome] || TONE.NOT_CHECKED;
        const pct = r.score != null ? Math.round(r.score * 100) : 0;
        const inRange = r.score != null && r.score >= 0.75 && r.score < 0.9;

        let html = `
          <div style="display:flex; align-items:center; gap:0.75rem; margin-bottom:0.5rem">
            <span class="badge ${esc(tone.badge)}">${esc(r.outcome)}</span>
            ${r.score != null ? `<span class="muted">similarity: <strong>${esc(r.score.toFixed(2))}</strong> (${esc(pct)}%)</span>` : ""}
          </div>`;
        if (r.score != null) {
          html += `<div class="score-bar-container">
              <div class="score-bar-fill" style="width:${pct}%; background:${tone.bar}">${pct}%</div>
            </div>`;
        }

        if (inRange) {
          html += `
            <p style="margin-top:0.5rem"><span class="badge badge-green">NICE</span> &nbsp;That landed in the close-match band (0.75–0.90), so the outcome is <strong>${esc(r.outcome)}</strong>.</p>`;
          if (r.account_holder_name) {
            html += `<p class="muted" style="margin-top:2px">The bank returned the real name — <span class="mono">${esc(r.account_holder_name)}</span> — so the payer can confirm before sending.</p>`;
          }
          markComplete("3");
        } else if (r.score != null && r.score >= 0.9) {
          html += `<p style="margin-top:0.5rem"><span class="badge badge-amber">TOO CLOSE</span> &nbsp;Score ${esc(r.score.toFixed(
            2
          ))} is at/above 0.90 — that's a <strong>MATCH</strong>, not a close match. Introduce a small typo and try again.</p>`;
        } else if (r.score != null) {
          html += `<p style="margin-top:0.5rem"><span class="badge badge-red">TOO FAR</span> &nbsp;Score ${esc(r.score.toFixed(
            2
          ))} is below 0.75 — that's a <strong>NO_MATCH</strong>. Pick a name closer to “John Smith” (e.g. a misspelling).</p>`;
        } else {
          html += `<p class="muted" style="margin-top:0.5rem">No score returned (${esc(r.outcome)}). Try a name against the known account.</p>`;
        }

        box.className = "lab-result show " + tone.tone;
        box.innerHTML = html;
      } catch (e) {
        box.className = "lab-result show lab-result-error";
        box.innerHTML = `<p class="muted">Error: ${esc(e.message)}</p>`;
      }
    });

    // ── Callout: privacy by design ──────────────────────────
    const callout = el("div", "callout");
    callout.innerHTML = `
      <div class="callout-title">Privacy by design</div>
      Notice what happens on a <strong>NO_MATCH</strong>: the bank returns <em>no name at all</em>. That's deliberate. If a mismatch leaked the real account holder's name, an attacker could type random IBANs and harvest people's names. By only revealing the name on a <strong>CLOSE_MATCH</strong> — where the payer already nearly guessed it — VoP protects account holders while still stopping fraud.`;
    main.appendChild(callout);

    // ── Lab nav ─────────────────────────────────────────────
    appendLabNav(main, "2", "4");
  };

  // =========================================================================
  // Shared prev/next nav helper
  // =========================================================================
  const TITLES = {
    "1": "Who's Who: BICs & IBANs",
    "2": "Is It Real? Checksums",
    "3": "Right Person? VoP",
    "4": "How Money Moves: Routing",
    "5": "Where to Send: SSI",
    "6": "Did It Arrive? Tracking",
  };

  function appendLabNav(main, prevId, nextId) {
    const nav = el("div", "lab-nav");
    nav.innerHTML =
      `<a href="#lab-${prevId}">← Lab ${prevId}: ${TITLES[prevId] || ""}</a>` +
      `<a href="#lab-${nextId}">Lab ${nextId}: ${TITLES[nextId] || ""} →</a>`;
    main.appendChild(nav);
  }
})();
