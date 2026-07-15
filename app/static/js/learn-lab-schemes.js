/*
 * Lab 7: "Which Rail? Payment Schemes"
 *
 * Teaches that each currency has multiple domestic payment rails with
 * different speed, cost, and limits. Learners explore GBP (FPS/CHAPS/Bacs),
 * CAD (Interac/EFT/Lynx), and more — then take a scenario quiz.
 */
window.LearnLabs = window.LearnLabs || {};

(function () {
  var esc = LearnUtils.esc;

  // Reusable quiz builder: creates clickable options with self-checking
  function buildQuiz(container, prefix, options, markComplete, labId) {
    var optContainer = container.querySelector("#" + prefix + "-options");
    var result = container.querySelector("#" + prefix + "-result");

    options.forEach(function (opt) {
      var btn = document.createElement("button");
      btn.className = "scheme-quiz-option";
      btn.textContent = opt.label;
      btn.onclick = function () {
        optContainer.querySelectorAll("button").forEach(function (b) { b.disabled = true; });
        if (opt.correct) {
          btn.classList.add("correct");
          result.className = "lab-result show lab-result-success";
          if (labId) markComplete(labId);
        } else {
          btn.classList.add("wrong");
          result.className = "lab-result show lab-result-error";
        }
        result.innerHTML = '<p>' + esc(opt.explain) + '</p>' +
          (opt.correct
            ? '<button class="lab-btn secondary" id="' + prefix + '-retry" style="margin-top:0.5rem">Reset</button>'
            : '<button class="lab-btn secondary" id="' + prefix + '-retry" style="margin-top:0.5rem">Try again</button>');
        var retry = document.getElementById(prefix + "-retry");
        if (retry) {
          retry.onclick = function () {
            optContainer.querySelectorAll("button").forEach(function (b) {
              b.disabled = false;
              b.classList.remove("correct", "wrong");
            });
            result.className = "lab-result";
          };
        }
      };
      optContainer.appendChild(btn);
    });
  }

  function speedClass(speed) {
    var s = (speed || "").toLowerCase();
    if (s.includes("instant") || s.includes("second")) return "scheme-speed-instant";
    if (s.includes("same-day") || s.includes("real-time")) return "scheme-speed-sameday";
    return "scheme-speed-batch";
  }

  function renderSchemeCards(schemes) {
    return schemes.map(function (sc) {
      return '<div class="scheme-card">' +
        '<h4>' + esc(sc.name) + '</h4>' +
        '<span class="scheme-speed ' + speedClass(sc.speed) + '">' + esc(sc.speed) + '</span>' +
        '<dl>' +
        '<dt>Limit</dt><dd>' + esc(sc.limit || "—") + '</dd>' +
        '<dt>Cost</dt><dd>' + esc(sc.cost || "—") + '</dd>' +
        '<dt>Use case</dt><dd>' + esc(sc.useCase || "—") + '</dd>' +
        '<dt>Operator</dt><dd>' + esc(sc.operator || "—") + '</dd>' +
        '</dl>' +
        '</div>';
    }).join("");
  }

  function fetchSchemes(currency) {
    return fetch("/api/schemes?currency=" + encodeURIComponent(currency)).then(function (r) {
      if (!r.ok) throw new Error("Not found");
      return r.json();
    });
  }

  LearnLabs["7"] = function (main, helpers) {
    var el = helpers.el;
    var glossify = helpers.glossify;
    var markComplete = helpers.markComplete;
    var currentCurrency = "GBP";

    // ── Header ──────────────────────────────────────
    var header = el("div", "lab-header");
    header.innerHTML =
      '<div class="lab-badge">Lab 7</div>' +
      '<h1>Which Rail? Payment Schemes</h1>' +
      '<p>Sending £100 isn\'t just one thing — it depends on the rail. Faster Payments, CHAPS, or Bacs? Each has different speed, cost, and limits.</p>';
    main.appendChild(header);

    // ── Concept 1: Why schemes matter ───────────────
    var c1 = el("div", "concept");
    c1.innerHTML =
      '<h2>One currency, many rails</h2>' +
      '<p>' + glossify('Every currency has its own domestic payment infrastructure. When you "send GBP," you\'re actually choosing a payment scheme — and the choice matters:') + '</p>' +
      '<ul style="font-size:0.9375rem;padding-left:1.5rem;margin-top:0.5rem">' +
      '<li><strong>Speed:</strong> Instant (Faster Payments) vs 3 days (Bacs)</li>' +
      '<li><strong>Cost:</strong> Free (FPS) vs £35 (CHAPS)</li>' +
      '<li><strong>Irrevocability:</strong> CHAPS can\'t be reversed; FPS sometimes can</li>' +
      '<li><strong>Availability:</strong> 24/7 (FPS) vs business hours only (CHAPS)</li>' +
      '</ul>';
    main.appendChild(c1);

    // ── Interactive: Currency picker + scheme cards ─
    var demo = el("div", "demo");
    demo.innerHTML =
      '<div class="demo-label">Explore payment schemes by currency</div>' +
      '<div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:1rem" id="s7-currency-pills"></div>' +
      '<div id="s7-scheme-info" style="margin-bottom:1rem"></div>' +
      '<div class="scheme-grid" id="s7-scheme-grid"></div>';
    main.appendChild(demo);

    // Currency pills
    var currencies = ["GBP", "CAD", "USD", "EUR", "NGN", "KES", "INR", "AUD", "JPY", "AED"];
    var pillContainer = demo.querySelector("#s7-currency-pills");
    currencies.forEach(function (ccy) {
      var pill = document.createElement("button");
      pill.className = "scheme-quiz-option";
      pill.style.cssText = "width:auto;margin:0;padding:4px 12px;font-size:0.8125rem";
      pill.textContent = ccy;
      pill.onclick = function () { loadSchemes(ccy); };
      pillContainer.appendChild(pill);
    });

    function loadSchemes(ccy) {
      currentCurrency = ccy;
      // Update pill active state
      pillContainer.querySelectorAll("button").forEach(function (b) {
        b.style.borderColor = b.textContent === ccy ? "var(--accent)" : "var(--border)";
        b.style.background = b.textContent === ccy ? "var(--accent-surface)" : "var(--surface)";
      });

      var grid = demo.querySelector("#s7-scheme-grid");
      var info = demo.querySelector("#s7-scheme-info");
      grid.innerHTML = '<span class="muted">Loading…</span>';
      info.innerHTML = "";

      fetchSchemes(ccy).then(function (data) {
        // Info bar
        var ibanBadge = data.iban
          ? '<span class="scheme-pill">Uses IBAN</span>'
          : '<span class="scheme-pill">No IBAN — uses ' + esc(data.localIdentifier || "local format") + '</span>';
        info.innerHTML =
          '<h3 style="font-size:1rem;margin-bottom:0.25rem">' + esc(data.country) + ' (' + ccy + ')</h3>' +
          '<p class="muted" style="font-size:0.8125rem">' + ibanBadge + '</p>';

        // Scheme cards
        grid.innerHTML = renderSchemeCards(data.schemes);
      }).catch(function () {
        grid.innerHTML = '<span class="muted">Could not load schemes for ' + ccy + '</span>';
      });
    }

    // Load default
    loadSchemes("GBP");

    // ── Concept 2: The speed-cost tradeoff ──────────
    var c2 = el("div", "concept");
    c2.innerHTML =
      '<h2>The golden rule: speed costs money</h2>' +
      '<p>' + glossify('Across all currencies, the same pattern holds: instant payments are free for consumers but limited in amount. RTGS systems (CHAPS, Fedwire, TARGET2, Lynx) settle immediately and irrevocably but charge per transaction. Batch systems (Bacs, FedACH, EFT) are cheapest but take days.') + '</p>';
    main.appendChild(c2);

    // ── Callout: real-world example ─────────────────
    var callout = el("div", "callout");
    callout.innerHTML =
      '<div class="callout-title">💡 Real-world example</div>' +
      'You\'re buying a house for £500,000. You need to send the deposit by 3pm today.<br>' +
      '<strong>Faster Payments</strong> can\'t handle £500K (most banks cap at £25K–£1M).<br>' +
      '<strong>Bacs</strong> takes 3 days — too slow.<br>' +
      '<strong>CHAPS</strong> is the answer: same-day, no limit, £25 fee. That\'s why conveyancers always say "CHAPS transfer."';
    main.appendChild(callout);

    // ── Exercise: Scenario quiz ─────────────────────
    var exercise = el("div", "exercise");
    exercise.innerHTML =
      '<div class="exercise-header">' +
        '<span class="exercise-badge">?</span>' +
        '<span class="exercise-title">Pick the right rail</span>' +
      '</div>' +
      '<p class="exercise-prompt">A company needs to pay 500 employees their monthly salary in GBP. Cost matters more than speed. Which rail should they use?</p>' +
      '<div id="s7-quiz-options"></div>' +
      '<div class="lab-result" id="s7-quiz-result"></div>';
    main.appendChild(exercise);

    var quizOptions = [
      { label: "Faster Payments (FPS)", correct: false, explain: "FPS is instant and free, but it's designed for individual transfers — sending 500 payments one by one is inefficient. It also has per-transaction limits." },
      { label: "CHAPS", correct: false, explain: "CHAPS is for high-value single payments (£25+ fee each). Using it for 500 salary payments would cost £12,500+ in fees!" },
      { label: "Bacs Direct Credit", correct: true, explain: "✓ Correct! Bacs is designed for exactly this: batch payments like payroll. It takes 3 days but costs ~£0.50 per file (not per payment). ~80% of UK payroll runs on Bacs." },
      { label: "SWIFT", correct: false, explain: "SWIFT is for cross-border payments, not domestic GBP payroll. It would be far slower and more expensive." },
    ];

    var optContainer = exercise.querySelector("#s7-quiz-options");
    var quizResult = exercise.querySelector("#s7-quiz-result");
    quizOptions.forEach(function (opt) {
      var btn = document.createElement("button");
      btn.className = "scheme-quiz-option";
      btn.textContent = opt.label;
      btn.onclick = function () {
        // Disable all buttons
        optContainer.querySelectorAll("button").forEach(function (b) { b.disabled = true; });
        if (opt.correct) {
          btn.classList.add("correct");
          quizResult.className = "lab-result show lab-result-success";
          markComplete("7");
        } else {
          btn.classList.add("wrong");
          quizResult.className = "lab-result show lab-result-error";
        }
        quizResult.innerHTML = '<p>' + esc(opt.explain) + '</p>' +
          (opt.correct ? '<button class="lab-btn" onclick="location.hash=\'#capstone\'">On to the capstone ★ →</button>' : '<button class="lab-btn secondary" id="s7-retry">Try again</button>');
        if (!opt.correct) {
          document.getElementById("s7-retry").onclick = function () {
            optContainer.querySelectorAll("button").forEach(function (b) { b.disabled = false; b.classList.remove("correct", "wrong"); });
            quizResult.className = "lab-result";
          };
        }
      };
      optContainer.appendChild(btn);
    });

    // ── Exercise 2: CAD scenario ────────────────────
    var exercise2 = el("div", "exercise");
    exercise2.innerHTML =
      '<div class="exercise-header">' +
        '<span class="exercise-badge">?</span>' +
        '<span class="exercise-title">Canadian scenario</span>' +
      '</div>' +
      '<p class="exercise-prompt">You\'re in Toronto and need to send $50 to a friend for dinner — instantly. Which Canadian rail do you use?</p>' +
      '<div id="s7-quiz2-options"></div>' +
      '<div class="lab-result" id="s7-quiz2-result"></div>';
    main.appendChild(exercise2);

    var quiz2Options = [
      { label: "Interac e-Transfer", correct: true, explain: "✓ Correct! Interac e-Transfer is instant, free, and designed for exactly this. You just need their email or phone number — no account number needed." },
      { label: "EFT", correct: false, explain: "EFT takes 1-2 business days. Your friend would be waiting until next week for dinner money!" },
      { label: "Lynx", correct: false, explain: "Lynx is the RTGS for high-value wholesale payments ($5-25 fee). Overkill for $50 — and most retail banks don't offer it to consumers." },
    ];

    var opt2Container = exercise2.querySelector("#s7-quiz2-options");
    var quiz2Result = exercise2.querySelector("#s7-quiz2-result");
    quiz2Options.forEach(function (opt) {
      var btn = document.createElement("button");
      btn.className = "scheme-quiz-option";
      btn.textContent = opt.label;
      btn.onclick = function () {
        opt2Container.querySelectorAll("button").forEach(function (b) { b.disabled = true; });
        if (opt.correct) {
          btn.classList.add("correct");
          quiz2Result.className = "lab-result show lab-result-success";
        } else {
          btn.classList.add("wrong");
          quiz2Result.className = "lab-result show lab-result-error";
        }
        quiz2Result.innerHTML = '<p>' + esc(opt.explain) + '</p>';
      };
      opt2Container.appendChild(btn);
    });

    // ── Exercise 3: USD high-value ──────────────────
    var exercise3 = el("div", "exercise");
    exercise3.innerHTML =
      '<div class="exercise-header">' +
        '<span class="exercise-badge">?</span>' +
        '<span class="exercise-title">Corporate treasury — USD</span>' +
      '</div>' +
      '<p class="exercise-prompt">A multinational needs to settle a $50 million interbank transfer in USD, right now. Which US rail?</p>' +
      '<div id="s7-quiz3-options"></div>' +
      '<div class="lab-result" id="s7-quiz3-result"></div>';
    main.appendChild(exercise3);

    var quiz3Options = [
      { label: "FedACH", correct: false, explain: "FedACH is for batch retail payments with ~$25K-1M limits. $50M would exceed per-item caps and take 1-2 days." },
      { label: "RTP (Real-Time Payments)", correct: false, explain: "RTP caps at $1,000,000 per payment. It's designed for instant retail, not $50M wholesale." },
      { label: "Fedwire", correct: true, explain: "✓ Correct! Fedwire is the US RTGS — real-time, no limit, final and irrevocable. This is exactly what it's built for: high-value irrevocable settlement." },
      { label: "FedNow", correct: false, explain: "FedNow caps at $500,000 and targets instant retail. Not designed for $50M wholesale." },
    ];
    buildQuiz(exercise3, "s7-quiz3", quiz3Options, markComplete, "7");

    // ── Exercise 4: India UPI ───────────────────────
    var exercise4 = el("div", "exercise");
    exercise4.innerHTML =
      '<div class="exercise-header">' +
        '<span class="exercise-badge">?</span>' +
        '<span class="exercise-title">Street vendor — India</span>' +
      '</div>' +
      '<p class="exercise-prompt">You\'re buying vegetables from a street vendor in Mumbai. They have a QR code. Which Indian payment system processes this?</p>' +
      '<div id="s7-quiz4-options"></div>' +
      '<div class="lab-result" id="s7-quiz4-result"></div>';
    main.appendChild(exercise4);

    var quiz4Options = [
      { label: "RTGS", correct: false, explain: "RTGS has a ₹2,00,000 minimum and is designed for high-value corporate transfers. Not for vegetable shopping!" },
      { label: "NEFT", correct: false, explain: "NEFT processes in half-hourly batches. Too slow for a point-of-sale transaction — you'd be waiting 30 minutes for your change." },
      { label: "UPI", correct: true, explain: "✓ Correct! UPI is India's instant payment system — 10B+ transactions/month. The vendor's QR code is a UPI QR. You scan, enter your PIN, and the money arrives in seconds. Free." },
      { label: "IMPS", correct: false, explain: "IMPS is instant but requires the recipient's MMID and account number. UPI replaced this friction with QR codes and VPA (name@bank)." },
    ];
    buildQuiz(exercise4, "s7-quiz4", quiz4Options, markComplete, "7");

    // ── Exercise 5: Kenya M-Pesa ────────────────────
    var exercise5 = el("div", "exercise");
    exercise5.innerHTML =
      '<div class="exercise-header">' +
        '<span class="exercise-badge">?</span>' +
        '<span class="exercise-title">Unbanked remittance — Kenya</span>' +
      '</div>' +
      '<p class="exercise-prompt">A rural farmer in Kenya has no bank account but needs to receive 5,000 KES from a relative in Nairobi. Which rail works?</p>' +
      '<div id="s7-quiz5-options"></div>' +
      '<div class="lab-result" id="s7-quiz5-result"></div>';
    main.appendChild(exercise5);

    var quiz5Options = [
      { label: "EFT", correct: false, explain: "EFT requires a bank account at both ends. The farmer doesn't have one." },
      { label: "PesaLink", correct: false, explain: "PesaLink is bank-to-bank instant transfer. Again, requires a bank account." },
      { label: "M-Pesa", correct: true, explain: "✓ Correct! M-Pesa is mobile money — no bank account needed, just a SIM card and phone. The relative sends from their M-Pesa wallet, the farmer receives on their feature phone. 30M+ Kenyans use this daily." },
      { label: "SWIFT", correct: false, explain: "SWIFT is for cross-border bank-to-bank transfers. It doesn't reach individuals without bank accounts." },
    ];
    buildQuiz(exercise5, "s7-quiz5", quiz5Options, markComplete, "7");

    // ── Exercise 6: EUR cross-border ────────────────
    var exercise6 = el("div", "exercise");
    exercise6.innerHTML =
      '<div class="exercise-header">' +
        '<span class="exercise-badge">?</span>' +
        '<span class="exercise-title">German to French — EUR</span>' +
      '</div>' +
      '<p class="exercise-prompt">A German company sends €10,000 to a French supplier. It needs to arrive the next business day. Which EUR rail?</p>' +
      '<div id="s7-quiz6-options"></div>' +
      '<div class="lab-result" id="s7-quiz6-result"></div>';
    main.appendChild(exercise6);

    var quiz6Options = [
      { label: "TARGET2", correct: false, explain: "TARGET2 (the Eurozone RTGS) would work and is same-day, but it costs €0.80-2.50 and is designed for high-value interbank. Overkill for €10K." },
      { label: "SEPA Credit Transfer (SCT)", correct: true, explain: "✓ Correct! SCT settles in 1 business day (T+1) and is free within SEPA. This is the standard rail for cross-border euro payments — exactly what SEPA was designed for." },
      { label: "SEPA Instant (SCT Inst)", correct: false, explain: "SCT Inst would work (it's instant), but it's overkill if next-day is fast enough. Not all banks support it yet, and the supplier may not have it enabled." },
      { label: "SWIFT MT103", correct: false, explain: "SWIFT is for non-eurozone or non-SEPA payments. For a German-to-French transfer, SEPA is cheaper and faster than routing through SWIFT correspondents." },
    ];
    buildQuiz(exercise6, "s7-quiz6", quiz6Options, markComplete, "7");

    // ── Exercise 7: UAE IBAN ─────────────────────────
    var exercise7 = el("div", "exercise");
    exercise7.innerHTML =
      '<div class="exercise-header">' +
        '<span class="exercise-badge">?</span>' +
        '<span class="exercise-title">UAE salary payment — AED</span>' +
      '</div>' +
      '<p class="exercise-prompt">A Dubai company pays 200 employees their monthly salary in AED. The Central Bank processes three batch cut-offs per day. Which rail handles this?</p>' +
      '<div id="s7-quiz7-options"></div>' +
      '<div class="lab-result" id="s7-quiz7-result"></div>';
    main.appendChild(exercise7);

    var quiz7Options = [
      { label: "Aani (Instant)", correct: false, explain: "Aani is instant but designed for individual P2P payments (AED 100K limit). Sending 200 salary payments one by one defeats the purpose." },
      { label: "UAEFTS", correct: true, explain: "✓ Correct! UAEFTS (UAE Funds Transfer System) processes in three daily batches — perfect for bulk salary payments. All UAE salary payments require an IBAN, and UAEFTS handles them in near-real-time during business hours." },
      { label: "SWIFT", correct: false, explain: "SWIFT is for cross-border. These are domestic AED payments within the UAE." },
      { label: "CHAPS", correct: false, explain: "CHAPS is the UK's RTGS — not available in the UAE." },
    ];
    buildQuiz(exercise7, "s7-quiz7", quiz7Options, markComplete, "7");

    // ── Nav ─────────────────────────────────────────
    var nav = el("div", "lab-nav");
    nav.innerHTML =
      '<a href="#lab-6">← Lab 6: Tracking</a>' +
      '<a href="#capstone">Capstone: Full Payment ★ →</a>';
    main.appendChild(nav);
  };
})();
