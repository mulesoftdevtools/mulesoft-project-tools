/* =====================================================================
   Home page — live filtering of the tool directory by text and category
   ===================================================================== */
(function () {
  "use strict";

  var input = document.getElementById("home-search");
  var chipWrap = document.getElementById("home-filters");
  var blocks = document.getElementById("home-blocks");
  var empty = document.getElementById("home-empty");
  var note = document.getElementById("home-results-note");
  var reset = document.getElementById("home-reset");
  if (!blocks) return;

  var cards = Array.prototype.slice.call(blocks.querySelectorAll(".tool-card"));
  var catBlocks = Array.prototype.slice.call(blocks.querySelectorAll("[data-cat-block]"));
  var total = cards.length;
  var activeCat = "all";

  function matches(card, query) {
    if (activeCat !== "all" && card.getAttribute("data-cat") !== activeCat) return false;
    if (!query) return true;
    var haystack = (card.getAttribute("data-name") + " " + card.getAttribute("data-keywords")).toLowerCase();
    return query.split(/\s+/).filter(Boolean).every(function (term) {
      return haystack.indexOf(term) !== -1;
    });
  }

  function apply() {
    var query = (input && input.value ? input.value : "").trim().toLowerCase();
    var shown = 0;

    cards.forEach(function (card) {
      var ok = matches(card, query);
      card.style.display = ok ? "" : "none";
      if (ok) shown++;
    });

    catBlocks.forEach(function (block) {
      var visible = block.querySelectorAll('.tool-card:not([style*="display: none"])').length;
      block.style.display = visible ? "" : "none";
    });

    if (empty) empty.style.display = shown ? "none" : "";
    if (note) {
      if (!query && activeCat === "all") note.textContent = "Showing all " + total + " tools.";
      else note.textContent = "Showing " + shown + " of " + total + " tools.";
    }
  }

  if (input) {
    input.addEventListener("input", apply);
    input.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { input.value = ""; apply(); }
    });
  }

  if (chipWrap) {
    chipWrap.addEventListener("click", function (e) {
      var chip = e.target.closest(".chip");
      if (!chip) return;
      activeCat = chip.getAttribute("data-filter");
      Array.prototype.slice.call(chipWrap.querySelectorAll(".chip")).forEach(function (c) {
        c.classList.toggle("is-active", c === chip);
      });
      apply();
    });
  }

  if (reset) {
    reset.addEventListener("click", function () {
      if (input) input.value = "";
      activeCat = "all";
      if (chipWrap) {
        Array.prototype.slice.call(chipWrap.querySelectorAll(".chip")).forEach(function (c) {
          c.classList.toggle("is-active", c.getAttribute("data-filter") === "all");
        });
      }
      apply();
    });
  }

  apply();
})();

/* =====================================================================
   Home page — "Favourites" and "Recently used" shortcuts (local only)
   ===================================================================== */
(function () {
  "use strict";
  var wrap = document.getElementById("home-personal");
  if (!wrap || !window.MPT || !MPT.favorites) return;

  function chip(t) {
    return '<a class="quick-chip" href="' + t.id + '.html">' + MPT.icon(t.icon) + "<span>" + MPT.escapeHtml(t.name) + "</span></a>";
  }

  function render() {
    var favs = MPT.favorites.list().map(MPT.toolById);
    var recent = MPT.recent.list().filter(function (id) { return MPT.favorites.list().indexOf(id) === -1; }).slice(0, 6).map(MPT.toolById);
    var html = "";
    if (favs.length) {
      html += '<div class="quick-row"><span class="quick-label">' + MPT.icon("star-filled") + " Favourites</span>" + favs.map(chip).join("") + "</div>";
    }
    if (recent.length) {
      html += '<div class="quick-row"><span class="quick-label">' + MPT.icon("history") + " Recently used</span>" + recent.map(chip).join("") +
        '<button type="button" class="btn btn-ghost btn-sm" id="home-clear-recent">Clear</button></div>';
    }
    if (!html) {
      html = '<div class="quick-row quick-empty">' + MPT.icon("star") +
        " <span>Tip: open any tool and press <strong>Add to favourites</strong> to pin it here and at the top of the sidebar.</span></div>";
    }
    wrap.innerHTML = html;
    var clear = document.getElementById("home-clear-recent");
    if (clear) clear.addEventListener("click", function () { MPT.recent.clear(); render(); });
  }

  render();
})();
