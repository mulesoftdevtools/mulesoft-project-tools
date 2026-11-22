/* =====================================================================
   SQL Formatter (Mule Database connector aware)
   Formats SELECT / INSERT / UPDATE / DELETE / WITH statements, keeps Mule
   named parameters (:id) and inline DataWeave (#[ ... ]) intact, and
   lists every parameter it finds so you can build inputParameters.
   ===================================================================== */
(function () {
  "use strict";

  var CLAUSES = [
    "SELECT DISTINCT", "SELECT", "FROM", "WHERE", "GROUP BY", "ORDER BY", "HAVING", "LIMIT", "OFFSET", "FETCH FIRST", "FETCH NEXT",
    "INSERT INTO", "VALUES", "UPDATE", "SET", "DELETE FROM", "RETURNING", "WITH", "UNION ALL", "UNION", "INTERSECT", "EXCEPT", "MINUS",
    "ON CONFLICT", "ON DUPLICATE KEY UPDATE", "MERGE INTO", "USING", "WHEN MATCHED THEN", "WHEN NOT MATCHED THEN", "WINDOW"
  ];
  var JOINS = ["LEFT OUTER JOIN", "RIGHT OUTER JOIN", "FULL OUTER JOIN", "LEFT JOIN", "RIGHT JOIN", "FULL JOIN", "INNER JOIN",
    "CROSS JOIN", "NATURAL JOIN", "JOIN"];
  var KEYWORDS = ("ALL AND ANY AS ASC BETWEEN BY CASE CAST COALESCE COUNT CREATE DEFAULT DESC DISTINCT DROP ELSE END EXISTS " +
    "FALSE FOR FROM FULL GROUP HAVING IF IN INDEX INNER INTO IS JOIN KEY LEFT LIKE ILIKE LIMIT MAX MIN NOT NULL NULLS FIRST LAST OFFSET ON OR ORDER " +
    "OUTER OVER PARTITION PRIMARY RIGHT ROWS ROW SELECT SET SUM AVG TABLE THEN TOP TRUE UNION UNIQUE UPDATE USING VALUES WHEN WHERE WITH " +
    "INSERT DELETE MERGE MATCHED RETURNING INTERVAL EXTRACT CURRENT_DATE CURRENT_TIMESTAMP NOW LOWER UPPER TRIM SUBSTRING CONCAT ROUND " +
    "VARCHAR INTEGER INT NUMERIC DECIMAL DATE TIMESTAMP BOOLEAN TEXT CHAR FETCH NEXT ONLY CONFLICT DO NOTHING DUPLICATE ALTER ADD COLUMN " +
    "BEGIN COMMIT ROLLBACK TRANSACTION CALL EXEC PROCEDURE FUNCTION RETURNS DECLARE LATERAL WINDOW RECURSIVE EXCEPT INTERSECT MINUS NATURAL CROSS").split(" ");
  var KW = {};
  KEYWORDS.forEach(function (k) { KW[k] = true; });

  function tokenize(sql) {
    var toks = [], i = 0, n = sql.length, m;
    while (i < n) {
      var c = sql.charAt(i), rest = sql.slice(i);
      if (/\s/.test(c)) { i++; continue; }
      if (rest.indexOf("--") === 0) { var e = sql.indexOf("\n", i); e = e < 0 ? n : e; toks.push({ t: "comment", v: sql.slice(i, e).trim() }); i = e; continue; }
      if (rest.indexOf("/*") === 0) { var e2 = sql.indexOf("*/", i + 2); e2 = e2 < 0 ? n : e2 + 2; toks.push({ t: "bcomment", v: sql.slice(i, e2) }); i = e2; continue; }
      if (rest.indexOf("#[") === 0) {           // inline DataWeave expression
        var depth = 0, j = i + 1;
        for (; j < n; j++) { var ch = sql.charAt(j); if (ch === "[") depth++; else if (ch === "]") { depth--; if (!depth) break; } }
        toks.push({ t: "dw", v: sql.slice(i, j + 1) }); i = j + 1; continue;
      }
      if (c === "'" || c === '"' || c === "`") {
        var k = i + 1;
        while (k < n) { if (sql.charAt(k) === c) { if (sql.charAt(k + 1) === c) { k += 2; continue; } break; } k++; }
        toks.push({ t: c === "'" ? "string" : "ident", v: sql.slice(i, k + 1) }); i = k + 1; continue;
      }
      if (c === "[" ) { var b = sql.indexOf("]", i); b = b < 0 ? n - 1 : b; toks.push({ t: "ident", v: sql.slice(i, b + 1) }); i = b + 1; continue; }
      if ((m = /^:[A-Za-z_][\w]*/.exec(rest)) && sql.charAt(i - 1) !== ":") { toks.push({ t: "param", v: m[0] }); i += m[0].length; continue; }
      if ((m = /^\d+(\.\d+)?([eE][+-]?\d+)?/.exec(rest))) { toks.push({ t: "num", v: m[0] }); i += m[0].length; continue; }
      if ((m = /^[A-Za-z_][\w$]*(\.[A-Za-z_*][\w$]*)*/.exec(rest))) { toks.push({ t: "word", v: m[0] }); i += m[0].length; continue; }
      if ((m = /^(<>|<=|>=|!=|::|\|\||=>|[=<>+\-*\/%])/.exec(rest))) { toks.push({ t: "op", v: m[0] }); i += m[0].length; continue; }
      if (c === "?") { toks.push({ t: "param", v: "?" }); i++; continue; }
      toks.push({ t: "punc", v: c }); i++;
    }
    return toks;
  }

  // merge multi-word clauses ("GROUP BY", "LEFT OUTER JOIN"...) into one token
  function mergePhrases(toks) {
    var phrases = CLAUSES.concat(JOINS).map(function (p) { return p.split(" "); })
      .sort(function (a, b) { return b.length - a.length; });
    var out = [];
    for (var i = 0; i < toks.length; i++) {
      var matched = null;
      if (toks[i].t === "word") {
        for (var p = 0; p < phrases.length && !matched; p++) {
          var ph = phrases[p], ok = true;
          for (var k = 0; k < ph.length; k++) {
            var t = toks[i + k];
            if (!t || t.t !== "word" || t.v.toUpperCase() !== ph[k]) { ok = false; break; }
          }
          if (ok) matched = ph;
        }
      }
      if (matched) {
        var raw = toks.slice(i, i + matched.length).map(function (t) { return t.v; }).join(" ");
        var upper = matched.join(" ");
        out.push({ t: JOINS.indexOf(upper) !== -1 ? "join" : "clause", v: raw, u: upper });
        i += matched.length - 1;
      } else out.push(toks[i]);
    }
    return out;
  }

  function caseWord(tok, mode) {
    var up = tok.v.toUpperCase();
    var isKw = tok.t === "clause" || tok.t === "join" || (tok.t === "word" && KW[up]);
    if (!isKw) return tok.v;
    if (mode === "upper") return up;
    if (mode === "lower") return up.toLowerCase();
    return tok.v;
  }

  function format(sql, opts) {
    var toks = mergePhrases(tokenize(sql));
    var unit = opts.indent === "4" ? "    " : opts.indent === "tab" ? "\t" : "  ";
    if (opts.indent === "minify") return minify(toks, opts);

    var lines = [], line = "", level = 0;
    var stack = [];          // paren contexts: { sub: bool, base: level }
    var clause = "";         // current clause name (upper)
    var caseDepth = 0;

    function pad(l) { return new Array(Math.max(l, 0) + 1).join(unit); }
    function newline(l) { if (line.trim()) lines.push(line.replace(/\s+$/, "")); line = pad(l); }
    function emit(text, noSpace) {
      if (line.trim() === "" ) line += text;
      else if (noSpace || /[(.]$/.test(line) ) line += text;
      else line += " " + text;
    }

    for (var i = 0; i < toks.length; i++) {
      var t = toks[i], prev = toks[i - 1], nxt = toks[i + 1];
      var txt = caseWord(t, opts.kwcase);
      var up = t.u || t.v.toUpperCase();

      if (t.t === "clause") {
        var base = stack.length ? stack[stack.length - 1].base : 0;
        if (/^(UNION|INTERSECT|EXCEPT|MINUS)/.test(up)) { newline(base); emit(txt); newline(base); clause = ""; continue; }
        if (up === "SET" && clause !== "UPDATE" && clause !== "ON DUPLICATE KEY UPDATE" && clause !== "WHEN MATCHED THEN") { emit(txt); continue; }
        newline(base);
        emit(txt);
        clause = up;
        level = base + 1;
        if (["SELECT", "SELECT DISTINCT", "SET", "GROUP BY", "ORDER BY", "RETURNING"].indexOf(up) !== -1) newline(level);
        continue;
      }
      if (t.t === "join") {
        var jb = stack.length ? stack[stack.length - 1].base : 0;
        newline(jb); emit(txt); clause = "JOIN"; level = jb + 1; continue;
      }
      if (t.t === "word" && (up === "AND" || up === "OR") && caseDepth === 0 && !(prev && prev.t === "word" && prev.v.toUpperCase() === "BETWEEN") &&
          ["WHERE", "HAVING", "JOIN", "ON"].indexOf(clause) !== -1 && !inBetween(toks, i)) {
        newline(level); emit(txt); continue;
      }
      if (t.t === "word" && up === "ON" && clause === "JOIN") { newline(level); emit(txt); clause = "ON"; continue; }
      if (t.t === "word" && up === "CASE") { caseDepth++; emit(txt); continue; }
      if (t.t === "word" && (up === "WHEN" || up === "ELSE") && caseDepth > 0) { newline(level + caseDepth); emit(txt); continue; }
      if (t.t === "word" && up === "END" && caseDepth > 0) { caseDepth--; newline(level + caseDepth); emit(txt); continue; }

      if (t.v === "(") {
        var isSub = nxt && nxt.t === "clause" && /^(SELECT|WITH)/.test(nxt.u || "");
        var fnCall = prev && (prev.t === "word" && !KW[prev.v.toUpperCase()] || (prev.t === "word" && /^(COUNT|SUM|AVG|MIN|MAX|COALESCE|CAST|LOWER|UPPER|TRIM|SUBSTRING|CONCAT|ROUND|NOW|EXTRACT|OVER|IN|EXISTS|VALUES)$/i.test(prev.v)));
        emit("(", fnCall && clause !== "INSERT INTO" && !/^(IN|EXISTS|VALUES|OVER)$/i.test(prev.v));
        stack.push({ sub: isSub, base: isSub ? level + 1 : level, clause: clause, level: level });
        continue;
      }
      if (t.v === ")") {
        var ctx = stack.pop();
        if (ctx && ctx.sub) { newline(ctx.level); emit(")", true); clause = ctx.clause; level = ctx.level; }
        else { emit(")", true); if (ctx) { clause = ctx.clause; level = ctx.level; } }
        continue;
      }
      if (t.v === ",") {
        line = line.replace(/\s+$/, "") + ",";
        var inParen = stack.length && !stack[stack.length - 1].sub;
        if (!inParen && ["SELECT", "SELECT DISTINCT", "SET", "GROUP BY", "ORDER BY", "RETURNING", "WITH"].indexOf(clause) !== -1) newline(level);
        continue;
      }
      if (t.v === ";") { line = line.replace(/\s+$/, "") + ";"; newline(0); lines.push(""); clause = ""; level = 0; continue; }
      if (t.v === "." ) { line = line.replace(/\s+$/, "") + "."; continue; }
      if (t.t === "comment") { emit(t.v); newline(level); continue; }
      if (t.t === "bcomment") { newline(level); emit(t.v); newline(level); continue; }
      if (t.v === "::") { line = line.replace(/\s+$/, "") + "::"; continue; }
      if (prev && prev.v === "::") { line += txt; continue; }
      emit(txt);
    }
    newline(0);
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    return lines.join("\n");
  }

  function inBetween(toks, i) {
    // the AND of "BETWEEN x AND y" must not break the line
    for (var k = i - 1; k >= 0 && k >= i - 6; k--) {
      var v = toks[k].t === "word" ? toks[k].v.toUpperCase() : "";
      if (v === "BETWEEN") return true;
      if (v === "AND" || v === "OR" || toks[k].t === "clause") return false;
    }
    return false;
  }

  function minify(toks, opts) {
    var out = "";
    toks.forEach(function (t, i) {
      if (t.t === "comment") return;
      var txt = caseWord(t, opts.kwcase);
      var prev = toks[i - 1];
      var fn = t.v === "(" && prev && prev.t === "word" && !/^(IN|EXISTS|VALUES|OVER|AS|ON|AND|OR|WHERE|FROM|JOIN|NOT)$/i.test(prev.v);
      var tight = fn || t.v === "," || t.v === ")" || t.v === "." || t.v === ";" || t.v === "::" ||
                  (prev && (prev.v === "(" || prev.v === "." || prev.v === "::"));
      out += (out && !tight ? " " : "") + txt;
    });
    return out;
  }

  function params(sql) {
    var named = {}, positional = 0, dw = 0;
    tokenize(sql).forEach(function (t) {
      if (t.t === "param") { if (t.v === "?") positional++; else named[t.v.slice(1)] = true; }
      if (t.t === "dw") dw++;
    });
    return { named: Object.keys(named), positional: positional, dw: dw };
  }

  MPT.simpleTool({
    transform: function (text, opts) {
      var out = format(text, opts);
      var p = params(text);
      var msg = "Formatted " + text.split(/;\s*(?=\S)/).length + " statement(s).";
      var type = "ok";
      if (p.named.length) {
        msg += " Named parameters: " + p.named.map(function (n) { return ":" + n; }).join(", ") +
               " — supply them in the operation's inputParameters, e.g. #[{ " + p.named.map(function (n) { return n + ": vars." + n; }).join(", ") + " }].";
      }
      if (p.positional) msg += " Found " + p.positional + " positional “?” parameter(s); the Mule Database connector expects named :parameters instead.";
      if (p.dw) { msg += " Found " + p.dw + " inline #[ ] expression(s) — prefer named parameters to avoid SQL injection."; type = "warn"; }
      if (p.positional) type = "warn";
      return { output: out, message: msg, type: type };
    },
    sample: "select o.order_id, o.created_at, c.name as customer_name, sum(i.qty * i.unit_price) as total from orders o inner join customers c on c.id = o.customer_id and c.active = true left join order_items i on i.order_id = o.order_id where o.status = :status and o.created_at between :fromDate and :toDate and c.region in (select region from regions where enabled = 1) group by o.order_id, o.created_at, c.name having sum(i.qty) > 0 order by o.created_at desc limit 50;",
    errorPrefix: "Could not format",
    downloadName: "query.sql",
    emptyMessage: "Paste a SQL statement, or press “Load example”."
  });
})();
