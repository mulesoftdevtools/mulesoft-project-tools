/* =====================================================================
   JSON Diff — structural (semantic) comparison of two JSON documents.
   Key order and formatting are ignored; reports added, removed and
   changed values by JSONPath. Optional: ignore array order.
   ===================================================================== */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var left = $("jd-left"), right = $("jd-right"), out = $("jd-output"), msg = $("jd-msg"), stats = $("jd-stats");
  var ignoreOrder = $("jd-ignore-order"), ignoreCase = $("jd-ignore-case");
  if (!left || !out) return;

  function typeOf(v) { return v === null ? "null" : Array.isArray(v) ? "array" : typeof v; }

  function pathKey(base, key) {
    if (typeof key === "number") return base + "[" + key + "]";
    return /^[A-Za-z_$][\w$]*$/.test(key) ? base + "." + key : base + "['" + String(key).replace(/'/g, "\\'") + "']";
  }

  function canonical(v) {
    if (Array.isArray(v)) {
      var arr = v.map(canonical);
      return ignoreOrder.checked ? "[" + arr.sort().join(",") + "]" : "[" + arr.join(",") + "]";
    }
    if (v && typeof v === "object") return "{" + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ":" + canonical(v[k]); }).join(",") + "}";
    if (typeof v === "string" && ignoreCase.checked) return JSON.stringify(v.toLowerCase());
    return JSON.stringify(v);
  }

  function diff(a, b, path, acc) {
    var ta = typeOf(a), tb = typeOf(b);
    if (ta !== tb) { acc.push({ kind: "type", path: path, a: a, b: b }); return; }
    if (ta === "object") {
      Object.keys(a).forEach(function (k) {
        if (!Object.prototype.hasOwnProperty.call(b, k)) acc.push({ kind: "removed", path: pathKey(path, k), a: a[k] });
        else diff(a[k], b[k], pathKey(path, k), acc);
      });
      Object.keys(b).forEach(function (k) {
        if (!Object.prototype.hasOwnProperty.call(a, k)) acc.push({ kind: "added", path: pathKey(path, k), b: b[k] });
      });
      return;
    }
    if (ta === "array") {
      if (ignoreOrder.checked) {
        var pool = b.map(function (v, i) { return { c: canonical(v), v: v, i: i, used: false }; });
        var unmatched = [];
        a.forEach(function (v, i) {
          var c = canonical(v);
          var hit = pool.filter(function (p) { return !p.used && p.c === c; })[0];
          if (hit) hit.used = true; else unmatched.push({ v: v, i: i });
        });
        unmatched.forEach(function (u) { acc.push({ kind: "removed", path: pathKey(path, u.i), a: u.v }); });
        pool.filter(function (p) { return !p.used; }).forEach(function (p) { acc.push({ kind: "added", path: pathKey(path, p.i), b: p.v }); });
        return;
      }
      var n = Math.max(a.length, b.length);
      for (var i = 0; i < n; i++) {
        if (i >= a.length) acc.push({ kind: "added", path: pathKey(path, i), b: b[i] });
        else if (i >= b.length) acc.push({ kind: "removed", path: pathKey(path, i), a: a[i] });
        else diff(a[i], b[i], pathKey(path, i), acc);
      }
      return;
    }
    var same = ta === "string" && ignoreCase.checked ? a.toLowerCase() === b.toLowerCase() : a === b;
    if (!same) acc.push({ kind: "changed", path: path, a: a, b: b });
  }

  function show(v) {
    if (v === undefined) return "";
    var s = JSON.stringify(v);
    return s.length > 300 ? s.slice(0, 300) + "…" : s;
  }

  var LABEL = { added: ["Added", "pill-post"], removed: ["Removed", "pill-delete"], changed: ["Changed", "pill-put"], type: ["Type changed", "pill-patch"] };
  var lastReport = "";

  function parse(text, side) {
    try { return JSON.parse(text); }
    catch (e) { throw new Error("the " + side + " document is not valid JSON (" + e.message + ")."); }
  }

  function run(manual) {
    if (!left.value.trim() || !right.value.trim()) {
      out.innerHTML = ""; stats.innerHTML = "";
      if (manual) MPT.showMsg(msg, "Paste a JSON document on both sides, or press “Load example”.", "warn"); else MPT.clearMsg(msg);
      return;
    }
    var a, b;
    try { a = parse(left.value, "original"); b = parse(right.value, "changed"); }
    catch (e) { out.innerHTML = ""; stats.innerHTML = ""; MPT.showMsg(msg, "Could not compare: " + e.message, "error"); return; }

    var acc = [];
    diff(a, b, "$", acc);
    var counts = { added: 0, removed: 0, changed: 0, type: 0 };
    acc.forEach(function (d) { counts[d.kind]++; });
    stats.innerHTML = '<div class="stats">' + ["added", "removed", "changed", "type"].map(function (k) {
      return '<div class="stat"><div class="stat-label">' + LABEL[k][0] + '</div><div class="stat-value">' + counts[k] + "</div></div>";
    }).join("") + "</div>";

    if (!acc.length) {
      out.innerHTML = '<p class="io-meta">The documents are equivalent' + (ignoreOrder.checked ? " (ignoring array order)" : "") + " — only formatting or key order differs, if anything.</p>";
      lastReport = "No differences.";
      MPT.showMsg(msg, "No differences found.", "ok");
      return;
    }
    var h = '<div class="table-wrap" style="margin-top:0"><table class="data"><thead><tr><th>Change</th><th>Path</th><th>Original</th><th>Changed</th></tr></thead><tbody>';
    acc.forEach(function (d) {
      h += '<tr><td><span class="pill ' + LABEL[d.kind][1] + '">' + LABEL[d.kind][0] + '</span></td><td style="font-family:var(--mono);font-size:.8rem">' +
        MPT.escapeHtml(d.path) + '</td><td style="font-family:var(--mono);font-size:.8rem;word-break:break-word">' + MPT.escapeHtml(show(d.a)) +
        '</td><td style="font-family:var(--mono);font-size:.8rem;word-break:break-word">' + MPT.escapeHtml(show(d.b)) + "</td></tr>";
    });
    out.innerHTML = h + "</tbody></table></div>";
    lastReport = acc.map(function (d) {
      return LABEL[d.kind][0].toUpperCase() + "\t" + d.path + "\t" + show(d.a) + "\t" + show(d.b);
    }).join("\n");
    MPT.showMsg(msg, acc.length + " difference(s) found.", "warn");
  }

  var debounced = MPT.debounce(function () { run(false); }, 350);
  left.addEventListener("input", function () { $("jd-left-meta").textContent = MPT.textStats(left.value); debounced(); });
  right.addEventListener("input", function () { $("jd-right-meta").textContent = MPT.textStats(right.value); debounced(); });
  ignoreOrder.addEventListener("change", function () { run(false); });
  ignoreCase.addEventListener("change", function () { run(false); });
  $("jd-run").addEventListener("click", function () { run(true); });
  $("jd-copy").addEventListener("click", function () { MPT.copy(lastReport); });
  $("jd-swap").addEventListener("click", function () { var t = left.value; left.value = right.value; right.value = t; run(false); });
  $("jd-clear").addEventListener("click", function () { left.value = ""; right.value = ""; run(false); left.focus(); });
  $("jd-sample").addEventListener("click", function () {
    left.value = JSON.stringify({ orderId: "ORD-10023", status: "OPEN", total: 129.95, customer: { name: "Ada Lovelace", email: "ada@example.com" },
      items: [{ sku: "MULE-001", qty: 2 }, { sku: "MULE-002", qty: 1 }], tags: ["priority", "online"] }, null, 2);
    right.value = JSON.stringify({ status: "SHIPPED", orderId: "ORD-10023", total: "129.95", customer: { name: "Ada Lovelace", phone: "+44 20 7946 0000" },
      items: [{ sku: "MULE-001", qty: 3 }, { sku: "MULE-002", qty: 1 }, { sku: "MULE-003", qty: 1 }], tags: ["online", "priority"] }, null, 2);
    $("jd-left-meta").textContent = MPT.textStats(left.value);
    $("jd-right-meta").textContent = MPT.textStats(right.value);
    run(true);
  });
})();
