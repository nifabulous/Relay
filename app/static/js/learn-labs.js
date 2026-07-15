/*
 * Learn Labs — interactive lab modules.
 *
 * This file is concatenated with lab modules written by other agents.
 * Each module assigns its own key on the shared `window.LearnLabs` object.
 * The learn.js router calls `LearnLabs[labId](main, helpers)` on navigation.
 *
 * DO NOT overwrite window.LearnLabs — merge with `||`.
 */
window.LearnLabs = window.LearnLabs || {};

/* =========================================================================
 * Lab 1 — "Who's Who: BICs & IBANs"
 *
 * Learn the two codes that identify banks (BIC) and accounts (IBAN) worldwide,
 * see real banks in the directory, and practice finding banks by code.
 * ======================================================================= */
window.LearnLabs["1"] = function (main, helpers) {
  var esc = LearnUtils.esc;

  const { el, glossify, markComplete, getProgress } = helpers;

  // ── small DOM helpers scoped to this render ────────────────────────────

  // One colored, labeled segment of a BIC/IBAN decomposition.
  function segment(value, colorClass, label) {
    const col = el("div", "decompose-col");
    col.appendChild(el("div", "decompose-segment " + colorClass, value));
    col.appendChild(el("div", "decompose-label", label));
    return col;
  }

  // Render a decomposition row into `container` from an array of
  // {value, color, label} descriptors.
  function renderDecomp(container, parts) {
    container.innerHTML = "";
    container.classList.add("decompose");
    for (const p of parts) container.appendChild(segment(p.value, p.color, p.label));
  }

  // A glossified paragraph — auto-links glossary terms and picks up `.concept p`
  // styling instead of being appended as bare HTML.
  function glossP(text) {
    return el("p", "", glossify(text));
  }

  // Normalize free-text answers: lowercase, strip everything but alphanumerics.
  function norm(s) {
    return (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  // ======================================================================
  // HEADER
  // ======================================================================
  const header = el("div", "lab-header");
  header.appendChild(el("div", "lab-badge", "Lab 1"));
  header.appendChild(el("h1", "", "Who's Who: BICs &amp; IBANs"));
  header.appendChild(
    el("p", "", "Every international payment starts with two codes: one for the " +
      "bank, one for the account. Learn to read them and you can tell, at a glance, " +
      "where any payment is going.")
  );
  main.appendChild(header);

  // ======================================================================
  // CONCEPT — What is a BIC?
  // ======================================================================
  const bicConcept = el("div", "concept");
  bicConcept.appendChild(el("h2", "", "What is a BIC?"));
  bicConcept.appendChild(glossP(
    "A BIC (Bank Identifier Code) — also called a SWIFT code — is a short, " +
    "standardized label that uniquely identifies a bank anywhere in the world. " +
    "It's how the SWIFT network knows exactly which bank should receive a payment."
  ));
  bicConcept.appendChild(glossP(
    "A BIC is 8 or 11 characters long. The 8-character form identifies the bank " +
    "and its main office; the 11-character form adds a specific branch. When a " +
    "branch code isn't needed, the code is padded with XXX to mean " +
    '"primary office."'
  ));
  bicConcept.appendChild(
    el("p", "", "Here's the structure, broken into four parts:")
  );

  // CITIUS33XXX decomposed: CITI (bank) | US (country) | 33 (location) | XXX (branch)
  const bicDecomp = el("div", "decompose");
  bicDecomp.appendChild(segment("CITI", "seg-bank", "Bank code"));
  bicDecomp.appendChild(segment("US", "seg-country", "Country"));
  bicDecomp.appendChild(segment("33", "seg-check", "Location"));
  bicDecomp.appendChild(segment("XXX", "seg-branch", "Branch"));
  bicConcept.appendChild(bicDecomp);

  bicConcept.appendChild(
    el("p", "", "So <strong>CITIUS33XXX</strong> reads as: Citibank, in the United States, " +
      "office 33 (New York), primary branch. You'll meet this exact bank again in " +
      "later labs — it's one of the busiest USD correspondents in the world.")
  );
  main.appendChild(bicConcept);

  // ======================================================================
  // CONCEPT — What is an IBAN?
  // ======================================================================
  const ibanConcept = el("div", "concept");
  ibanConcept.appendChild(el("h2", "", "What is an IBAN?"));
  ibanConcept.appendChild(glossP(
    "An IBAN (International Bank Account Number) identifies a specific bank " +
    "account in a standardized format. No matter the country, every IBAN begins " +
    "the same way: a 2-letter country code, then a 2-digit checksum, then the " +
    "country-specific part (called the BBAN)."
  ));
  ibanConcept.appendChild(
    el("p", "", "Here's a real-format UK IBAN, split into its parts:")
  );

  // GB29NWBK60161331926819 → GB | 29 | NWBK (bank code) | 60161331926819 (sort + account)
  const ibanDecomp = el("div", "decompose");
  ibanDecomp.appendChild(segment("GB", "seg-country", "Country"));
  ibanDecomp.appendChild(segment("29", "seg-check", "Checksum"));
  ibanDecomp.appendChild(segment("NWBK", "seg-bank", "Bank code"));
  ibanDecomp.appendChild(segment("60161331926819", "seg-account", "Sort code + account"));
  ibanConcept.appendChild(ibanDecomp);

  ibanConcept.appendChild(
    el("p", "", "The checksum (29) is a quick math check that catches typos before a " +
      "payment ever leaves your bank — we'll break one on purpose in Lab 2. The bank " +
      "code <strong>NWBK</strong> maps to NatWest, a major UK bank.")
  );

  const ibanCallout = el("div", "callout");
  ibanCallout.appendChild(el("div", "callout-title", "Not every country uses IBANs"));
  ibanCallout.appendChild(
    el("p", "", "The US, Canada, and Australia don't use IBANs — they route domestic " +
      "payments with their own codes (ABA routing numbers, BSB, and so on). IBANs are " +
      "most common across Europe, the Middle East, and parts of Africa and Asia.")
  );
  ibanConcept.appendChild(ibanCallout);
  main.appendChild(ibanConcept);

  // ======================================================================
  // INTERACTIVE DEMO — Explore a BIC or IBAN
  // ======================================================================
  const demo = el("div", "demo");
  demo.appendChild(el("div", "demo-label", "Try it yourself"));
  demo.appendChild(
    el("p", "muted", "Type any BIC or IBAN below and hit Analyze. We'll split it into " +
      "its parts, check whether it's valid, and look the bank up in our directory.")
  );

  const demoInput = el("input", "lab-input mono");
  demoInput.placeholder = "e.g. CITIUS33XXX or GB29NWBK60161331926819";
  demoInput.spellcheck = false;
  demoInput.setAttribute("autocomplete", "off");
  demo.appendChild(demoInput);

  const analyzeBtn = el("button", "lab-btn", "Analyze");
  demo.appendChild(analyzeBtn);

  const demoDecomp = el("div", "decompose");
  demoDecomp.style.display = "none";
  demo.appendChild(demoDecomp);

  const demoResult = el("div", "lab-result");
  demo.appendChild(demoResult);
  main.appendChild(demo);

  // Client-side decomposition based on detected type + validity.
  function drawDemoDecomp(value, type, valid) {
    const v = value.toUpperCase().replace(/\s+/g, "");
    demoDecomp.style.display = "flex";

    if (type === "iban") {
      if (v.length < 4) {
        renderDecomp(demoDecomp, [{ value: v || "—", color: "seg-invalid", label: "Too short" }]);
        return;
      }
      renderDecomp(demoDecomp, [
        { value: v.slice(0, 2), color: "seg-country", label: "Country" },
        { value: v.slice(2, 4), color: valid ? "seg-check" : "seg-invalid", label: "Checksum" },
        { value: v.slice(4) || "—", color: "seg-account", label: "BBAN (bank + account)" },
      ]);
    } else {
      // BIC: pad 8-char forms so the branch slot is visible.
      const padded = v.length === 8 ? v + "XXX" : v;
      const wellFormed = /^[A-Z]{4}[A-Z0-9]{2}[A-Z0-9]{2}[A-Z0-9]{3}$/.test(padded);
      if (wellFormed) {
        renderDecomp(demoDecomp, [
          { value: padded.slice(0, 4), color: "seg-bank", label: "Bank code" },
          { value: padded.slice(4, 6), color: "seg-country", label: "Country" },
          { value: padded.slice(6, 8), color: "seg-check", label: "Location" },
          { value: padded.slice(8, 11), color: "seg-branch", label: "Branch" },
        ]);
      } else {
        renderDecomp(demoDecomp, [{ value: v || "—", color: "seg-invalid", label: "Not a valid BIC shape" }]);
      }
    }
  }

  // Show the demo result panel (success or error variant).
  function showDemoResult(ok, html) {
    demoResult.className = "lab-result show " + (ok ? "lab-result-success" : "lab-result-error");
    demoResult.innerHTML = html;
  }

  async function analyze() {
    const value = demoInput.value.trim();
    if (!value) {
      showDemoResult(false, "Type a BIC or IBAN to analyze.");
      return;
    }

    analyzeBtn.textContent = "Analyzing…";
    analyzeBtn.disabled = true;

    let validateData;
    try {
      const res = await fetch("/api/validate?value=" + encodeURIComponent(value));
      validateData = await res.json();
    } catch (err) {
      analyzeBtn.textContent = "Analyze";
      analyzeBtn.disabled = false;
      showDemoResult(false, "Couldn't reach the validation service. Is the server running?");
      return;
    }

    const type = validateData.input_type || "bic";
    const valid = !!validateData.valid;

    // Always draw the decomposition so the learner sees the structure.
    drawDemoDecomp(value, type, valid);

    let bank = null;
    // Only look up if we have a usable BIC (valid input, BIC derived/provided).
    if (valid && validateData.bic) {
      try {
        const lres = await fetch("/api/lookup?bic=" + encodeURIComponent(validateData.bic));
        if (lres.ok) {
          const ldata = await lres.json();
          bank = ldata.found ? ldata.bank : null;
        }
      } catch (err) {
        // Lookup is best-effort; ignore network failures here.
      }
    }

    analyzeBtn.textContent = "Analyze";
    analyzeBtn.disabled = false;

    // ── Build the result message ──────────────────────────────────────
    const typeLabel = type === "iban" ? "IBAN" : "BIC";
    let html = "";

    if (!valid) {
      html +=
        '<div class="badge badge-red">Invalid ' + typeLabel + "</div> " +
        "This didn't pass the format check.";
      if (validateData.errors && validateData.errors.length) {
        html += '<div class="muted" style="margin-top:6px">' +
          validateData.errors.map(esc).join("; ") + "</div>";
      }
      showDemoResult(false, html);
      return;
    }

    // Valid.
    html += '<div class="badge badge-green">Valid ' + typeLabel + "</div> ";
    if (validateData.bic) {
      html += 'Bank BIC: <span class="mono">' + esc(validateData.bic) + "</span>";
      if (type === "iban") html += " (derived from the IBAN)";
      html += ".";
    } else {
      html += "The structure is correct.";
    }

    if (bank) {
      html +=
        '<div style="margin-top:8px"><strong>' + esc(bank.bank_name) + "</strong>";
      const bits = [];
      if (bank.country_code) bits.push(esc(bank.country_code));
      if (bank.city) bits.push(esc(bank.city));
      if (bank.country_currency) bits.push(esc(bank.country_currency));
      if (bits.length) html += ' &middot; <span class="muted">' + bits.join(" · ") + "</span>";
      html +=
        '<div class="muted" style="margin-top:2px">Found in our bank directory.</div></div>';
    } else if (validateData.bic) {
      html +=
        '<div class="muted" style="margin-top:6px">Not in our starter directory ' +
        "(we don't carry every bank — real systems use SWIFTRef or Accuity).</div>";
    }

    showDemoResult(true, html);
  }

  analyzeBtn.addEventListener("click", analyze);
  demoInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") analyze();
  });

  // ======================================================================
  // EXERCISE 1 — Find a bank by BIC (what country?)
  // ======================================================================
  function buildExercise(opts) {
    // opts: { badge, title, promptHTML, placeholder, hintHTML, isCorrect(n) }
    const box = el("div", "exercise");
    const head = el("div", "exercise-header");
    head.appendChild(el("span", "exercise-badge", String(opts.badge)));
    head.appendChild(el("span", "exercise-title", opts.title));
    box.appendChild(head);

    const prompt = el("div", "exercise-prompt");
    prompt.innerHTML = opts.promptHTML;
    box.appendChild(prompt);

    const input = el("input", "lab-input");
    input.placeholder = opts.placeholder;
    input.spellcheck = false;
    input.setAttribute("autocomplete", "off");
    box.appendChild(input);

    const btnRow = el("div");
    btnRow.style.marginTop = "0.75rem";
    const checkBtn = el("button", "lab-btn", "Check answer");
    const hintBtn = el("button", "lab-btn secondary", "Show hint");
    hintBtn.style.marginLeft = "0.5rem";
    btnRow.appendChild(checkBtn);
    btnRow.appendChild(hintBtn);
    box.appendChild(btnRow);

    const hint = el("div", "exercise-hint");
    hint.innerHTML = opts.hintHTML;
    box.appendChild(hint);

    const result = el("div", "lab-result");
    box.appendChild(result);

    hintBtn.addEventListener("click", function () {
      hint.classList.add("show");
      hintBtn.textContent = "Hint shown";
      hintBtn.disabled = true;
    });

    function check() {
      const n = norm(input.value);
      if (!n) {
        result.className = "lab-result show lab-result-error";
        result.innerHTML = "Type an answer first.";
        return;
      }
      if (opts.isCorrect(n)) {
        result.className = "lab-result show lab-result-success";
        result.innerHTML =
          '<div class="badge badge-green">Correct!</div> ' + opts.successHTML;
        input.disabled = true;
        checkBtn.disabled = true;
        opts.onSolved && opts.onSolved();
      } else {
        result.className = "lab-result show lab-result-error";
        result.innerHTML =
          '<div class="badge badge-red">Not quite.</div> ' + (opts.retryHint || "Try again, or peek at the hint.");
      }
    }

    checkBtn.addEventListener("click", check);
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") check();
    });

    return {
      box: box,
      markSolved: function () {
        result.className = "lab-result show lab-result-success";
        result.innerHTML =
          '<div class="badge badge-green">Solved</div> ' + opts.successHTML;
        input.disabled = true;
        checkBtn.disabled = true;
      },
    };
  }

  // Track exercise completion to congratulate the learner.
  const solved = { ex1: false, ex2: false };

  function exercisesCompleteMessage() {
    // Intentionally a no-op placeholder; completion is reflected via the
    // Complete button state. Kept for future extension.
  }

  const ex1 = buildExercise({
    badge: 1,
    title: "Find a bank",
    promptHTML:
      "Look up the BIC <span class=\"mono\">GTBINGLAXXX</span>. " +
      "<strong>What country is this bank in?</strong> " +
      "<span class=\"muted\">(Type the country name or its 2-letter code.)</span>",
    placeholder: "Country name or code…",
    hintHTML:
      "In a BIC, the two letters right after the 4-letter bank code are the ISO " +
      'country code. For <span class="mono">GTBI<span style="text-decoration:underline">NG</span>LAXXX</span> ' +
      'those letters are <strong>NG</strong>. You can also paste GTBINGLAXXX into ' +
      "the analyzer above to see the bank.",
    isCorrect: function (n) {
      return n === "nigeria" || n === "ng";
    },
    successHTML:
      '<span class="mono">GTBINGLAXXX</span> is Guaranty Trust Bank, in ' +
      '<strong>Nigeria (NG)</strong>, based in Lagos.',
    onSolved: function () {
      solved.ex1 = true;
      exercisesCompleteMessage();
    },
  });
  main.appendChild(ex1.box);

  // ======================================================================
  // EXERCISE 2 — Read a bank out of an IBAN
  // ======================================================================
  const ex2 = buildExercise({
    badge: 2,
    title: "Try an IBAN",
    promptHTML:
      "Enter the IBAN <span class=\"mono\">GB29NWBK60161331926819</span> " +
      "(or any UK IBAN you know). <strong>What bank does it belong to?</strong>",
    placeholder: "Bank name…",
    hintHTML:
      "Characters 5–8 of a UK IBAN are the 4-letter bank code. In " +
      '<span class="mono">GB29<span style="text-decoration:underline">NWBK</span>60161331926819</span> ' +
      'that code is <strong>NWBK</strong>. Paste the full IBAN into the analyzer ' +
      "above to confirm the bank's name.",
    isCorrect: function (n) {
      return (
        n.indexOf("natwest") !== -1 ||
        n.indexOf("nationalwestminster") !== -1 ||
        n === "nwbk"
      );
    },
    successHTML:
      "That's <strong>NatWest</strong> (National Westminster Bank) in the UK — " +
      'BIC <span class="mono">NWBKGB2LXXX</span>.',
    onSolved: function () {
      solved.ex2 = true;
      exercisesCompleteMessage();
    },
  });
  main.appendChild(ex2.box);

  // ======================================================================
  // COMPLETE BUTTON
  // ======================================================================
  const alreadyDone = getProgress().includes("1");

  const completeWrap = el("div");
  completeWrap.style.marginTop = "2rem";

  const completeBtn = el("button", "lab-btn", alreadyDone ? "Mark as complete ✓" : "Mark lab complete");
  if (alreadyDone) completeBtn.disabled = true;
  completeWrap.appendChild(completeBtn);

  const completeMsg = el("div", "lab-result");
  completeWrap.appendChild(completeMsg);
  main.appendChild(completeWrap);

  if (alreadyDone) {
    completeMsg.className = "lab-result show lab-result-success";
    completeMsg.innerHTML =
      '<div class="badge badge-green">Completed</div> You\'ve finished this lab. ' +
      'Nice work — head to Lab 2 to learn how IBAN checksums catch typos.';
  }

  completeBtn.addEventListener("click", function () {
    markComplete("1");
    completeBtn.disabled = true;
    completeBtn.textContent = "Mark as complete ✓";
    completeMsg.className = "lab-result show lab-result-success";
    completeMsg.innerHTML =
      '<div class="badge badge-green">Lab 1 complete!</div> You can now read a BIC and ' +
      'an IBAN. Continue to <strong>Lab 2: Is It Real?</strong> to see the math that ' +
      "makes the two-digit checksum work — and break one on purpose.";
  });

  // ======================================================================
  // LAB NAVIGATION
  // ======================================================================
  const nav = el("div", "lab-nav");
  const back = el("a", "", "← Back to labs");
  back.href = "#";
  const next = el("a", "", "Lab 2: Is It Real? Checksums →");
  next.href = "#lab-2";
  nav.appendChild(back);
  nav.appendChild(next);
  main.appendChild(nav);
};
