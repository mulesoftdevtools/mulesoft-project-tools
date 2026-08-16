/* =====================================================================
   Regular expression tester with highlighting and replacement preview
   ===================================================================== */
(function () {
  "use strict";

  var patternInput = document.getElementById("re-pattern");
  var testInput = document.getElementById("re-input");
  var msg = document.getElementById("re-msg");
  var highlightEl = document.getElementById("re-highlight");
  var matchesEl = document.getElementById("re-matches");
  var replaceInput = document.getElementById("re-replace");
  var replaceOut = document.getElementById("re-replace-output");
  if (!patternInput) return;

  var FLAG_BOXES = {
    g: document.getElementById("re-g"),
    i: document.getElementById("re-i"),
    m: document.getElementById("re-m"),
    s: document.getElementById("re-s"),
    u: document.getElementById("re-u")
  };

  var MAX_MATCHES = 2000;

  function currentFlags() {
    return Object.keys(FLAG_BOXES).filter(function (f) {
      return FLAG_BOXES[f] && FLAG_BOXES[f].checked;
    }).join("");
  }

  function buildRegex(pattern, flags) {
    try {
      return new RegExp(pattern, flags);
    } catch (e) {
      throw new Error(e.message.replace(/^Invalid regular expression:\s*/i, ""));
    }
  }

  function collectMatches(regex, text) {
    var out = [];
    var truncated = false;

    if (!regex.global) {
      var single = regex.exec(text);
      if (single) out.push(single);
      return { matches: out, truncated: false };
    }

    regex.lastIndex = 0;
    var guard = 0;
    var match;
    while ((match = regex.exec(text)) !== null) {
      out.push(match);
      if (match[0] === "") regex.lastIndex++;      // never loop forever on a zero-length match
      if (++guard >= MAX_MATCHES) { truncated = true; break; }
    }
    return { matches: out, truncated: truncated };
  }

  function renderHighlight(text, matches) {
    var esc = MPT.escapeHtml;
    if (!matches.length) {
      highlightEl.innerHTML = '<span style="color:var(--text-faint)">No matches — the text is shown unchanged.</span>' +
        "<br>" + esc(text);
      return;
    }
    var html = "";
    var cursor = 0;
    matches.forEach(function (m) {
      if (m.index < cursor) return;              // overlapping guard
      html += esc(text.slice(cursor, m.index));
      html += '<mark class="hl">' + (m[0] === "" ? "&#8203;" : esc(m[0])) + "</mark>";
      cursor = m.index + m[0].length;
    });
    html += esc(text.slice(cursor));
    highlightEl.innerHTML = html;
  }

  function renderMatches(matches, truncated) {
    var esc = MPT.escapeHtml;
    if (!matches.length) { matchesEl.innerHTML = ""; return; }

    var groupCount = matches.reduce(function (max, m) { return Math.max(max, m.length - 1); }, 0);

    var head = "<th style=\"width:52px\">#</th><th style=\"width:80px\">Index</th><th>Match</th>";
    for (var g = 1; g <= groupCount; g++) head += "<th>Group " + g + "</th>";
    var hasNamed = matches.some(function (m) { return m.groups && Object.keys(m.groups).length; });
    if (hasNamed) head += "<th>Named groups</th>";

    var body = matches.map(function (m, i) {
      var row = "<tr><td>" + (i + 1) + "</td><td>" + m.index + "</td>" +
        '<td><code class="inline">' + (m[0] === "" ? "<em>empty</em>" : esc(m[0])) + "</code></td>";
      for (var g = 1; g <= groupCount; g++) {
        var value = m[g];
        row += "<td>" + (value === undefined
          ? '<span style="color:var(--text-faint)">—</span>'
          : '<code class="inline">' + esc(value) + "</code>") + "</td>";
      }
      if (hasNamed) {
        row += "<td>" + (m.groups
          ? Object.keys(m.groups).map(function (k) {
              return "<div><strong>" + esc(k) + "</strong>: " +
                (m.groups[k] === undefined ? "—" : esc(m.groups[k])) + "</div>";
            }).join("")
          : "—") + "</td>";
      }
      return row + "</tr>";
    }).join("");

    matchesEl.innerHTML = '<p class="io-label" style="margin:18px 0 0;">Matches</p>' +
      '<div class="table-wrap"><table class="data"><thead><tr>' + head + "</tr></thead><tbody>" +
      body + "</tbody></table></div>" +
      (truncated ? '<div class="note" style="margin-top:12px;">' + MPT.icon("alert-triangle") +
        "<div>Stopped after " + MAX_MATCHES + " matches to keep the page responsive.</div></div>" : "");
  }

  function renderReplacement(regex, text) {
    if (!replaceInput.value) { replaceOut.textContent = ""; return; }
    try {
      replaceOut.textContent = text.replace(regex, replaceInput.value);
    } catch (e) {
      replaceOut.textContent = "";
    }
  }

  function run() {
    MPT.clearMsg(msg);
    var pattern = patternInput.value;
    var text = testInput.value;

    if (!pattern) {
      highlightEl.innerHTML = "";
      matchesEl.innerHTML = "";
      replaceOut.textContent = "";
      return;
    }

    var regex;
    try {
      regex = buildRegex(pattern, currentFlags());
    } catch (e) {
      highlightEl.innerHTML = "";
      matchesEl.innerHTML = "";
      replaceOut.textContent = "";
      MPT.showMsg(msg, "Invalid pattern — " + e.message, "error");
      return;
    }

    if (!text) {
      highlightEl.innerHTML = '<span style="color:var(--text-faint)">Add some test text above to see matches.</span>';
      matchesEl.innerHTML = "";
      replaceOut.textContent = "";
      MPT.showMsg(msg, "Pattern compiles. Enter a test string to run it against.", "info");
      return;
    }

    var result;
    try {
      result = collectMatches(regex, text);
    } catch (e) {
      MPT.showMsg(msg, "The expression failed while running — " + e.message, "error");
      return;
    }

    renderHighlight(text, result.matches);
    renderMatches(result.matches, result.truncated);

    var replaceRegex = buildRegex(pattern, currentFlags());
    renderReplacement(replaceRegex, text);

    var count = result.matches.length;
    if (!count) {
      MPT.showMsg(msg, "The pattern is valid but found no matches in the test string.", "warn");
    } else {
      var zeroLength = result.matches.filter(function (m) { return m[0] === ""; }).length;
      MPT.showMsg(msg, "Found " + count + " match" + (count === 1 ? "" : "es") +
        (result.truncated ? " (stopped at the " + MAX_MATCHES + " limit)" : "") +
        (zeroLength ? ". " + zeroLength + " of them are zero-length — the pattern can match an empty string." : "."),
        zeroLength ? "warn" : "ok");
    }
  }

  var debounced = MPT.debounce(run, 250);

  patternInput.addEventListener("input", debounced);
  testInput.addEventListener("input", debounced);
  replaceInput.addEventListener("input", debounced);
  Object.keys(FLAG_BOXES).forEach(function (f) {
    if (FLAG_BOXES[f]) FLAG_BOXES[f].addEventListener("change", run);
  });

  document.getElementById("re-clear").addEventListener("click", function () {
    patternInput.value = "";
    testInput.value = "";
    replaceInput.value = "";
    highlightEl.innerHTML = "";
    matchesEl.innerHTML = "";
    replaceOut.textContent = "";
    MPT.clearMsg(msg);
    patternInput.focus();
  });

  document.getElementById("re-sample").addEventListener("click", function () {
    patternInput.value = "(?<user>[\\w.+-]+)@(?<domain>[\\w-]+\\.[\\w.-]+)";
    testInput.value = "Contact ada@example.com or grace.hopper@navy.mil for access.\n" +
      "Escalations go to ops-team@example.co.uk (24/7).\n" +
      "Invalid: not-an-email@, @nodomain.com";
    replaceInput.value = "$<user> [at] $<domain>";
    FLAG_BOXES.g.checked = true;
    FLAG_BOXES.i.checked = true;
    run();
  });

  document.getElementById("re-copy-replace").addEventListener("click", function () {
    MPT.copy(replaceOut.textContent);
  });
})();
