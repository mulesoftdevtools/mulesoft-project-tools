/* =====================================================================
   JSONPath tester
   A self-contained JSONPath evaluator (no eval): $, .key, ['key'], [n],
   [-n], [a:b:step], [*], .., unions [0,2] / ['a','b'] and filters
   [?(@.price < 10 && @.tags)] including =~ /regex/. Also suggests the
   equivalent DataWeave selector.
   ===================================================================== */
(function () {
  "use strict";

  /* ---------------- path tokenizer ---------------- */
  function parsePath(src) {
    var s = src.trim(), i = 0, steps = [];
    if (s.charAt(0) === "$") i = 1;
    else if (s.charAt(0) === "@") i = 1;
    else s = "$." + s, i = 1;            // allow "store.book" shorthand

    function readName() {
      var m = /^[^.\[\]\s()]+/.exec(s.slice(i));
      if (!m) throw new Error("expected a property name at position " + (i + 1) + ".");
      i += m[0].length;
      return m[0];
    }

    while (i < s.length) {
      var c = s.charAt(i);
      if (c === ".") {
        var deep = s.charAt(i + 1) === ".";
        i += deep ? 2 : 1;
        if (s.charAt(i) === "[") { var b = readBracket(); b.deep = deep; steps.push(b); continue; }
        if (s.charAt(i) === "*") { i++; steps.push({ kind: "wild", deep: deep }); continue; }
        steps.push({ kind: "names", names: [readName()], deep: deep });
      } else if (c === "[") {
        steps.push(readBracket());
      } else if (/\s/.test(c)) {
        i++;
      } else {
        throw new Error("unexpected character “" + c + "” at position " + (i + 1) + ".");
      }
    }
    return steps;

    function readBracket() {
      // find matching close bracket, respecting quotes and nested parens
      var depth = 0, j = i, quote = null;
      for (; j < s.length; j++) {
        var ch = s.charAt(j);
        if (quote) { if (ch === "\\") { j++; continue; } if (ch === quote) quote = null; continue; }
        if (ch === "'" || ch === '"') { quote = ch; continue; }
        if (ch === "[" || ch === "(") depth++;
        else if (ch === "]" || ch === ")") { depth--; if (depth === 0 && ch === "]") break; }
      }
      if (j >= s.length) throw new Error("a “[” is never closed.");
      var inner = s.slice(i + 1, j).trim();
      i = j + 1;
      if (inner === "*") return { kind: "wild" };
      if (inner.charAt(0) === "?") {
        var expr = inner.slice(1).trim();
        if (expr.charAt(0) === "(" && expr.charAt(expr.length - 1) === ")") expr = expr.slice(1, -1);
        return { kind: "filter", expr: parseExpr(expr), src: expr };
      }
      if (/^-?\d*\s*:\s*-?\d*(\s*:\s*-?\d*)?$/.test(inner)) {
        var p = inner.split(":").map(function (x) { x = x.trim(); return x === "" ? null : parseInt(x, 10); });
        return { kind: "slice", start: p[0], end: p[1], step: p.length > 2 ? p[2] : null };
      }
      var parts = splitUnion(inner);
      if (parts.every(function (x) { return /^-?\d+$/.test(x); })) {
        return { kind: "indexes", indexes: parts.map(function (x) { return parseInt(x, 10); }) };
      }
      return { kind: "names", names: parts.map(unquote) };
    }
  }

  function splitUnion(str) {
    var out = [], cur = "", quote = null;
    for (var k = 0; k < str.length; k++) {
      var ch = str.charAt(k);
      if (quote) { cur += ch; if (ch === "\\") { cur += str.charAt(++k); continue; } if (ch === quote) quote = null; continue; }
      if (ch === "'" || ch === '"') { quote = ch; cur += ch; continue; }
      if (ch === ",") { out.push(cur.trim()); cur = ""; continue; }
      cur += ch;
    }
    out.push(cur.trim());
    return out.filter(function (x) { return x !== ""; });
  }

  function unquote(x) {
    var q = x.charAt(0);
    if ((q === "'" || q === '"') && x.charAt(x.length - 1) === q) {
      return x.slice(1, -1).replace(/\\(.)/g, "$1");
    }
    return x;
  }

  /* ---------------- filter expression parser ---------------- */
  function parseExpr(src) {
    var toks = lex(src), p = 0;
    function peek() { return toks[p]; }
    function next() { return toks[p++]; }
    function expect(v) { var t = next(); if (!t || t.v !== v) throw new Error("expected “" + v + "” in filter."); }

    function or() { var l = and(); while (peek() && peek().v === "||") { next(); l = { op: "||", l: l, r: and() }; } return l; }
    function and() { var l = not(); while (peek() && peek().v === "&&") { next(); l = { op: "&&", l: l, r: not() }; } return l; }
    function not() { if (peek() && peek().v === "!") { next(); return { op: "!", e: not() }; } return cmp(); }
    function cmp() {
      var l = primary();
      var t = peek();
      if (t && t.t === "op" && ["==", "!=", "<", "<=", ">", ">=", "=~", "in", "nin"].indexOf(t.v) !== -1) {
        next();
        return { op: t.v, l: l, r: primary() };
      }
      return l;
    }
    function primary() {
      var t = next();
      if (!t) throw new Error("the filter expression ends unexpectedly.");
      if (t.v === "(") { var e = or(); expect(")"); return e; }
      if (t.t === "path") return { path: t.v };
      if (t.t === "lit") return { lit: t.v };
      if (t.t === "regex") return { re: t.v };
      if (t.v === "[") {
        var arr = [];
        while (peek() && peek().v !== "]") { var it = next(); if (it.v === ",") continue; if (it.t !== "lit") throw new Error("only literals are allowed in a list."); arr.push(it.v); }
        expect("]");
        return { lit: arr };
      }
      throw new Error("unexpected “" + t.v + "” in filter.");
    }
    var tree = or();
    if (p < toks.length) throw new Error("unexpected “" + toks[p].v + "” in filter.");
    return tree;
  }

  function lex(src) {
    var toks = [], i = 0;
    while (i < src.length) {
      var c = src.charAt(i), rest = src.slice(i), m;
      if (/\s/.test(c)) { i++; continue; }
      if ((m = /^(==|!=|<=|>=|=~|&&|\|\||[<>!()\[\],])/.exec(rest))) {
        var v = m[1] === "=" ? "==" : m[1];
        toks.push({ t: /[()\[\],]/.test(v) && v.length === 1 ? "punc" : "op", v: v }); i += m[1].length; continue;
      }
      if ((m = /^(in|nin)\b/.exec(rest))) { toks.push({ t: "op", v: m[1] }); i += m[1].length; continue; }
      if (c === "@" || c === "$") {
        var j = i + 1, depth = 0, quote = null;
        for (; j < src.length; j++) {
          var ch = src.charAt(j);
          if (quote) { if (ch === quote) quote = null; continue; }
          if (ch === "'" || ch === '"') { if (depth) { quote = ch; continue; } break; }
          if (ch === "[") { depth++; continue; }
          if (ch === "]") { if (!depth) break; depth--; continue; }
          if (!depth && !/[\w.$*\-]/.test(ch)) break;
        }
        toks.push({ t: "path", v: src.slice(i, j) }); i = j; continue;
      }
      if (c === "'" || c === '"') {
        var k = i + 1, str = "";
        while (k < src.length && src.charAt(k) !== c) { if (src.charAt(k) === "\\") k++; str += src.charAt(k); k++; }
        if (k >= src.length) throw new Error("unterminated string in filter.");
        toks.push({ t: "lit", v: str }); i = k + 1; continue;
      }
      if (c === "/") {
        m = /^\/((?:\\.|[^\/])*)\/([gimsuy]*)/.exec(rest);
        if (!m) throw new Error("unterminated regular expression in filter.");
        toks.push({ t: "regex", v: new RegExp(m[1], m[2]) }); i += m[0].length; continue;
      }
      if ((m = /^-?\d+(\.\d+)?([eE][+-]?\d+)?/.exec(rest))) { toks.push({ t: "lit", v: parseFloat(m[0]) }); i += m[0].length; continue; }
      if ((m = /^(true|false|null)\b/.exec(rest))) { toks.push({ t: "lit", v: m[1] === "null" ? null : m[1] === "true" }); i += m[1].length; continue; }
      throw new Error("cannot understand “" + rest.slice(0, 12) + "” in the filter.");
    }
    return toks;
  }

  var MISSING = {};

  function evalExpr(node, cur, root) {
    if (node.op === "||") return truthy(evalExpr(node.l, cur, root)) || truthy(evalExpr(node.r, cur, root));
    if (node.op === "&&") return truthy(evalExpr(node.l, cur, root)) && truthy(evalExpr(node.r, cur, root));
    if (node.op === "!") return !truthy(evalExpr(node.e, cur, root));
    if (node.op) {
      var a = evalExpr(node.l, cur, root), b = evalExpr(node.r, cur, root);
      if (a === MISSING || b === MISSING) return node.op === "!=" ? a !== b : false;
      switch (node.op) {
        case "==": return deepEq(a, b);
        case "!=": return !deepEq(a, b);
        case "<": return a < b;
        case "<=": return a <= b;
        case ">": return a > b;
        case ">=": return a >= b;
        case "=~": return b instanceof RegExp && typeof a === "string" && b.test(a);
        case "in": return Array.isArray(b) && b.some(function (x) { return deepEq(a, x); });
        case "nin": return Array.isArray(b) && !b.some(function (x) { return deepEq(a, x); });
      }
    }
    if ("lit" in node) return node.lit;
    if ("re" in node) return node.re;
    if ("path" in node) {
      var base = node.path.charAt(0) === "@" ? cur : root;
      var rel = node.path.slice(1);
      if (!rel) return base;
      if (/\.length$/.test(rel)) {
        var arr = resolveSingle(base, rel.replace(/\.length$/, ""));
        if (Array.isArray(arr) || typeof arr === "string") return arr.length;
      }
      return resolveSingle(base, rel);
    }
    return MISSING;
  }

  function resolveSingle(base, rel) {
    if (!rel) return base;
    var res = evaluate(base, parsePath("$" + rel), base);
    return res.length ? res[0].value : MISSING;
  }

  function truthy(v) { return v !== MISSING && v !== false && v !== null && v !== undefined; }

  function deepEq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

  /* ---------------- evaluator ---------------- */
  function children(node) {
    var out = [];
    if (Array.isArray(node.value)) node.value.forEach(function (v, k) { out.push({ value: v, path: node.path.concat([k]) }); });
    else if (node.value && typeof node.value === "object") Object.keys(node.value).forEach(function (k) { out.push({ value: node.value[k], path: node.path.concat([k]) }); });
    return out;
  }

  function descendants(node) {
    var out = [node];
    children(node).forEach(function (c) { out = out.concat(descendants(c)); });
    return out;
  }

  function applyStep(step, node, root) {
    var v = node.value, out = [];
    switch (step.kind) {
      case "wild": return children(node);
      case "names":
        if (v && typeof v === "object" && !Array.isArray(v)) {
          step.names.forEach(function (n) { if (Object.prototype.hasOwnProperty.call(v, n)) out.push({ value: v[n], path: node.path.concat([n]) }); });
        }
        return out;
      case "indexes":
        if (Array.isArray(v)) step.indexes.forEach(function (ix) {
          var k = ix < 0 ? v.length + ix : ix;
          if (k >= 0 && k < v.length) out.push({ value: v[k], path: node.path.concat([k]) });
        });
        return out;
      case "slice": {
        if (!Array.isArray(v)) return out;
        var len = v.length, st = step.step || 1;
        if (st === 0) throw new Error("a slice step cannot be 0.");
        var start = step.start == null ? (st > 0 ? 0 : len - 1) : step.start < 0 ? Math.max(len + step.start, 0) : Math.min(step.start, len);
        var end = step.end == null ? (st > 0 ? len : -1) : step.end < 0 ? Math.max(len + step.end, -1) : Math.min(step.end, len);
        if (st > 0) for (var a = start; a < end; a += st) out.push({ value: v[a], path: node.path.concat([a]) });
        else for (var b = start; b > end; b += st) out.push({ value: v[b], path: node.path.concat([b]) });
        return out;
      }
      case "filter":
        return children(node).filter(function (c) { return truthy(evalExpr(step.expr, c.value, root)); });
    }
    return out;
  }

  function evaluate(rootValue, steps, root) {
    var nodes = [{ value: rootValue, path: [] }];
    steps.forEach(function (step) {
      var next = [];
      nodes.forEach(function (n) {
        var targets = step.deep ? descendants(n) : [n];
        targets.forEach(function (t) { next = next.concat(applyStep(step, t, root === undefined ? rootValue : root)); });
      });
      nodes = next;
    });
    return nodes;
  }

  function formatPath(path) {
    return "$" + path.map(function (p) {
      return typeof p === "number" ? "[" + p + "]" : /^[A-Za-z_$][\w$]*$/.test(p) ? "." + p : "['" + String(p).replace(/'/g, "\\'") + "']";
    }).join("");
  }

  /* ---------------- DataWeave hint ---------------- */
  function dwKey(n) { return /^[A-Za-z_][A-Za-z0-9_]*$/.test(n) ? n : JSON.stringify(n); }

  function toDataWeave(steps) {
    var out = "payload", filtered = false;
    for (var k = 0; k < steps.length; k++) {
      var s = steps[k];
      var dot = s.deep ? ".." : ".";
      if (s.kind === "names" && s.names.length === 1) out += dot + dwKey(s.names[0]);
      else if (s.kind === "names") out += dot + "(" + s.names.map(dwKey).join(", ") + ")" , filtered = true;
      else if (s.kind === "wild") out += s.deep ? "..*" : ".*";
      else if (s.kind === "indexes" && s.indexes.length === 1 && !s.deep) out += "[" + s.indexes[0] + "]";
      else if (s.kind === "slice" && !s.deep && (s.step == null || s.step === 1)) {
        var st = s.start == null ? 0 : s.start, en = s.end == null ? -1 : s.end - 1;
        out += "[" + st + " to " + en + "]";
      } else if (s.kind === "filter" && !s.deep) {
        var cond = s.src.replace(/@\.?/g, "$.").replace(/\$\.\$/g, "$").replace(/&&/g, " and ").replace(/\|\|/g, " or ")
                        .replace(/===?/g, "==").replace(/\s+/g, " ");
        out = "(" + out + " filter (" + cond.trim() + "))";
      } else return null;
    }
    return filtered ? null : out;
  }

  /* ---------------- UI ---------------- */
  var exprInput = document.getElementById("opt-path");

  var tool = MPT.simpleTool({
    transform: function (text, opts) {
      var data;
      try { data = JSON.parse(text); }
      catch (e) { throw new Error("the JSON document is not valid (" + e.message + ")."); }
      var path = (opts.path || "").trim();
      if (!path) return { output: "", message: "Enter a JSONPath expression, for example $.store.book[*].title", type: "warn" };
      var steps = parsePath(path);
      var res = evaluate(data, steps);
      var values = res.map(function (r) { return r.value; });
      var dw = toDataWeave(steps);
      var html = "";
      if (dw) html += '<div class="note" style="margin-bottom:10px"><strong>DataWeave:</strong> <code class="inline">' + MPT.escapeHtml(dw) + "</code></div>";
      if (!res.length) html += '<p class="io-meta">No matches.</p>';
      else {
        html += '<div class="table-wrap" style="margin-top:0"><table class="data"><thead><tr><th>#</th><th>Path</th><th>Value</th></tr></thead><tbody>';
        res.slice(0, 1000).forEach(function (r, k) {
          var val = JSON.stringify(r.value, null, 2);
          html += "<tr><td>" + (k + 1) + '</td><td style="font-family:var(--mono);font-size:.8rem;white-space:nowrap">' + MPT.escapeHtml(formatPath(r.path)) +
            '</td><td><pre style="margin:0;white-space:pre-wrap;word-break:break-word;font-family:var(--mono);font-size:.8rem">' + MPT.escapeHtml(val.length > 2000 ? val.slice(0, 2000) + "…" : val) + "</pre></td></tr>";
        });
        html += "</tbody></table></div>";
      }
      return {
        html: html,
        copyText: JSON.stringify(values, null, 2),
        message: res.length + " match" + (res.length === 1 ? "" : "es") + " for " + path + ".",
        type: res.length ? "ok" : "warn"
      };
    },
    sample: JSON.stringify({
      store: {
        book: [
          { category: "reference", author: "Nigel Rees", title: "Sayings of the Century", price: 8.95 },
          { category: "fiction", author: "Evelyn Waugh", title: "Sword of Honour", price: 12.99 },
          { category: "fiction", author: "Herman Melville", title: "Moby Dick", isbn: "0-553-21311-3", price: 8.99 },
          { category: "fiction", author: "J. R. R. Tolkien", title: "The Lord of the Rings", isbn: "0-395-19395-8", price: 22.99 }
        ],
        bicycle: { color: "red", price: 19.95 }
      }
    }, null, 2),
    errorPrefix: "Could not evaluate",
    downloadName: "jsonpath-result.json",
    emptyMessage: "Paste a JSON document, or press “Load example”."
  });

  if (exprInput && tool) {
    if (!exprInput.value) exprInput.value = "$.store.book[?(@.price < 10)].title";
    exprInput.addEventListener("input", MPT.debounce(function () { if (tool.getInput().trim()) tool.run(true); }, 250));
  }

  var chips = document.getElementById("jp-examples");
  if (chips && tool) chips.addEventListener("click", function (e) {
    var c = e.target.closest("[data-path]");
    if (!c) return;
    exprInput.value = c.getAttribute("data-path");
    if (!tool.getInput().trim()) document.getElementById("t-sample").click();
    else tool.run(false);
  });

  window.MPT_JSONPATH = { parse: parsePath, evaluate: evaluate, toDataWeave: toDataWeave };
})();
