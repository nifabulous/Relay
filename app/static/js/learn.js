/*
 * Learn Mode — main router + progress tracking.
 * Lab content is loaded from learn-labs.js (window.LearnLabs).
 */
(function () {
  "use strict";

  const STORAGE_KEY = "swift-lab-progress";
  const labs = ["1", "2", "3", "4", "5", "6", "7", "capstone", "fees", "fx", "sanctions", "settlement", "mt103", "cases", "glossary", "progress"];

  // ── Progress tracking ──────────────────────────────────
  function getProgress() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    } catch {
      return [];
    }
  }

  function markComplete(lab) {
    const done = getProgress();
    if (!done.includes(lab)) {
      done.push(lab);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(done));
    }
    updateProgressUI();
  }

  function updateProgressUI() {
    const done = getProgress();
    document.getElementById("progress-count").textContent = done.length;
    const pct = (done.length / labs.length) * 100;
    document.getElementById("progress-fill").style.width = pct + "%";

    // Mark completed labs in nav (add or remove)
    document.querySelectorAll(".lab-list a").forEach((a) => {
      const lab = a.dataset.lab;
      if (done.includes(lab)) {
        a.classList.add("completed");
      } else {
        a.classList.remove("completed");
      }
    });
  }

  // ── Helpers ────────────────────────────────────────────
  function el(tag, className, html) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (html != null) e.innerHTML = html;
    return e;
  }

  function glossify(text) {
    // Auto-link glossary terms in text
    if (!window.GLOSSARY) return text;
    let result = text;
    // Sort by length descending so longer terms match first
    const terms = Object.keys(GLOSSARY).sort((a, b) => b.length - a.length);
    for (const term of terms) {
      const def = GLOSSARY[term].replace(/"/g, "&quot;");
      const re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
      result = result.replace(re, `<span class="gloss-term" data-def="${def}">${term}</span>`);
    }
    return result;
  }

  // ── Landing page ───────────────────────────────────────
  function renderLanding(main) {
    const h = el("div", "lab-landing");
    h.innerHTML = `
      <h1>SWIFT Routing Lab</h1>
      <p class="tagline">Learn how international payments work — by doing each step yourself.</p>
      <p class="muted" style="margin-bottom:2rem">No prior knowledge needed. Each lab takes 5–10 minutes. You'll go from "what's a BIC?" to simulating a full cross-border payment.</p>
    `;

    const path = el("div", "lab-path");
    const items = [
      ["1", "Who's Who: BICs & IBANs", "Learn the codes that identify banks and accounts worldwide.", "~8 min"],
      ["2", "Is It Real? Checksums", "Understand how IBANs are validated — and break one on purpose.", "~7 min"],
      ["3", "Right Person? Verification of Payee", "See how banks catch wrong names before money moves.", "~8 min"],
      ["4", "How Money Moves: Routing", "Trace the path through intermediary banks.", "~10 min"],
      ["5", "Where to Send: Settlement Instructions", "Find the actual account numbers that make payments land.", "~8 min"],
      ["6", "Did It Arrive? Tracking", "Follow a payment's journey with a UETR.", "~7 min"],
      ["7", "Which Rail? Payment Schemes", "Faster Payments vs CHAPS vs Bacs — pick the right one.", "~8 min"],
      ["capstone", "★ Capstone: Full Payment", "Put it all together — send a complete payment end-to-end.", "~10 min"],
      ["fees", "· Fee Calculator", "Where did my money go? See fees deducted at each hop.", "~10 min"],
      ["fx", "· FX Calculator", "The bigger hidden cost: the exchange rate spread.", "~12 min"],
      ["sanctions", "· Sanctions Screening", "Why payments get stopped — screening at every bank.", "~15 min"],
      ["settlement", "· Settlement Cycles", "Why a Friday payment arrives Tuesday. Cut-offs, holidays, T+2.", "~12 min"],
      ["mt103", "· MT103 Decoder", "Decode a real SWIFT message field by field, then run STP checks.", "~10 min"],
      ["cases", "· Case Studies", "When payments go wrong — four real incidents, dissected.", "~12 min"],
      ["glossary", "· Glossary", "55+ payment terms — searchable, browsable, cross-referenced.", "Reference"],
      ["progress", "· Your Progress", "Track badges, completion stats, and what to learn next.", "Dashboard"],
    ];

    items.forEach(([num, title, desc, time]) => {
      const done = getProgress();
      const check = done.includes(num) ? ' <span class="badge badge-green">✓ Done</span>' : "";
      const item = el("a", "lab-path-item");
      // Numeric labs and capstone use #lab-X; the rest use #id directly,
      // matching the nav sidebar routes and the router regex.
      const isLabRoute = /^\d+$/.test(num) || num === "capstone";
      item.href = isLabRoute ? `#lab-${num}` : `#${num}`;
      item.innerHTML = `
        <div class="lab-path-num">${num}</div>
        <div class="lab-path-body">
          <h3>${title}${check}</h3>
          <p>${desc}</p>
          <div class="lab-path-time">${time}</div>
        </div>`;
      path.appendChild(item);
    });

    h.appendChild(path);
    main.innerHTML = "";
    main.appendChild(h);
  }

  // ── Navigation ─────────────────────────────────────────
  function navigate(hash) {
    const main = document.getElementById("lab-main");
    const match = hash.match(/lab-(\d+|capstone)/) || hash.match(/^#(fees|fx|glossary|sanctions|settlement|mt103|cases|progress)$/);
    const labId = match ? match[1] : null;

    // Update nav active state
    document.querySelectorAll(".lab-list a").forEach((a) => a.classList.remove("active"));
    if (labId) {
      const navLink = document.querySelector(`.lab-list a[data-lab="${labId}"]`);
      if (navLink) navLink.classList.add("active");
    }

    // Render
    main.innerHTML = "";
    if (!labId) {
      renderLanding(main);
    } else if (window.LearnLabs && LearnLabs[labId]) {
      LearnLabs[labId](main, { el, glossify, markComplete, getProgress });
    } else {
      main.innerHTML = `<div class="lab-header"><h1>Coming soon</h1><p>This lab hasn't been built yet.</p></div>`;
    }

    // Scroll to top
    window.scrollTo(0, 0);
  }

  // ── Lab nav helpers (prev/next) ────────────────────────
  window.LearnHelpers = { el, glossify, markComplete, getProgress, navigate };

  // ── Init ───────────────────────────────────────────────
  document.addEventListener("DOMContentLoaded", () => {
    updateProgressUI();
    navigate(location.hash || "");
  });

  window.addEventListener("hashchange", () => navigate(location.hash));
})();
