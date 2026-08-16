/* =====================================================================
   HTML entity escaper / unescaper
   ===================================================================== */
(function () {
  "use strict";

  var NAMED = {
    amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", copy: "©",
    reg: "®", trade: "™", hellip: "…", mdash: "—", ndash: "–",
    lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", eacute: "é",
    egrave: "è", agrave: "à", uuml: "ü", ouml: "ö", auml: "ä",
    szlig: "ß", euro: "€", pound: "£", yen: "¥", cent: "¢",
    deg: "°", plusmn: "±", times: "×", divide: "÷", middot: "·",
    bull: "•", dagger: "†", sect: "§", para: "¶", laquo: "«",
    raquo: "»", larr: "←", rarr: "→", harr: "↔", infin: "∞"
  };

  function escapeHtml(text, allNonAscii) {
    var out = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    if (allNonAscii) {
      out = out.replace(/[\u0080-\uFFFF]/g, function (c, offset, whole) {
        var code = whole.codePointAt(offset);
        // Skip the low half of a surrogate pair; the high half already emitted the full code point.
        if (c.charCodeAt(0) >= 0xDC00 && c.charCodeAt(0) <= 0xDFFF) return "";
        return "&#" + code + ";";
      });
    }
    return out;
  }

  function unescapeHtml(text) {
    return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, function (match, body) {
      if (body.charAt(0) === "#") {
        var code;
        if (body.charAt(1) === "x" || body.charAt(1) === "X") code = parseInt(body.slice(2), 16);
        else code = parseInt(body.slice(1), 10);
        if (!isFinite(code) || code < 0 || code > 0x10ffff) return match;
        try {
          return String.fromCodePoint(code);
        } catch (e) {
          return match;
        }
      }
      var lower = body.toLowerCase();
      return Object.prototype.hasOwnProperty.call(NAMED, lower) ? NAMED[lower] : match;
    });
  }

  var tool = MPT.simpleTool({
    transform: function (text, opts) {
      if (opts.mode === "unescape") {
        var decoded = unescapeHtml(text);
        var remaining = (decoded.match(/&[a-zA-Z][a-zA-Z0-9]*;/g) || []);
        if (remaining.length) {
          return {
            output: decoded,
            message: "Decoded. " + remaining.length + " entity reference(s) were left as-is because they are " +
                     "not in this tool's named-entity table: " + remaining.slice(0, 5).join(", "),
            type: "warn"
          };
        }
        return { output: decoded, message: "Decoded HTML entities back to plain text.", type: "ok" };
      }

      var escaped = escapeHtml(text, !!opts.nonascii);
      var count = (escaped.match(/&(#\d+|[a-z]+);/g) || []).length;
      return {
        output: escaped,
        message: "Escaped " + count + " character(s) into HTML entities.",
        type: "ok"
      };
    },
    sample: "<div class=\"card\" data-id='7'>Tom & Jerry — “classic” cartoons · café</div>",
    errorPrefix: "Could not convert",
    emptyMessage: "Type or paste some text, or press “Load example”."
  });

  var swap = document.getElementById("t-swap");
  if (swap && tool) {
    swap.addEventListener("click", function () {
      var input = document.getElementById("t-input");
      var output = document.getElementById("t-output");
      var mode = document.getElementById("opt-mode");
      if (!input || !output || !mode) return;
      var current = output.textContent;
      if (!current) { MPT.toast("Nothing to swap yet"); return; }
      input.value = current;
      mode.value = mode.value === "escape" ? "unescape" : "escape";
      tool.run(false);
    });
  }
})();
