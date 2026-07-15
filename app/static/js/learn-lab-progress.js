/*
 * Progress Dashboard — "Your Journey"
 *
 * The culmination module. Shows the learner:
 * 1. A completion ring (X / 15 modules, percentage)
 * 2. Earned + locked badges (fetched from /api/progress)
 * 3. A visual journey map of all modules — done / current / locked
 * 4. A shareable summary text block they can copy
 *
 * The frontend reads completed module IDs from localStorage (same key as
 * learn.js: "swift-lab-progress") and passes them to the backend, which
 * computes badges + stats. This keeps badge logic in one place (the Python
 * service) so the tests are authoritative.
 *
 * Registered as LearnLabs["progress"]. Loaded after the other labs, before
 * learn.js.
 */
window.LearnLabs = window.LearnLabs || {};

(function () {
  "use strict";

  var esc = LearnUtils.esc;

  var STORAGE_KEY = "swift-lab-progress";

  // Module metadata for the journey map — order matches the backend's
  // ALL_MODULE_IDS so the visual flows the same way the logic counts.
  var MODULES = [
    { id: "1",          label: "BICs & IBANs",         route: "#lab-1",          group: "core" },
    { id: "2",          label: "Checksums",            route: "#lab-2",          group: "core" },
    { id: "3",          label: "Verification of Payee", route: "#lab-3",         group: "core" },
    { id: "4",          label: "Routing Chains",       route: "#lab-4",          group: "core" },
    { id: "5",          label: "Settlement Instructions", route: "#lab-5",       group: "core" },
    { id: "6",          label: "UETR & Tracking",      route: "#lab-6",          group: "core" },
    { id: "7",          label: "Payment Schemes",      route: "#lab-7",          group: "core" },
    { id: "capstone",   label: "Capstone",             route: "#lab-capstone",   group: "core" },
    { id: "fees",       label: "Fee Calculator",       route: "#fees",           group: "deeper" },
    { id: "fx",         label: "FX Calculator",        route: "#fx",             group: "deeper" },
    { id: "sanctions",  label: "Sanctions Screening",  route: "#sanctions",      group: "deeper" },
    { id: "settlement", label: "Settlement Cycles",    route: "#settlement",     group: "deeper" },
    { id: "mt103",      label: "MT103 Decoder",        route: "#mt103",          group: "deeper" },
    { id: "cases",      label: "Case Studies",         route: "#cases",          group: "deeper" },
    { id: "glossary",   label: "Glossary",             route: "#glossary",       group: "deeper" },
  ];

  function getCompleted() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    } catch (e) {
      return [];
    }
  }

  // ── SVG completion ring ─────────────────────────────────────────────
  // A circular progress gauge. radius=52, circumference ≈ 327.
  function ringSVG(pct) {
    var r = 52;
    var c = 2 * Math.PI * r;
    var offset = c * (1 - pct / 100);
    return ''
      + '<svg class="progress-ring" viewBox="0 0 120 120" width="120" height="120">'
      +   '<circle class="ring-track" cx="60" cy="60" r="' + r + '" fill="none" stroke-width="8"/>'
      +   '<circle class="ring-fill" cx="60" cy="60" r="' + r + '" fill="none" stroke-width="8" '
      +     'stroke-dasharray="' + c.toFixed(1) + '" '
      +     'stroke-dashoffset="' + offset.toFixed(1) + '"/>'
      + '</svg>';
  }

  // ── Fetch progress from backend ─────────────────────────────────────
  function fetchProgress(completed, cb) {
    var qs = completed.length ? "?completed=" + encodeURIComponent(completed.join(",")) : "";
    var xhr = new XMLHttpRequest();
    xhr.open("GET", "/api/progress" + qs, true);
    xhr.setRequestHeader("Accept", "application/json");
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      if (xhr.status === 200) {
        try { cb(null, JSON.parse(xhr.responseText)); }
        catch (e) { cb(e); }
      } else {
        cb(new Error("HTTP " + xhr.status));
      }
    };
    xhr.send();
  }

  // ── Render: header + completion ring ────────────────────────────────
  function renderHeader(data) {
    var html = ''
      + '<div class="lab-header">'
      +   '<h1>Your Progress</h1>'
      +   '<p>Track your journey through the SWIFT Routing Lab. Earn badges, see what to learn next, and share your progress.</p>'
      + '</div>';

    html += '<div class="progress-overview">';
    html += '  <div class="progress-ring-wrap">';
    html +=     ringSVG(data.percentage);
    html += '    <div class="progress-ring-center">'
    +           '<span class="progress-pct">' + esc(data.percentage) + '%</span>'
    +           '<span class="progress-count">' + esc(data.completed_count) + '/' + esc(data.total_count) + '</span>'
    +         '</div>';
    html += '  </div>';
    html += '  <div class="progress-stats">';

    if (data.percentage === 100) {
      html += '    <div class="progress-shout progress-shout-done">🎉 You completed every module!</div>';
    } else if (data.next_recommended) {
      var nextLabel = labelFor(data.next_recommended);
      html += '    <div class="progress-next">';
      html += '      <div class="progress-next-label">Recommended next</div>';
      html += '      <a class="progress-next-link" href="' + esc(routeFor(data.next_recommended)) + '">' + esc(nextLabel) + ' →</a>';
      html += '    </div>';
    }

    html += '    <div class="progress-stat-row">';
    html += '      <span class="progress-stat-num">' + esc(data.completed_count) + '</span>';
    html += '      <span class="progress-stat-lbl">modules completed</span>';
    html += '    </div>';
    html += '    <div class="progress-stat-row">';
    html += '      <span class="progress-stat-num">' + esc(data.earned_badges.length) + '</span>';
    html += '      <span class="progress-stat-lbl">badges earned</span>';
    html += '    </div>';
    html += '  </div>';
    html += '</div>';

    return html;
  }

  function labelFor(id) {
    for (var i = 0; i < MODULES.length; i++) {
      if (MODULES[i].id === id) return MODULES[i].label;
    }
    return id;
  }

  function routeFor(id) {
    for (var i = 0; i < MODULES.length; i++) {
      if (MODULES[i].id === id) return MODULES[i].route;
    }
    return "#lab-" + id;
  }

  // ── Render: badges grid ─────────────────────────────────────────────
  function renderBadges(allBadges) {
    var html = '<section class="progress-section">';
    html += '  <h2>Badges</h2>';
    html += '  <p class="muted">' + esc(allBadges.filter(function (b) { return b.earned; }).length)
          + ' of ' + esc(allBadges.length) + ' earned</p>';
    html += '  <div class="badge-grid">';

    allBadges.forEach(function (b) {
      var cls = "badge-card " + (b.earned ? "badge-earned" : "badge-locked");
      html += '  <div class="' + cls + '">';
      html += '    <div class="badge-icon">' + (b.earned ? esc(badgeIcon(b.id)) : "🔒") + '</div>';
      html += '    <div class="badge-name">' + esc(b.name) + '</div>';
      html += '    <div class="badge-desc">' + esc(b.description) + '</div>';
      if (!b.earned) {
        html += '  <div class="badge-req">Earn: ' + esc(b.requirement) + '</div>';
      }
      html += '  </div>';
    });

    html += '  </div>';
    html += '</section>';
    return html;
  }

  // Simple emoji per badge id, for a touch of visual variety.
  function badgeIcon(id) {
    var icons = {
      "fee-forensics": "🔍",
      "fx-sharp": "💱",
      "compliance-aware": "🛡️",
      "payment-fundamentals": "🔑",
      "gpi-tracker": "📡",
      "settlement-sage": "📅",
      "payment-operator": "⚙️",
      "wire-wizard": "🧙",
    };
    return icons[id] || "🏅";
  }

  // ── Render: journey map ─────────────────────────────────────────────
  function renderJourney(completedSet) {
    var html = '<section class="progress-section">';
    html += '  <h2>Your Journey</h2>';
    html += '  <div class="journey-map">';

    MODULES.forEach(function (m, i) {
      var isDone = completedSet.indexOf(m.id) !== -1;
      var cls = "journey-node " + (isDone ? "done" : "todo");
      if (m.group === "core") cls += " journey-core";

      html += '  <a class="' + cls + '" href="' + esc(m.route) + '">';
      html += '    <span class="journey-check">' + (isDone ? "✓" : (i + 1)) + '</span>';
      html += '    <span class="journey-label">' + esc(m.label) + '</span>';
      html += '  </a>';
    });

    html += '  </div>';
    html += '</section>';
    return html;
  }

  // ── Render: shareable summary ───────────────────────────────────────
  function renderShare(data, completedSet) {
    var lines = [];
    lines.push("SWIFT Routing Lab — Progress");
    lines.push(data.completed_count + "/" + data.total_count + " modules (" + data.percentage + "%)");
    if (data.earned_badges.length > 0) {
      lines.push("");
      lines.push("Badges earned:");
      data.earned_badges.forEach(function (b) {
        lines.push("  • " + b.name);
      });
    } else {
      lines.push("");
      lines.push("No badges yet — start with Lab 1!");
    }
    var summary = lines.join("\n");

    var html = '<section class="progress-section">';
    html += '  <h2>Share Your Progress</h2>';
    html += '  <textarea class="share-box" readonly>' + esc(summary) + '</textarea>';
    html += '  <button class="btn btn-copy" id="progress-copy-btn">Copy to clipboard</button>';
    html += '  <span class="copy-msg" id="progress-copy-msg"></span>';
    html += '</section>';
    return html;
  }

  // ── Wire up copy button after render ────────────────────────────────
  function wireCopy() {
    var btn = document.getElementById("progress-copy-btn");
    var msg = document.getElementById("progress-copy-msg");
    if (!btn || !msg) return;
    btn.addEventListener("click", function () {
      var box = document.querySelector(".share-box");
      if (!box) return;
      box.select();
      try {
        document.execCommand("copy");
        msg.textContent = "Copied!";
        msg.className = "copy-msg copy-msg-ok";
      } catch (e) {
        msg.textContent = "Press Ctrl+C to copy";
        msg.className = "copy-msg copy-msg-err";
      }
      setTimeout(function () { msg.textContent = ""; }, 2500);
    });
  }

  // ── Main render entry point (called by learn.js router) ─────────────
  function render(main, helpers) {
    main.innerHTML = ''
      + '<div class="lab-header">'
      +   '<h1>Your Progress</h1>'
      +   '<p class="muted">Loading your dashboard…</p>'
      + '</div>';

    var completed = getCompleted();

    fetchProgress(completed, function (err, data) {
      if (err) {
        main.innerHTML = ''
          + '<div class="lab-header">'
          +   '<h1>Your Progress</h1>'
          +   '<p class="muted">Could not load progress. Is the backend running?</p>'
          + '</div>';
        return;
      }

      var completedSet = completed;

      var html = renderHeader(data)
               + renderBadges(data.all_badges || [])
               + renderJourney(completedSet)
               + renderShare(data, completedSet);

      main.innerHTML = html;
      wireCopy();
    });
  }

  window.LearnLabs["progress"] = render;
})();
