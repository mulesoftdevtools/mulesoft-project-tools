/* =====================================================================
   MuleSoft Project Tools — application shell
   Builds the topbar nav state, sidebar, global search, theme handling,
   and exposes the shared MPT helper API used by every tool module.
   Depends on: js/registry.js  (window.MPT_DATA = { categories, tools })
   ===================================================================== */
(function () {
  "use strict";

  var DATA = window.MPT_DATA || { categories: [], tools: [] };
  var ICONS = DATA.icons || {};

  /* ---------------------------------------------------------------
     Small utilities
     --------------------------------------------------------------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function byId(id) { return document.getElementById(id); }

  function el(tag, attrs, html) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === "class") node.className = attrs[k];
        else if (k === "text") node.textContent = attrs[k];
        else node.setAttribute(k, attrs[k]);
      });
    }
    if (html !== undefined) node.innerHTML = html;
    return node;
  }

  function escapeHtml(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function icon(name, cls) {
    var svg = ICONS[name] || ICONS.tool || "";
    if (!svg) return "";
    return cls ? svg.replace("<svg ", '<svg class="' + cls + '" ') : svg;
  }

  function debounce(fn, wait) {
    var t;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, wait);
    };
  }

  function storageGet(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }
  function storageSet(key, value) {
    try { window.localStorage.setItem(key, value); } catch (e) { /* private mode */ }
  }

  /* ---------------------------------------------------------------
     Theme
     --------------------------------------------------------------- */
  var THEME_KEY = "mpt-theme";

  function currentTheme() {
    return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
  }

  function applyTheme(theme) {
    if (theme === "light") document.documentElement.setAttribute("data-theme", "light");
    else document.documentElement.setAttribute("data-theme", "dark");
    var btn = byId("theme-toggle");
    if (btn) {
      var isLight = theme === "light";
      btn.innerHTML = icon(isLight ? "moon" : "sun");
      btn.setAttribute("aria-label", isLight ? "Switch to dark theme" : "Switch to light theme");
      btn.setAttribute("title", isLight ? "Switch to dark theme" : "Switch to light theme");
    }
  }

  function initTheme() {
    var stored = storageGet(THEME_KEY);
    var theme = stored === "light" || stored === "dark" ? stored : null;
    if (!theme) {
      theme = (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) ? "light" : "dark";
    }
    applyTheme(theme);
    var btn = byId("theme-toggle");
    if (btn) {
      btn.addEventListener("click", function () {
        var next = currentTheme() === "light" ? "dark" : "light";
        applyTheme(next);
        storageSet(THEME_KEY, next);
      });
    }
  }

  /* ---------------------------------------------------------------
     Sidebar
     --------------------------------------------------------------- */
  function currentPage() {
    var path = window.location.pathname;
    var file = path.substring(path.lastIndexOf("/") + 1);
    if (!file) return "index.html";
    return file;
  }

  function buildSidebar() {
    var sidebar = byId("sidebar");
    if (!sidebar) return;
    var page = currentPage();
    var frag = document.createDocumentFragment();

    var homeGroup = el("div", { class: "sidebar-group" });
    homeGroup.appendChild(el("div", { class: "sidebar-title" }, icon("home") + "<span>Overview</span>"));
    var homeLink = el("a", {
      class: "sidebar-link" + (page === "index.html" ? " is-active" : ""),
      href: "index.html"
    }, icon("grid") + "<span>All tools</span>");
    homeGroup.appendChild(homeLink);
    frag.appendChild(homeGroup);

    DATA.categories.forEach(function (cat) {
      var tools = DATA.tools.filter(function (t) { return t.cat === cat.id; });
      if (!tools.length) return;
      var group = el("div", { class: "sidebar-group" });
      group.appendChild(el("div", { class: "sidebar-title" }, icon(cat.icon) + "<span>" + escapeHtml(cat.name) + "</span>"));
      tools.forEach(function (t) {
        var href = t.id + ".html";
        var link = el("a", {
          class: "sidebar-link" + (page === href ? " is-active" : ""),
          href: href
        }, icon(t.icon) + "<span>" + escapeHtml(t.name) + "</span>");
        group.appendChild(link);
      });
      frag.appendChild(group);
    });

    sidebar.appendChild(frag);
  }

  function initSidebarToggle() {
    var sidebar = byId("sidebar");
    var backdrop = byId("sidebar-backdrop");
    var btn = byId("menu-toggle");
    if (!sidebar || !btn || !backdrop) return;

    function open() {
      sidebar.classList.add("is-open");
      backdrop.classList.add("is-open");
      btn.setAttribute("aria-expanded", "true");
      document.body.style.overflow = "hidden";
    }
    function close() {
      sidebar.classList.remove("is-open");
      backdrop.classList.remove("is-open");
      btn.setAttribute("aria-expanded", "false");
      document.body.style.overflow = "";
    }
    function toggle() {
      if (sidebar.classList.contains("is-open")) close(); else open();
    }

    btn.addEventListener("click", toggle);
    backdrop.addEventListener("click", close);
    sidebar.addEventListener("click", function (e) {
      if (e.target.closest("a")) close();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && sidebar.classList.contains("is-open")) close();
    });
    window.addEventListener("resize", function () {
      if (window.innerWidth > 960 && sidebar.classList.contains("is-open")) close();
    });
  }

  /* ---------------------------------------------------------------
     Search (topbar dropdown)
     --------------------------------------------------------------- */
  function scoreTool(tool, query) {
    var q = query.toLowerCase();
    var name = tool.name.toLowerCase();
    var short = (tool.short || "").toLowerCase();
    var keywords = (tool.keywords || "").toLowerCase();

    if (name === q) return 1000;
    if (name.indexOf(q) === 0) return 800;
    if (name.indexOf(q) !== -1) return 600;

    // every whitespace-separated term must appear somewhere
    var haystack = name + " " + short + " " + keywords;
    var terms = q.split(/\s+/).filter(Boolean);
    var all = terms.every(function (t) { return haystack.indexOf(t) !== -1; });
    if (!all) return 0;
    if (keywords.indexOf(q) !== -1) return 400;
    if (short.indexOf(q) !== -1) return 250;
    return 120;
  }

  function searchTools(query) {
    if (!query || !query.trim()) return [];
    var q = query.trim();
    return DATA.tools
      .map(function (t) { return { tool: t, score: scoreTool(t, q) }; })
      .filter(function (r) { return r.score > 0; })
      .sort(function (a, b) { return b.score - a.score || a.tool.name.localeCompare(b.tool.name); })
      .map(function (r) { return r.tool; });
  }

  function initSearch() {
    var input = byId("global-search");
    var results = byId("search-results");
    if (!input || !results) return;

    var activeIndex = -1;
    var currentList = [];

    function closeResults() {
      results.classList.remove("is-open");
      results.innerHTML = "";
      activeIndex = -1;
      currentList = [];
      input.setAttribute("aria-expanded", "false");
    }

    function renderResults(list) {
      currentList = list;
      activeIndex = list.length ? 0 : -1;
      results.innerHTML = "";
      if (!list.length) {
        results.appendChild(el("div", { class: "sr-empty" },
          "No tools match that search.<br><span style=\"font-size:.8rem\">Try &ldquo;json&rdquo;, &ldquo;raml&rdquo;, &ldquo;encode&rdquo; or &ldquo;cron&rdquo;.</span>"));
      } else {
        list.slice(0, 12).forEach(function (t, i) {
          var a = el("a", { class: "sr-item" + (i === 0 ? " is-active" : ""), href: t.id + ".html" },
            '<span class="sr-ico">' + icon(t.icon) + "</span>" +
            '<span class="sr-body">' +
              '<span class="sr-name">' + escapeHtml(t.name) + "</span>" +
              '<span class="sr-desc">' + escapeHtml(t.short) + "</span>" +
            "</span>");
          a.addEventListener("mouseenter", function () { setActive(i); });
          results.appendChild(a);
        });
      }
      results.classList.add("is-open");
      input.setAttribute("aria-expanded", "true");
    }

    function setActive(i) {
      var items = $$(".sr-item", results);
      if (!items.length) return;
      activeIndex = (i + items.length) % items.length;
      items.forEach(function (item, idx) { item.classList.toggle("is-active", idx === activeIndex); });
      var active = items[activeIndex];
      if (active && active.scrollIntoView) active.scrollIntoView({ block: "nearest" });
    }

    input.addEventListener("input", function () {
      var q = input.value;
      if (!q.trim()) { closeResults(); return; }
      renderResults(searchTools(q));
    });

    input.addEventListener("focus", function () {
      if (input.value.trim()) renderResults(searchTools(input.value));
    });

    input.addEventListener("keydown", function (e) {
      var items = $$(".sr-item", results);
      if (e.key === "ArrowDown") { e.preventDefault(); if (items.length) setActive(activeIndex + 1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); if (items.length) setActive(activeIndex - 1); }
      else if (e.key === "Enter") {
        if (activeIndex >= 0 && items[activeIndex]) {
          e.preventDefault();
          window.location.href = items[activeIndex].getAttribute("href");
        }
      } else if (e.key === "Escape") {
        closeResults();
        input.blur();
      }
    });

    document.addEventListener("click", function (e) {
      if (!e.target.closest("#search-results") && e.target !== input) closeResults();
    });

    document.addEventListener("keydown", function (e) {
      var tag = (document.activeElement && document.activeElement.tagName) || "";
      var typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        input.focus();
        input.select();
      } else if (e.key === "/" && !typing) {
        e.preventDefault();
        input.focus();
      }
    });
  }

  /* ---------------------------------------------------------------
     Top nav active state
     --------------------------------------------------------------- */
  function initTopNav() {
    var page = currentPage();
    $$(".topnav a").forEach(function (a) {
      var href = a.getAttribute("href");
      if (href === page) a.classList.add("is-active");
      if (page !== "index.html" && href === "index.html" && a.dataset.matchTools === "true") {
        a.classList.add("is-active");
      }
    });
  }

  /* ---------------------------------------------------------------
     Toast + clipboard + download
     --------------------------------------------------------------- */
  var toastTimer = null;
  function toast(message) {
    var node = byId("toast");
    if (!node) {
      node = el("div", { class: "toast", id: "toast", role: "status", "aria-live": "polite" });
      document.body.appendChild(node);
    }
    node.textContent = message;
    node.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { node.classList.remove("is-visible"); }, 1900);
  }

  function fallbackCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }

  function copy(text) {
    if (text === null || text === undefined || text === "") {
      toast("Nothing to copy yet");
      return;
    }
    var str = String(text);
    if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
      navigator.clipboard.writeText(str).then(function () {
        toast("Copied to clipboard");
      }).catch(function () {
        toast(fallbackCopy(str) ? "Copied to clipboard" : "Copy failed — select the text manually");
      });
    } else {
      toast(fallbackCopy(str) ? "Copied to clipboard" : "Copy failed — select the text manually");
    }
  }

  function download(filename, text, mime) {
    if (!text) { toast("Nothing to download yet"); return; }
    var blob = new Blob([text], { type: mime || "text/plain;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = el("a", { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    toast("Downloaded " + filename);
  }

  /* ---------------------------------------------------------------
     Message helpers
     --------------------------------------------------------------- */
  var MSG_ICON = { ok: "check-circle", error: "alert-circle", warn: "alert-triangle", info: "info" };

  function showMsg(target, text, type) {
    var node = typeof target === "string" ? byId(target) : target;
    if (!node) return;
    type = type || "info";
    node.className = "msg is-visible msg-" + (type === "ok" ? "ok" : type === "error" ? "error" : type === "warn" ? "warn" : "info");
    node.innerHTML = icon(MSG_ICON[type] || "info") + "<span></span>";
    var span = node.querySelector("span");
    if (span) span.textContent = text;
  }

  function clearMsg(target) {
    var node = typeof target === "string" ? byId(target) : target;
    if (!node) return;
    node.className = "msg";
    node.innerHTML = "";
  }

  /* ---------------------------------------------------------------
     Text stats
     --------------------------------------------------------------- */
  function textStats(text) {
    if (!text) return "0 chars";
    var chars = text.length;
    var lines = text.split("\n").length;
    var bytes = new Blob([text]).size;
    return chars.toLocaleString() + " chars · " + lines.toLocaleString() + " lines · " + formatBytes(bytes);
  }

  function formatBytes(n) {
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
    return (n / (1024 * 1024)).toFixed(2) + " MB";
  }

  /* ---------------------------------------------------------------
     Generic single-input / single-output tool harness
     Expects the standard markup emitted for two-pane tool pages:
       #t-input #t-output #t-msg #t-run #t-clear #t-copy #t-download
       #t-sample  and optional [data-opt="name"] controls.
     --------------------------------------------------------------- */
  function readOptions() {
    var opts = {};
    $$("[data-opt]").forEach(function (node) {
      var key = node.getAttribute("data-opt");
      if (node.type === "checkbox") opts[key] = node.checked;
      else opts[key] = node.value;
    });
    return opts;
  }

  function simpleTool(config) {
    var input = byId("t-input");
    var output = byId("t-output");
    var msg = byId("t-msg");
    if (!input || !output) return null;

    var inMeta = byId("t-input-meta");
    var outMeta = byId("t-output-meta");
    var lastOutput = "";

    function updateInputMeta() {
      if (inMeta) inMeta.textContent = textStats(input.value);
    }

    function setOutput(text, isHtml) {
      lastOutput = isHtml ? "" : (text || "");
      if (isHtml) output.innerHTML = text || "";
      else output.textContent = text || "";
      if (outMeta) outMeta.textContent = isHtml ? "" : textStats(text || "");
    }

    function run(isAuto) {
      var value = input.value;
      if (!value.trim()) {
        setOutput("");
        if (isAuto) clearMsg(msg);
        else showMsg(msg, config.emptyMessage || "Enter some input first, or click “Load example” to see how it works.", "warn");
        return;
      }
      var result;
      try {
        result = config.transform(value, readOptions());
      } catch (err) {
        setOutput("");
        showMsg(msg, (config.errorPrefix || "Error") + ": " + (err && err.message ? err.message : String(err)), "error");
        return;
      }
      if (result === null || result === undefined) { setOutput(""); clearMsg(msg); return; }
      if (typeof result === "string") {
        setOutput(result);
        showMsg(msg, config.successMessage || "Done.", "ok");
        return;
      }
      setOutput(result.html !== undefined ? result.html : result.output, result.html !== undefined);
      if (result.copyText !== undefined) lastOutput = result.copyText;
      if (result.message) showMsg(msg, result.message, result.type || "ok");
      else if (result.message === "") clearMsg(msg);
      else showMsg(msg, config.successMessage || "Done.", "ok");
    }

    var debouncedRun = debounce(function () { run(true); }, 320);

    var runBtn = byId("t-run");
    if (runBtn) runBtn.addEventListener("click", function () { run(false); });

    input.addEventListener("input", function () {
      updateInputMeta();
      if (config.auto !== false) debouncedRun();
    });

    var clearBtn = byId("t-clear");
    if (clearBtn) clearBtn.addEventListener("click", function () {
      input.value = "";
      setOutput("");
      clearMsg(msg);
      updateInputMeta();
      input.focus();
    });

    var copyBtn = byId("t-copy");
    if (copyBtn) copyBtn.addEventListener("click", function () { copy(lastOutput || output.textContent); });

    var dlBtn = byId("t-download");
    if (dlBtn) dlBtn.addEventListener("click", function () {
      var name = typeof config.downloadName === "function" ? config.downloadName(readOptions()) : (config.downloadName || "output.txt");
      download(name, lastOutput || output.textContent, config.downloadMime);
    });

    var sampleBtn = byId("t-sample");
    if (sampleBtn && config.sample) sampleBtn.addEventListener("click", function () {
      input.value = typeof config.sample === "function" ? config.sample(readOptions()) : config.sample;
      updateInputMeta();
      run(false);
    });

    $$("[data-opt]").forEach(function (node) {
      node.addEventListener("change", function () {
        if (input.value.trim()) run(false);
      });
    });

    updateInputMeta();
    return { run: run, setOutput: setOutput, getInput: function () { return input.value; } };
  }

  /* ---------------------------------------------------------------
     Public API
     --------------------------------------------------------------- */
  window.MPT = {
    $: $, $$: $$, byId: byId, el: el,
    escapeHtml: escapeHtml,
    icon: icon,
    debounce: debounce,
    copy: copy,
    download: download,
    toast: toast,
    showMsg: showMsg,
    clearMsg: clearMsg,
    textStats: textStats,
    formatBytes: formatBytes,
    simpleTool: simpleTool,
    readOptions: readOptions,
    searchTools: searchTools,
    data: DATA
  };

  /* ---------------------------------------------------------------
     Boot
     --------------------------------------------------------------- */
  function boot() {
    initTheme();
    buildSidebar();
    initSidebarToggle();
    initSearch();
    initTopNav();
    var year = byId("year");
    if (year) year.textContent = new Date().getFullYear();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
