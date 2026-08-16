/* =====================================================================
   Line-based text diff (common prefix/suffix trim + LCS on the middle)
   ===================================================================== */
(function () {
  "use strict";

  var left = document.getElementById("diff-left");
  var right = document.getElementById("diff-right");
  var msg = document.getElementById("diff-msg");
  var statsEl = document.getElementById("diff-stats");
  var outputEl = document.getElementById("diff-output");
  var leftMeta = document.getElementById("diff-left-meta");
  var rightMeta = document.getElementById("diff-right-meta");
  if (!left || !right) return;

  var ignoreWs = document.getElementById("diff-ignore-ws");
  var ignoreCase = document.getElementById("diff-ignore-case");
  var onlyChanges = document.getElementById("diff-only-changes");

  var MAX_LCS_CELLS = 4000000;   // ~16 MB of Int32 — beyond this we degrade gracefully

  function normalise(line) {
    var out = line;
    if (ignoreWs && ignoreWs.checked) out = out.replace(/\s+/g, " ").trim();
    if (ignoreCase && ignoreCase.checked) out = out.toLowerCase();
    return out;
  }

  function lcsDiff(a, b, keyA, keyB) {
    var n = a.length, m = b.length;
    var table = new Int32Array((n + 1) * (m + 1));
    var width = m + 1;

    for (var i = n - 1; i >= 0; i--) {
      for (var j = m - 1; j >= 0; j--) {
        table[i * width + j] = (keyA[i] === keyB[j])
          ? table[(i + 1) * width + (j + 1)] + 1
          : Math.max(table[(i + 1) * width + j], table[i * width + (j + 1)]);
      }
    }

    var result = [];
    var x = 0, y = 0;
    while (x < n && y < m) {
      if (keyA[x] === keyB[y]) {
        result.push({ type: "same", text: a[x] });
        x++; y++;
      } else if (table[(x + 1) * width + y] >= table[x * width + (y + 1)]) {
        result.push({ type: "del", text: a[x] });
        x++;
      } else {
        result.push({ type: "add", text: b[y] });
        y++;
      }
    }
    while (x < n) { result.push({ type: "del", text: a[x] }); x++; }
    while (y < m) { result.push({ type: "add", text: b[y] }); y++; }
    return result;
  }

  function simpleDiff(a, b, keyA, keyB) {
    // Fallback for very large inputs: positional comparison, no move detection.
    var result = [];
    var max = Math.max(a.length, b.length);
    for (var i = 0; i < max; i++) {
      if (i < a.length && i < b.length) {
        if (keyA[i] === keyB[i]) result.push({ type: "same", text: a[i] });
        else {
          result.push({ type: "del", text: a[i] });
          result.push({ type: "add", text: b[i] });
        }
      } else if (i < a.length) result.push({ type: "del", text: a[i] });
      else result.push({ type: "add", text: b[i] });
    }
    return result;
  }

  function diff(aText, bText) {
    var a = aText.split("\n");
    var b = bText.split("\n");
    var keyA = a.map(normalise);
    var keyB = b.map(normalise);

    // trim identical prefix
    var prefix = [];
    while (a.length && b.length && keyA[0] === keyB[0]) {
      prefix.push({ type: "same", text: a[0] });
      a.shift(); b.shift(); keyA.shift(); keyB.shift();
    }
    // trim identical suffix
    var suffix = [];
    while (a.length && b.length && keyA[keyA.length - 1] === keyB[keyB.length - 1]) {
      suffix.unshift({ type: "same", text: a[a.length - 1] });
      a.pop(); b.pop(); keyA.pop(); keyB.pop();
    }

    var middle;
    var degraded = false;
    if ((a.length + 1) * (b.length + 1) > MAX_LCS_CELLS) {
      middle = simpleDiff(a, b, keyA, keyB);
      degraded = true;
    } else {
      middle = lcsDiff(a, b, keyA, keyB);
    }

    return { rows: prefix.concat(middle, suffix), degraded: degraded };
  }

  function render(rows) {
    var esc = MPT.escapeHtml;
    var showOnlyChanges = onlyChanges && onlyChanges.checked;
    var leftNo = 0, rightNo = 0;
    var html = [];
    var skipped = 0;

    rows.forEach(function (row) {
      if (row.type === "same") { leftNo++; rightNo++; }
      else if (row.type === "del") leftNo++;
      else rightNo++;

      if (showOnlyChanges && row.type === "same") { skipped++; return; }

      var sign = row.type === "add" ? "+" : (row.type === "del" ? "-" : " ");
      var cls = row.type === "add" ? "diff-add" : (row.type === "del" ? "diff-del" : "diff-same");
      var lineNo = row.type === "add"
        ? "     " + String(rightNo).padStart(4, " ")
        : String(leftNo).padStart(4, " ") + "     ";
      html.push('<span class="diff-line ' + cls + '">' +
        '<span style="opacity:.45">' + esc(lineNo) + "</span> " + esc(sign) + " " +
        (row.text === "" ? "&nbsp;" : esc(row.text)) + "</span>");
    });

    if (!html.length) {
      outputEl.innerHTML = '<span style="color:var(--text-faint)">' +
        (skipped ? "No differences to show — the two texts are identical." : "Nothing to compare.") + "</span>";
      return;
    }
    outputEl.innerHTML = html.join("");
  }

  function run() {
    MPT.clearMsg(msg);
    statsEl.innerHTML = "";
    outputEl.innerHTML = "";

    var a = left.value;
    var b = right.value;

    if (!a && !b) {
      MPT.showMsg(msg, "Paste text into both boxes to compare them, or press “Load example”.", "warn");
      return;
    }

    var result = diff(a, b);
    var rows = result.rows;

    var added = rows.filter(function (r) { return r.type === "add"; }).length;
    var removed = rows.filter(function (r) { return r.type === "del"; }).length;
    var same = rows.filter(function (r) { return r.type === "same"; }).length;

    statsEl.innerHTML = '<div class="stats">' +
      '<div class="stat"><div class="stat-label">Added</div><div class="stat-value" style="color:var(--success)">+' + added + "</div></div>" +
      '<div class="stat"><div class="stat-label">Removed</div><div class="stat-value" style="color:var(--danger)">-' + removed + "</div></div>" +
      '<div class="stat"><div class="stat-label">Unchanged</div><div class="stat-value">' + same + "</div></div>" +
      '<div class="stat"><div class="stat-label">Original lines</div><div class="stat-value">' + a.split("\n").length + "</div></div>" +
      '<div class="stat"><div class="stat-label">Changed lines</div><div class="stat-value">' + b.split("\n").length + "</div></div>" +
      "</div>";

    render(rows);

    if (!added && !removed) {
      MPT.showMsg(msg, "The two texts are identical" +
        ((ignoreWs && ignoreWs.checked) || (ignoreCase && ignoreCase.checked)
          ? " once the ignore options are applied." : "."), "ok");
    } else if (result.degraded) {
      MPT.showMsg(msg, added + " line(s) added, " + removed + " removed. Note: the inputs were too large for a " +
                       "full longest-common-subsequence diff, so lines were compared position by position.", "warn");
    } else {
      MPT.showMsg(msg, added + " line(s) added, " + removed + " line(s) removed.", "ok");
    }
  }

  function updateMeta() {
    if (leftMeta) leftMeta.textContent = MPT.textStats(left.value);
    if (rightMeta) rightMeta.textContent = MPT.textStats(right.value);
  }

  var debounced = MPT.debounce(function () {
    if (left.value || right.value) run();
  }, 400);

  left.addEventListener("input", function () { updateMeta(); debounced(); });
  right.addEventListener("input", function () { updateMeta(); debounced(); });

  [ignoreWs, ignoreCase, onlyChanges].forEach(function (box) {
    if (box) box.addEventListener("change", function () { if (left.value || right.value) run(); });
  });

  document.getElementById("diff-run").addEventListener("click", run);

  document.getElementById("diff-swap").addEventListener("click", function () {
    var tmp = left.value;
    left.value = right.value;
    right.value = tmp;
    updateMeta();
    run();
  });

  document.getElementById("diff-clear").addEventListener("click", function () {
    left.value = "";
    right.value = "";
    statsEl.innerHTML = "";
    outputEl.innerHTML = "";
    MPT.clearMsg(msg);
    updateMeta();
    left.focus();
  });

  document.getElementById("diff-sample").addEventListener("click", function () {
    left.value = [
      "server:",
      "  host: 0.0.0.0",
      "  port: 8081",
      "  timeout: 30000",
      "database:",
      "  url: jdbc:mysql://localhost:3306/orders",
      "  poolSize: 10",
      "logging:",
      "  level: INFO"
    ].join("\n");
    right.value = [
      "server:",
      "  host: 0.0.0.0",
      "  port: 8443",
      "  timeout: 30000",
      "  tls: true",
      "database:",
      "  url: jdbc:mysql://db.internal:3306/orders",
      "  poolSize: 25",
      "logging:",
      "  level: DEBUG"
    ].join("\n");
    updateMeta();
    run();
  });

  updateMeta();
})();
