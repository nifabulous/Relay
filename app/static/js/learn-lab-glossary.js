/*
 * Glossary — the standalone reference lab.
 *
 * A searchable, browsable index of every payment term in window.GLOSSARY.
 * Features: live search with match-highlighting, category chips, an A-Z
 * browse index, expandable term cards with derived cross-references, a
 * "Start Here: Top 9" featured strip, and a closing exercise that marks
 * the lab complete.
 *
 * Loaded after glossary.js + visualizers.js, before learn.js.
 * Registers LearnLabs["glossary"].
 */
window.LearnLabs = window.LearnLabs || {};

(function () {
  "use strict";

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  // Highlight every case-insensitive occurrence of `q` in `text` with <mark>.
  function highlight(text, q) {
    var safe = esc(text);
    if (!q) return safe;
    var escQ = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    try {
      return safe.replace(new RegExp(escQ, "gi"), function (m) {
        return "<mark>" + esc(m) + "</mark>";
      });
    } catch (e) {
      return safe;
    }
  }

  // ── Category mapping ─────────────────────────────────────────────────
  // Explicit buckets keyed by exact term name; anything unmatched falls
  // back to a keyword scan, and ultimately to "Reference".
  var CATEGORY = {
    "BIC": "Identifiers",
    "SWIFT code": "Identifiers",
    "IBAN": "Identifiers",
    "MOD-97": "Identifiers",
    "ABA": "Identifiers",
    "Routing number": "Identifiers",
    "SORT code": "Identifiers",
    "BSB": "Identifiers",
    "IFSC": "Identifiers",
    "IBAN registry": "Identifiers",

    "Nostro": "Correspondent",
    "Vostro": "Correspondent",
    "Loro": "Correspondent",
    "Correspondent bank": "Correspondent",
    "Intermediary bank": "Correspondent",
    "SSI": "Correspondent",
    "Nostro reconciliation": "Correspondent",

    "UETR": "Messages",
    "gpi": "Messages",
    "MT103": "Messages",
    "pacs.008": "Messages",

    "Fedwire": "Schemes",
    "FedACH": "Schemes",
    "CHIPS": "Schemes",
    "RTGS": "Schemes",
    "CHAPS": "Schemes",
    "TARGET2": "Schemes",
    "SEPA": "Schemes",

    "VoP": "Compliance",
    "CoP": "Compliance",
    "Sanctions screening": "Compliance",
    "AML": "Compliance",
    "KYC": "Compliance",

    "Lift fee": "Fees",
    "OUR": "Fees",
    "SHA": "Fees",
    "BEN": "Fees",
    "Value date": "Fees",
    "Spot date": "Fees",

    "SWIFTRef": "Reference",
    "Accuity": "Reference",
    "STP": "Reference",
    "Repair": "Reference"
  };

  function classifyTerm(term) {
    if (CATEGORY[term]) return CATEGORY[term];
    var t = term.toLowerCase();
    if (/bic|iban|sort|bsb|ifsc|routing|aba|mod|checksum|identifier/.test(t)) return "Identifiers";
    if (/nostro|vostro|loro|correspondent|intermedi|ssi|settl/.test(t)) return "Correspondent";
    if (/uetr|gpi|mt\d|pacs|message|iso/.test(t)) return "Messages";
    if (/fedwire|fedach|chips|rtgs|chaps|target|sepa|scheme|rail/.test(t)) return "Schemes";
    if (/vop|cop|sanction|aml|kyc|compliance|screen/.test(t)) return "Compliance";
    if (/fee|our|sha|ben|value|spot|charge/.test(t)) return "Fees";
    return "Reference";
  }

  var CATEGORY_ORDER = [
    "Identifiers", "Correspondent", "Messages", "Schemes",
    "Compliance", "Fees", "Reference"
  ];

  // "See in Lab" derivation — first match wins.
  var SEE_RULES = [
    { re: /\bbic\b|iban|swift code|sort code|bsb|ifsc|aba|routing/i, lab: "1", title: "Lab 1: BICs & IBANs" },
    { re: /mod-?97|checksum|validate/i, lab: "2", title: "Lab 2: Checksums" },
    { re: /\bvop\b|\bcop\b|verification of payee|confirmation of payee|payee/i, lab: "3", title: "Lab 3: Verification of Payee" },
    { re: /nostro|vostro|loro|correspondent|intermediar|routing|chain/i, lab: "4", title: "Lab 4: Routing" },
    { re: /\bssi\b|settlement instruction|standard settlement/i, lab: "5", title: "Lab 5: Settlement Instructions" },
    { re: /\buetr\b|\bgpi\b|track|mt103|pacs\.008/i, lab: "6", title: "Lab 6: Tracking" },
    { re: /fedwire|fedach|chips|rtgs|chaps|target|sepa|scheme|rail/i, lab: "7", title: "Lab 7: Payment Schemes" },
    { re: /lift fee|\bour\b|\bsha\b|\bben\b|charge code/i, lab: "fees", title: "Fee Calculator" },
    { re: /mid-market|spread|fx margin|corridor|base currency|quote currency|spot rate/i, lab: "fx", title: "FX Calculator" },
    { re: /sanction|ofac|screening|watchlist|aml|kyc|stp|repair/i, lab: "sanctions", title: "Sanctions Screening" },
    { re: /value date|spot date|cut-off|settlement risk|cover payment|return|recall/i, lab: "settlement", title: "Settlement Cycles" }
  ];

  function seeInLab(term) {
    for (var i = 0; i < SEE_RULES.length; i++) {
      if (SEE_RULES[i].re.test(term)) return SEE_RULES[i];
    }
    return null;
  }

  // Is the term a short code-like token (BIC, IBAN, MT103, etc.)?
  function isCodey(term) {
    return /^[A-Z0-9.\-]{2,}$/.test(term) && /[0-9]/.test(term) ||
           /^(BIC|IBAN|ABA|BSB|IFSC|SSI|UETR|gpi|RTGS|CHAPS|KYC|AML|VoP|CoP|OUR|SHA|BEN|STP)$/.test(term);
  }

  // The nine essential quick-access terms for "Start Here".
  var FEATURED = [
    "BIC", "IBAN", "Nostro", "Correspondent bank",
    "SEPA", "MT103", "UETR", "Lift fee", "SHA"
  ];

  // ── Lab registration ─────────────────────────────────────────────────
  LearnLabs["glossary"] = function (main, helpers) {
    var el = helpers.el;
    var glossify = helpers.glossify;
    var markComplete = helpers.markComplete;
    var getProgress = helpers.getProgress;

    var G = window.GLOSSARY || {};
    var terms = Object.keys(G).slice().sort(function (a, b) {
      return a.toLowerCase().localeCompare(b.toLowerCase());
    });
    var TOTAL = terms.length;

    // live view state
    var view = {
      query: "",
      category: "All",
      open: {} // term -> true (expanded cards)
    };

    // ── HEADER ──────────────────────────────────────────────────────────
    var header = el("div", "lab-header");
    header.innerHTML =
      '<div class="lab-badge">Reference</div>' +
      "<h1>Glossary</h1>" +
      '<p class="muted">' + TOTAL + "+ payment terms. Search, browse by category, " +
      "or follow the cross-references.</p>";
    main.appendChild(header);

    // ── SEARCH BAR ──────────────────────────────────────────────────────
    var searchWrap = el("div", "gloss-search");
    searchWrap.innerHTML =
      '<div class="gloss-search-field">' +
        '<span class="gloss-search-icon" aria-hidden="true">\uD83D\uDD0D</span>' +
        '<input id="gloss-input" class="lab-input" type="search" ' +
          'autocomplete="off" spellcheck="false" placeholder="Search terms or definitions..." />' +
        '<span class="gloss-search-kbd" title="Press / to focus">/</span>' +
      "</div>" +
      '<div class="gloss-search-count muted" id="gloss-count">Showing ' + TOTAL + " of " + TOTAL + "</div>";
    main.appendChild(searchWrap);

    var searchInput = searchWrap.querySelector("#gloss-input");
    var countEl = searchWrap.querySelector("#gloss-count");

    // ── CATEGORY CHIPS ──────────────────────────────────────────────────
    var chipBar = el("div", "chip-bar");
    var chips = ["All"].concat(CATEGORY_ORDER);
    chips.forEach(function (cat) {
      var btn = el("button", "chip" + (cat === "All" ? " active" : ""));
      btn.type = "button";
      btn.setAttribute("data-cat", cat);
      btn.textContent = cat;
      btn.addEventListener("click", function () {
        view.category = cat;
        chipBar.querySelectorAll(".chip").forEach(function (c) {
          c.classList.toggle("active", c.getAttribute("data-cat") === cat);
        });
        render();
      });
      chipBar.appendChild(btn);
    });
    main.appendChild(chipBar);

    // ── A-Z INDEX (browse mode only) ────────────────────────────────────
    var azWrap = el("div", "az-rail");
    azWrap.id = "gloss-az";
    main.appendChild(azWrap);

    // ── START HERE: TOP 9 ───────────────────────────────────────────────
    var featured = el("div", "callout");
    featured.innerHTML =
      '<div class="callout-title">Start here: top 9</div>' +
      '<p class="muted" style="font-size:0.8125rem;margin:0 0 0.75rem">' +
        "If you only learn a handful of terms, learn these. Each jumps to its full entry below." +
      "</p>" +
      '<div class="gloss-featured" id="gloss-featured"></div>';
    main.appendChild(featured);
    var featuredGrid = featured.querySelector("#gloss-featured");

    // ── TERMS HOST (A-Z grouped) ────────────────────────────────────────
    var termsHost = el("div");
    termsHost.id = "gloss-terms";
    main.appendChild(termsHost);

    // ── EXERCISE: Trace the payment chain ───────────────────────────────
    var exercise = el("div", "exercise");
    exercise.innerHTML =
      '<div class="exercise-header">' +
        '<span class="exercise-badge">\u2713</span>' +
        '<span class="exercise-title">Trace the payment chain</span>' +
      "</div>" +
      '<p class="exercise-prompt">' +
        "A payment from a US bank to Germany uses a " +
        '<span class="gloss-term-inline">Correspondent bank</span> that holds a ' +
        '<span class="gloss-term-inline">Nostro</span> account. The German bank sees it in their ' +
        '<span class="gloss-term-inline">Vostro</span> account. What\u2019s the Latin-rooted term ' +
        "for a <strong>third party\u2019s</strong> account?" +
      "</p>" +
      '<input class="lab-input mono" id="gloss-ex-input" type="text" ' +
        'placeholder="Type your answer..." autocomplete="off" />' +
      '<div style="margin-top:0.75rem">' +
        '<button class="lab-btn" id="gloss-ex-check">Check answer</button>' +
      "</div>" +
      '<div class="lab-result" id="gloss-ex-result"></div>';
    main.appendChild(exercise);

    var exInput = exercise.querySelector("#gloss-ex-input");
    var exBtn = exercise.querySelector("#gloss-ex-check");
    var exResult = exercise.querySelector("#gloss-ex-result");

    function markExerciseDone() {
      exInput.disabled = true;
      exBtn.disabled = true;
      exBtn.textContent = "Solved \u2713";
      markComplete("glossary");
    }

    exBtn.addEventListener("click", function () {
      var guess = (exInput.value || "").trim().toLowerCase();
      // Accept "loro" or "loro account"; reject empty.
      if (!guess) {
        exResult.className = "lab-result show lab-result-error";
        exResult.innerHTML = "Type your answer first.";
        return;
      }
      var ok = guess === "loro" || guess.indexOf("loro") === 0;
      exResult.className = "lab-result show " + (ok ? "lab-result-success" : "lab-result-error");
      if (ok) {
        exResult.innerHTML =
          '<div class="badge badge-green">Correct \u2014 Loro.</div> ' +
          glossify("Latin for \u201Ctheirs.\u201D A Loro account refers to a third party\u2019s " +
            "Nostro account \u2014 used when you\u2019re describing someone else\u2019s " +
            "correspondent relationship, not your own.");
        markExerciseDone();
      } else {
        exResult.innerHTML =
          '<div class="badge badge-red">Not quite.</div> ' +
          "Hint: Nostro = \u201Cours,\u201D Vostro = \u201Cyours.\u201D The third person in Latin " +
          "(\u201Ctheirs\u201D) is the one you want.";
      }
    });
    exInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") exBtn.click();
    });

    // Pre-populate if already completed.
    if (getProgress && getProgress().indexOf("glossary") !== -1) {
      exResult.className = "lab-result show lab-result-success";
      exResult.innerHTML =
        '<div class="badge badge-green">Completed</div> ' +
        glossify("You\u2019ve worked through the Loro / Nostro / Vostro trio.");
      markExerciseDone();
    }

    // ── NAV ─────────────────────────────────────────────────────────────
    var nav = el("div", "lab-nav");
    nav.innerHTML =
      '<a href="#">\u2190 Back to labs</a>' +
      '<a href="#fees">Fee Calculator \u2192</a>';
    main.appendChild(nav);

    // ── RENDERING ───────────────────────────────────────────────────────

    // Build the "Start Here" cards once (they don't depend on search).
    function renderFeatured() {
      featuredGrid.innerHTML = FEATURED.map(function (term) {
        var def = G[term] || "";
        var cat = classifyTerm(term);
        var preview = def.split(/\.\s/).slice(0, 1).join(". ");
        if (preview.length > 90) preview = preview.slice(0, 87) + "\u2026";
        return '<a class="gloss-featured-card" href="#gloss-term-' + esc(term.replace(/[^a-z0-9]/gi, "-")) + '" ' +
          'data-jump="' + esc(term) + '">' +
          '<span class="term-name mono' + (isCodey(term) ? "" : " no-code") + '">' + esc(term) + "</span>" +
          '<span class="term-cat-pill scheme-pill">' + esc(cat) + "</span>" +
          '<span class="term-preview">' + esc(preview) + "</span>" +
        "</a>";
      }).join("");

      // Intercept clicks so we can expand the target card too.
      featuredGrid.querySelectorAll("[data-jump]").forEach(function (a) {
        a.addEventListener("click", function (e) {
          var term = a.getAttribute("data-jump");
          view.open[term] = true;
          // Defer until after the hash jump so the element exists.
          setTimeout(function () {
            render();
            var node = document.getElementById("gloss-term-" + term.replace(/[^a-z0-9]/gi, "-"));
            if (node) node.scrollIntoView({ behavior: "smooth", block: "center" });
          }, 0);
        });
      });
    }

    function matchesQuery(term) {
      var q = view.query;
      if (!q) return true;
      var hay = (term + " \u0000" + (G[term] || "")).toLowerCase();
      return hay.indexOf(q) !== -1;
    }

    function matchesCategory(term) {
      return view.category === "All" || classifyTerm(term) === view.category;
    }

    function visibleTerms() {
      return terms.filter(function (t) {
        return matchesCategory(t) && matchesQuery(t);
      });
    }

    // Build the clickable related-term chips for a card.
    function relatedFor(term) {
      var cat = classifyTerm(term);
      var sibs = terms.filter(function (t) {
        return t !== term && classifyTerm(t) === cat;
      });
      // Prefer a couple of explicit semantic neighbours first.
      var hints = {
        "Nostro": ["Vostro", "Loro", "Correspondent bank"],
        "Vostro": ["Nostro", "Loro", "Correspondent bank"],
        "Loro": ["Nostro", "Vostro"],
        "BIC": ["SWIFT code", "IBAN", "SWIFTRef"],
        "SWIFT code": ["BIC", "IBAN"],
        "IBAN": ["BIC", "MOD-97", "IBAN registry"],
        "MT103": ["pacs.008", "UETR", "gpi"],
        "pacs.008": ["MT103", "UETR"],
        "OUR": ["SHA", "BEN", "Lift fee"],
        "SHA": ["OUR", "BEN", "Lift fee"],
        "BEN": ["OUR", "SHA", "Lift fee"],
        "Fedwire": ["FedACH", "CHIPS", "RTGS"],
        "CHAPS": ["RTGS", "TARGET2", "Fedwire"],
        "SEPA": ["TARGET2", "RTGS"],
        "VoP": ["CoP", "AML", "KYC"],
        "CoP": ["VoP", "AML", "KYC"]
      }[term];
      if (hints) {
        return hints.filter(function (h) { return G[h]; }).slice(0, 3);
      }
      return sibs.slice(0, 3);
    }

    function cardHTML(term, q) {
      var def = G[term] || "";
      var cat = classifyTerm(term);
      var id = "gloss-term-" + term.replace(/[^a-z0-9]/gi, "-");
      var isOpen = !!view.open[term];
      var nameHtml = highlight(term, q);
      var codeClass = isCodey(term) ? " mono" : "";

      // Preview: first sentence, capped.
      var firstSent = def.split(/\.\s/).slice(0, 1).join(". ");
      if (firstSent.length > 110) firstSent = firstSent.slice(0, 107) + "\u2026";
      var previewHtml = highlight(firstSent, q);

      var related = relatedFor(term);
      var see = seeInLab(term);

      var body = "";
      if (isOpen) {
        var fullDef = q ? highlight(def, q) : glossify(def);
        body =
          '<div class="term-fulldef">' + fullDef + "</div>" +
          (related.length
            ? '<div class="term-related">' +
                '<span class="muted">Related:</span> ' +
                related.map(function (r) {
                  return '<button type="button" class="term-related-chip" data-jump="' + esc(r) + '">' +
                    esc(r) + "</button>";
                }).join("") +
              "</div>"
            : "") +
          (see
            ? '<div class="term-see">' +
                '<a href="#lab-' + esc(see.lab) + '">' + esc(see.title) + " \u2192</a>" +
              "</div>"
            : "");
      }

      return '<div class="term-card' + (isOpen ? " expanded" : "") + '" id="' + esc(id) + '">' +
        '<div class="term-card-head" data-term="' + esc(term) + '" role="button" tabindex="0">' +
          '<span class="term-name' + codeClass + '">' + nameHtml + "</span>" +
          '<span class="term-cat-pill scheme-pill">' + esc(cat) + "</span>" +
          '<span class="term-preview">' + previewHtml + "</span>" +
          '<span class="term-chevron" aria-hidden="true">' + (isOpen ? "\u2212" : "+") + "</span>" +
        "</div>" +
        '<div class="term-card-body">' + body + "</div>" +
      "</div>";
    }

    function renderAZ() {
      // Only show in browse mode (no query).
      if (view.query) {
        azWrap.style.display = "none";
        azWrap.innerHTML = "";
        return;
      }
      azWrap.style.display = "";
      // Letters that have at least one visible term.
      var present = {};
      visibleTerms().forEach(function (t) {
        var c = t.charAt(0).toUpperCase();
        present[c] = (present[c] || 0) + 1;
      });
      var html = "";
      for (var i = 0; i < 26; i++) {
        var L = String.fromCharCode(65 + i);
        var has = !!present[L];
        html += '<a class="az-letter' + (has ? "" : " disabled") + '" ' +
          (has ? 'href="#gloss-letter-' + L + '"' : 'aria-disabled="true"') +
          ' data-letter="' + L + '">' + L + "</a>";
      }
      azWrap.innerHTML = html;
    }

    function render() {
      // Count + search-mode visibility.
      var list = visibleTerms();
      countEl.textContent = "Showing " + list.length + " of " + TOTAL;

      // Group by first letter.
      var byLetter = {};
      list.forEach(function (t) {
        var c = t.charAt(0).toUpperCase();
        if (!byLetter[c]) byLetter[c] = [];
        byLetter[c].push(t);
      });

      var q = view.query;
      var html = "";
      var letters = Object.keys(byLetter).sort();
      if (letters.length === 0) {
        html = '<div class="callout" style="margin-top:1rem">' +
          "<strong>No matches.</strong> " +
          (q ? "Nothing matches \u201C" + esc(q) + "\u201D. Try a different term or clear the search." :
              "No terms in this category.") +
        "</div>";
      } else {
        letters.forEach(function (L) {
          html += '<div class="gloss-letter-group" id="gloss-letter-' + esc(L) + '">' +
            '<div class="gloss-letter-head">' + esc(L) + "</div>" +
            '<div class="gloss-letter-cards">' +
              byLetter[L].map(function (t) { return cardHTML(t, q); }).join("") +
            "</div>" +
          "</div>";
        });
      }
      termsHost.innerHTML = html;

      // Re-render the A-Z rail.
      renderAZ();

      // Wire card toggles.
      termsHost.querySelectorAll(".term-card-head").forEach(function (head) {
        var term = head.getAttribute("data-term");
        function toggle() {
          view.open[term] = !view.open[term];
          render();
        }
        head.addEventListener("click", toggle);
        head.addEventListener("keydown", function (e) {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle();
          }
        });
      });

      // Wire related chips (jump to another term, expand it).
      termsHost.querySelectorAll(".term-related-chip").forEach(function (chip) {
        chip.addEventListener("click", function (e) {
          e.stopPropagation();
          var term = chip.getAttribute("data-jump");
          view.open[term] = true;
          render();
          var node = document.getElementById("gloss-term-" + term.replace(/[^a-z0-9]/gi, "-"));
          if (node) node.scrollIntoView({ behavior: "smooth", block: "center" });
        });
      });
    }

    // ── SEARCH WIRING ───────────────────────────────────────────────────
    var debounceTimer = null;
    function onSearchInput() {
      var v = searchInput.value;
      countEl.textContent = "Searching\u2026";
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function () {
        view.query = v.trim().toLowerCase();
        render();
      }, 80);
    }
    searchInput.addEventListener("input", onSearchInput);

    // Esc clears search; "/" focuses it.
    document.addEventListener("keydown", function (e) {
      var tag = (e.target && e.target.tagName) || "";
      var inField = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      if (e.key === "/" && !inField) {
        e.preventDefault();
        searchInput.focus();
        searchInput.select();
      } else if (e.key === "Escape" && document.activeElement === searchInput) {
        searchInput.value = "";
        view.query = "";
        render();
        searchInput.blur();
      }
    });

    // ── FIRST PAINT ─────────────────────────────────────────────────────
    renderFeatured();
    render();
  };
})();
