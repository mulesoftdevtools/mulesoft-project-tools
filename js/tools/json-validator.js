/* =====================================================================
   JSON validator with precise error location and likely-cause hints
   ===================================================================== */
(function () {
  "use strict";

  var SAMPLE = [
    "{",
    '  "orderId": "A-1001",',
    '  "customer": {',
    '    "name": "Ada Lovelace",',
    "    'email': 'ada@example.com'",
    "  },",
    '  "total": 288.98,',
    "}"
  ].join("\n");

  /* Extract a character offset from the browser's JSON.parse error message. */
  function errorOffset(err, text) {
    var m = /at position (\d+)/i.exec(err.message);
    if (m) return Math.min(parseInt(m[1], 10), text.length);
    m = /line (\d+) column (\d+)/i.exec(err.message);
    if (m) {
      var line = parseInt(m[1], 10), col = parseInt(m[2], 10);
      var lines = text.split("\n");
      var offset = 0;
      for (var i = 0; i < line - 1 && i < lines.length; i++) offset += lines[i].length + 1;
      return Math.min(offset + col - 1, text.length);
    }
    return -1;
  }

  function lineCol(text, offset) {
    var upto = text.slice(0, offset);
    var lines = upto.split("\n");
    return { line: lines.length, column: lines[lines.length - 1].length + 1 };
  }

  /* Guess the underlying mistake by inspecting the text around the failure. */
  function diagnose(text, offset) {
    var before = text.slice(Math.max(0, offset - 200), offset);
    var after = text.slice(offset, offset + 60);
    var here = text.charAt(offset) || "";

    if (/,\s*$/.test(before) && /^[\s]*[}\]]/.test(here + after)) {
      return "There is a trailing comma before the closing bracket. JSON does not allow a comma after the last item.";
    }
    if (here === "'" || /'[^']*'\s*:/.test(after) || /'\s*$/.test(before)) {
      return "Single quotes were used. JSON strings and keys must use double quotes.";
    }
    if (/[{,]\s*[A-Za-z_$][\w$]*\s*:/.test(before.slice(-40) + here + after.slice(0, 20))) {
      return "An object key is not quoted. Every JSON key must be wrapped in double quotes.";
    }
    if (/\/\/|\/\*/.test(before.slice(-20) + here + after.slice(0, 10))) {
      return "JSON does not support comments — remove the // or /* */ block.";
    }
    if (/\b(NaN|Infinity|undefined)\b/.test(here + after.slice(0, 12))) {
      return "NaN, Infinity and undefined are not valid JSON values. Use null or a number.";
    }
    if (here === "" ) {
      return "The document ended unexpectedly — a bracket, brace or quote was probably left unclosed.";
    }
    if (/^\s*"/.test(after) && /"\s*$/.test(before)) {
      return "Two values appear next to each other. A comma is probably missing.";
    }
    return "";
  }

  function snippet(text, offset) {
    var lines = text.split("\n");
    var pos = lineCol(text, offset);
    var start = Math.max(0, pos.line - 3);
    var end = Math.min(lines.length, pos.line + 2);
    var out = [];
    for (var i = start; i < end; i++) {
      var isTarget = (i + 1) === pos.line;
      var num = String(i + 1).padStart(String(end).length, " ");
      out.push((isTarget ? "→ " : "  ") + num + " | " + lines[i]);
      if (isTarget) {
        out.push("  " + " ".repeat(num.length) + " | " + " ".repeat(Math.max(0, pos.column - 1)) + "^");
      }
    }
    return out.join("\n");
  }

  function analyse(value) {
    var objects = 0, arrays = 0, strings = 0, numbers = 0, booleans = 0, nulls = 0, keys = 0, depth = 0;
    (function walk(node, d) {
      if (d > depth) depth = d;
      if (Array.isArray(node)) { arrays++; node.forEach(function (c) { walk(c, d + 1); }); }
      else if (node === null) nulls++;
      else if (typeof node === "object") {
        objects++;
        Object.keys(node).forEach(function (k) { keys++; walk(node[k], d + 1); });
      }
      else if (typeof node === "string") strings++;
      else if (typeof node === "number") numbers++;
      else if (typeof node === "boolean") booleans++;
    })(value, 1);
    return { objects: objects, arrays: arrays, strings: strings, numbers: numbers,
             booleans: booleans, nulls: nulls, keys: keys, depth: depth };
  }

  function rootType(value) {
    if (Array.isArray(value)) return "array";
    if (value === null) return "null";
    return typeof value;
  }

  MPT.simpleTool({
    transform: function (text) {
      var esc = MPT.escapeHtml;
      var parsed;
      try {
        parsed = JSON.parse(text);
      } catch (err) {
        var offset = errorOffset(err, text);
        var html = '<div class="stats"><div class="stat" style="border-color:var(--danger)">' +
          '<div class="stat-label">Result</div><div class="stat-value" style="color:var(--danger);font-size:.95rem">Invalid</div></div>';
        if (offset >= 0) {
          var pos = lineCol(text, offset);
          html += '<div class="stat"><div class="stat-label">Line</div><div class="stat-value">' + pos.line + "</div></div>" +
                  '<div class="stat"><div class="stat-label">Column</div><div class="stat-value">' + pos.column + "</div></div>" +
                  '<div class="stat"><div class="stat-label">Offset</div><div class="stat-value">' + offset + "</div></div>";
        }
        html += "</div>";

        html += '<div class="table-wrap"><table class="data"><tbody>' +
          '<tr><th class="row-key">Parser message</th><td><code class="inline">' + esc(err.message) + "</code></td></tr>";
        var hint = offset >= 0 ? diagnose(text, offset) : "";
        if (hint) html += '<tr><th class="row-key">Likely cause</th><td>' + esc(hint) + "</td></tr>";
        html += "</tbody></table></div>";

        if (offset >= 0) {
          html += '<p class="io-label" style="margin:16px 0 6px;">Where it failed</p>' +
                  '<pre class="code-out code-xs" style="margin:0;">' + esc(snippet(text, offset)) + "</pre>";
        }

        return {
          html: html,
          message: "Invalid JSON" + (offset >= 0 ? " at line " + lineCol(text, offset).line +
                   ", column " + lineCol(text, offset).column : "") + ".",
          type: "error"
        };
      }

      var s = analyse(parsed);
      var html2 = '<div class="stats">' +
        '<div class="stat" style="border-color:var(--success)"><div class="stat-label">Result</div>' +
        '<div class="stat-value" style="color:var(--success);font-size:.95rem">Valid</div></div>' +
        '<div class="stat"><div class="stat-label">Root type</div><div class="stat-value" style="font-size:.95rem">' + rootType(parsed) + "</div></div>" +
        '<div class="stat"><div class="stat-label">Objects</div><div class="stat-value">' + s.objects + "</div></div>" +
        '<div class="stat"><div class="stat-label">Arrays</div><div class="stat-value">' + s.arrays + "</div></div>" +
        '<div class="stat"><div class="stat-label">Keys</div><div class="stat-value">' + s.keys + "</div></div>" +
        '<div class="stat"><div class="stat-label">Max depth</div><div class="stat-value">' + s.depth + "</div></div>" +
        "</div>";

      html2 += '<div class="table-wrap"><table class="data"><thead><tr><th>Value type</th><th>Count</th></tr></thead><tbody>' +
        [["Strings", s.strings], ["Numbers", s.numbers], ["Booleans", s.booleans], ["Nulls", s.nulls]]
          .map(function (r) { return "<tr><td>" + r[0] + "</td><td>" + r[1] + "</td></tr>"; }).join("") +
        "</tbody></table></div>";

      if (Array.isArray(parsed)) {
        html2 += '<div class="note" style="margin-top:14px;">' + MPT.icon("info") +
                 "<div>The root is an array of " + parsed.length + " item(s).</div></div>";
      }

      return { html: html2, message: "Valid JSON.", type: "ok" };
    },
    sample: SAMPLE,
    errorPrefix: "Could not check the document",
    emptyMessage: "Paste some JSON to validate, or press “Load example” to see an invalid document diagnosed."
  });
})();
