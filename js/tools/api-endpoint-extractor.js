/* =====================================================================
   API endpoint extractor — RAML or OpenAPI → flat endpoint table
   ===================================================================== */
(function () {
  "use strict";

  var METHODS = ["get", "post", "put", "patch", "delete", "options", "head", "trace"];

  var input = document.getElementById("ee-input");
  var msg = document.getElementById("ee-msg");
  var results = document.getElementById("ee-results");
  var meta = document.getElementById("ee-input-meta");
  if (!input) return;

  var rows = [];

  var SAMPLE = [
    "#%RAML 1.0",
    "title: Orders API",
    "version: v1",
    "baseUri: https://api.example.com/{version}",
    "/orders:",
    "  get:",
    "    displayName: List orders",
    "  post:",
    "    displayName: Create order",
    "  /{orderId}:",
    "    get:",
    "      displayName: Get order",
    "    put:",
    "      displayName: Replace order",
    "    delete:",
    "      displayName: Cancel order",
    "    /items:",
    "      get:",
    "        displayName: List order items",
    "/customers:",
    "  get:",
    "    displayName: List customers",
    "  /{customerId}:",
    "    get:",
    "      displayName: Get customer"
  ].join("\n");

  function parseAny(text) {
    var trimmed = text.trim();
    if (/^#%RAML/.test(trimmed)) {
      var body = trimmed.replace(/^#%RAML[^\n]*\n?/, "").replace(/!include\s+(\S+)/g, '"!include $1"');
      return { kind: "raml", doc: jsyaml.load(body) };
    }
    var obj;
    if (trimmed.charAt(0) === "{" || trimmed.charAt(0) === "[") {
      obj = JSON.parse(text);
    } else {
      obj = jsyaml.load(text.replace(/!include\s+(\S+)/g, '"!include $1"'));
    }
    if (!obj || typeof obj !== "object") throw new Error("the document did not parse into an object.");
    if (obj.openapi || obj.swagger || (obj.paths && typeof obj.paths === "object")) {
      return { kind: "openapi", doc: obj };
    }
    return { kind: "raml", doc: obj };
  }

  function fromOpenApi(spec) {
    var out = [];
    var paths = spec.paths || {};
    Object.keys(paths).forEach(function (p) {
      var item = paths[p];
      if (!item || typeof item !== "object") return;
      METHODS.forEach(function (m) {
        var op = item[m];
        if (!op || typeof op !== "object") return;
        out.push({
          method: m.toUpperCase(),
          path: p,
          operationId: op.operationId || "",
          summary: op.summary || op.description || ""
        });
      });
    });
    return out;
  }

  function fromRaml(doc) {
    var out = [];
    (function walk(node, base) {
      if (!node || typeof node !== "object") return;
      Object.keys(node).forEach(function (key) {
        if (key.charAt(0) !== "/") return;
        var full = (base + key).replace(/\/{2,}/g, "/");
        var body = node[key];
        if (body && typeof body === "object") {
          METHODS.forEach(function (m) {
            var op = body[m];
            if (op === undefined) return;
            if (op === null) op = {};
            if (typeof op !== "object") op = {};
            out.push({
              method: m.toUpperCase(),
              path: full,
              operationId: "",
              summary: op.displayName || op.description || ""
            });
          });
          walk(body, full);
        }
      });
    })(doc, "");
    return out;
  }

  function pillClass(method) {
    var known = ["get", "post", "put", "patch", "delete", "head", "options", "trace"];
    var m = method.toLowerCase();
    return known.indexOf(m) !== -1 ? "pill-" + m : "pill-info";
  }

  function render(list, kind) {
    var esc = MPT.escapeHtml;
    var counts = {};
    list.forEach(function (r) { counts[r.method] = (counts[r.method] || 0) + 1; });

    var statHtml = '<div class="stats">' +
      '<div class="stat"><div class="stat-label">Format</div><div class="stat-value" style="font-size:.9rem">' +
      (kind === "openapi" ? "OpenAPI" : "RAML") + "</div></div>" +
      '<div class="stat"><div class="stat-label">Endpoints</div><div class="stat-value">' + list.length + "</div></div>" +
      '<div class="stat"><div class="stat-label">Unique paths</div><div class="stat-value">' +
      Object.keys(list.reduce(function (a, r) { a[r.path] = 1; return a; }, {})).length + "</div></div>" +
      Object.keys(counts).sort().map(function (m) {
        return '<div class="stat"><div class="stat-label">' + esc(m) + '</div><div class="stat-value">' + counts[m] + "</div></div>";
      }).join("") + "</div>";

    var body = list.map(function (r) {
      return "<tr><td><span class=\"pill " + pillClass(r.method) + '">' + esc(r.method) + "</span></td>" +
        '<td><code class="inline">' + esc(r.path) + "</code></td>" +
        "<td>" + (r.operationId ? '<code class="inline">' + esc(r.operationId) + "</code>" : '<span style="color:var(--text-faint)">—</span>') + "</td>" +
        "<td>" + (esc(r.summary) || '<span style="color:var(--text-faint)">—</span>') + "</td></tr>";
    }).join("");

    results.innerHTML = statHtml +
      '<div class="table-wrap"><table class="data"><thead><tr>' +
      "<th style=\"width:90px\">Method</th><th>Path</th><th>Operation ID</th><th>Summary</th>" +
      "</tr></thead><tbody>" + body + "</tbody></table></div>";
  }

  function run() {
    MPT.clearMsg(msg);
    results.innerHTML = "";
    rows = [];

    var text = input.value;
    if (!text.trim()) {
      MPT.showMsg(msg, "Paste a RAML or OpenAPI document first, or press “Load example”.", "warn");
      return;
    }

    var parsed;
    try {
      parsed = parseAny(text);
    } catch (e) {
      MPT.showMsg(msg, "Could not parse the document: " + e.message, "error");
      return;
    }

    var list = parsed.kind === "openapi" ? fromOpenApi(parsed.doc) : fromRaml(parsed.doc);
    list.sort(function (a, b) {
      return a.path.localeCompare(b.path) || a.method.localeCompare(b.method);
    });
    rows = list;

    if (!list.length) {
      MPT.showMsg(msg, "No endpoints were found in that document. For RAML, resource keys must start with “/”; " +
                       "for OpenAPI, operations live under “paths”.", "warn");
      return;
    }

    render(list, parsed.kind);
    MPT.showMsg(msg, "Found " + list.length + " endpoint" + (list.length === 1 ? "" : "s") +
                     " in the " + (parsed.kind === "openapi" ? "OpenAPI" : "RAML") + " document.", "ok");
  }

  function toCsv(list) {
    function cell(v) { return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"'; }
    return ["Method,Path,OperationId,Summary"].concat(list.map(function (r) {
      return [cell(r.method), cell(r.path), cell(r.operationId), cell(r.summary)].join(",");
    })).join("\r\n");
  }

  function toMarkdown(list) {
    return ["| Method | Path | Operation ID | Summary |", "| --- | --- | --- | --- |"].concat(
      list.map(function (r) {
        function cell(v) { return String(v == null ? "" : v).replace(/\|/g, "\\|"); }
        return "| " + cell(r.method) + " | `" + cell(r.path) + "` | " + cell(r.operationId) + " | " + cell(r.summary) + " |";
      })).join("\n");
  }

  function updateMeta() { if (meta) meta.textContent = MPT.textStats(input.value); }

  document.getElementById("ee-run").addEventListener("click", run);
  document.getElementById("ee-clear").addEventListener("click", function () {
    input.value = "";
    results.innerHTML = "";
    rows = [];
    MPT.clearMsg(msg);
    updateMeta();
    input.focus();
  });
  document.getElementById("ee-sample").addEventListener("click", function () {
    input.value = SAMPLE;
    updateMeta();
    run();
  });
  document.getElementById("ee-csv").addEventListener("click", function () {
    if (!rows.length) { MPT.toast("Extract some endpoints first"); return; }
    MPT.download("api-endpoints.csv", toCsv(rows), "text/csv;charset=utf-8");
  });
  document.getElementById("ee-md").addEventListener("click", function () {
    if (!rows.length) { MPT.toast("Extract some endpoints first"); return; }
    MPT.copy(toMarkdown(rows));
  });
  input.addEventListener("input", updateMeta);
  updateMeta();
})();
