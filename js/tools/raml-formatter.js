/* =====================================================================
   RAML formatter + structure checker
   ===================================================================== */
(function () {
  "use strict";

  var METHODS = ["get", "post", "put", "delete", "patch", "options", "head"];

  var SAMPLE = [
    "#%RAML 1.0",
    "title:    Inventory API",
    "version: v2",
    "/items:",
    "        get:",
    "          displayName: List items",
    "          responses:",
    "            200:",
    "              body:",
    "                application/json:",
    "        post:",
    "          displayName: Add item",
    "        /{itemId}:",
    "          get:",
    "            displayName: Get item"
  ].join("\n");

  var reportPanel = document.getElementById("rf-report-panel");
  var reportEl = document.getElementById("rf-report");

  function check(header, doc) {
    var issues = [];
    function add(level, message) { issues.push({ level: level, message: message }); }

    if (!/^#%RAML\s+1\.0\s*$/.test((header || "").trim())) {
      if (/^#%RAML/.test((header || "").trim())) {
        add("warn", "The RAML header is “" + header.trim() + "”. RAML 1.0 documents should start with exactly “#%RAML 1.0”.");
      } else {
        add("error", "Missing the “#%RAML 1.0” header on line 1. Parsers reject documents without it.");
      }
    }

    if (!doc || typeof doc !== "object") {
      add("error", "The document body did not parse into an object.");
      return issues;
    }

    if (!doc.title) add("error", "Missing the required “title” property.");
    if (!doc.version) add("warn", "No “version” declared.");
    if (!doc.baseUri) add("warn", "No “baseUri” declared — consumers will not know where the API lives.");
    if (!doc.mediaType) add("warn", "No default “mediaType” declared; each body must then name its media type explicitly.");

    var resources = 0, operations = 0;

    (function walk(node, base) {
      Object.keys(node || {}).forEach(function (key) {
        if (key.charAt(0) !== "/") return;
        resources++;
        var full = (base + key).replace(/\/{2,}/g, "/");
        var body = node[key];
        if (body === null || body === undefined) {
          add("warn", "Resource " + full + " is empty.");
          return;
        }
        if (typeof body !== "object") {
          add("error", "Resource " + full + " should be a mapping, not a scalar value.");
          return;
        }

        var methodCount = 0;
        METHODS.forEach(function (m) {
          if (body[m] === undefined) return;
          methodCount++;
          operations++;
          var op = body[m] || {};
          if (typeof op !== "object") return;
          if (!op.responses) {
            add("warn", full + " → " + m.toUpperCase() + " declares no “responses”.");
          }
          if (!op.displayName && !op.description) {
            add("info", full + " → " + m.toUpperCase() + " has no displayName or description.");
          }
        });

        (full.match(/{([^}]+)}/g) || []).forEach(function (token) {
          var name = token.slice(1, -1);
          var declaredHere = body.uriParameters && Object.prototype.hasOwnProperty.call(body.uriParameters, name);
          if (key.indexOf("{" + name + "}") !== -1 && !declaredHere) {
            add("info", "URI parameter {" + name + "} on " + full + " has no uriParameters declaration.");
          }
        });

        var hasChildren = Object.keys(body).some(function (k) { return k.charAt(0) === "/"; });
        if (!methodCount && !hasChildren) {
          add("warn", "Resource " + full + " defines no methods and no sub-resources.");
        }
        walk(body, full);
      });
    })(doc, "");

    if (!resources) add("error", "No resources found. RAML resource keys must start with “/”.");
    issues.__stats = { resources: resources, operations: operations };
    return issues;
  }

  function renderReport(issues) {
    if (!reportPanel || !reportEl) return;
    var stats = issues.__stats || { resources: 0, operations: 0 };
    var errors = issues.filter(function (i) { return i.level === "error"; });
    var warns = issues.filter(function (i) { return i.level === "warn"; });
    var infos = issues.filter(function (i) { return i.level === "info"; });
    var esc = MPT.escapeHtml;

    var html = '<div class="stats">' +
      '<div class="stat"><div class="stat-label">Resources</div><div class="stat-value">' + stats.resources + "</div></div>" +
      '<div class="stat"><div class="stat-label">Methods</div><div class="stat-value">' + stats.operations + "</div></div>" +
      '<div class="stat"><div class="stat-label">Errors</div><div class="stat-value" style="color:var(--danger)">' + errors.length + "</div></div>" +
      '<div class="stat"><div class="stat-label">Warnings</div><div class="stat-value" style="color:var(--warning)">' + warns.length + "</div></div>" +
      "</div>";

    var ordered = errors.concat(warns).concat(infos);
    if (ordered.length) {
      html += '<div class="table-wrap"><table class="data"><thead><tr><th style="width:110px">Level</th><th>Finding</th></tr></thead><tbody>' +
        ordered.map(function (i) {
          var cls = i.level === "error" ? "pill-error" : (i.level === "warn" ? "pill-warning" : "pill-info");
          return "<tr><td><span class=\"pill " + cls + "\">" + i.level.toUpperCase() + "</span></td><td>" + esc(i.message) + "</td></tr>";
        }).join("") + "</tbody></table></div>";
    } else {
      html += '<p style="color:var(--success); margin:14px 0 0;">No structural problems found.</p>';
    }

    reportEl.innerHTML = html;
    reportPanel.style.display = "";
  }

  MPT.simpleTool({
    transform: function (text) {
      var lines = String(text).split("\n");
      var hasHeader = /^#%RAML/.test(lines[0] || "");
      var header = hasHeader ? lines[0] : "";
      var body = hasHeader ? lines.slice(1).join("\n") : text;

      var doc;
      try {
        doc = jsyaml.load(body.replace(/!include\s+(\S+)/g, '"!include $1"'));
      } catch (e) {
        if (reportPanel) reportPanel.style.display = "none";
        throw new Error("the RAML body is not valid YAML — " + e.message);
      }

      var formatted = "#%RAML 1.0\n" + jsyaml.dump(doc, { indent: 2, lineWidth: 120, noRefs: true });
      var issues = check(header, doc);
      renderReport(issues);

      var errors = issues.filter(function (i) { return i.level === "error"; }).length;
      var warns = issues.filter(function (i) { return i.level === "warn"; }).length;
      var message = "Formatted. " + (errors ? errors + " error(s) and " : "") +
        warns + " warning(s) — see the structure report below.";
      return { output: formatted, message: message, type: errors ? "error" : (warns ? "warn" : "ok") };
    },
    sample: SAMPLE,
    errorPrefix: "Could not format",
    downloadName: "api.raml",
    emptyMessage: "Paste a RAML document, or press “Load example”."
  });
})();
