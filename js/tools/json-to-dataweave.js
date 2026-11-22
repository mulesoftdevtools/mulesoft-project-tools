/* =====================================================================
   JSON to DataWeave 2.0 mapping generator
   Reads an example payload and writes a DataWeave script that maps every
   field, with map() for arrays — a starting point for a Transform Message.
   ===================================================================== */
(function () {
  "use strict";

  var SAFE_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;
  var DW_RESERVED = ["if", "else", "do", "fun", "var", "type", "ns", "import", "using", "match", "case",
    "default", "as", "is", "and", "or", "not", "null", "true", "false", "unless", "update", "at"];

  function words(key) {
    return String(key)
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/[^A-Za-z0-9]+/g, " ")
      .trim().toLowerCase().split(/\s+/).filter(Boolean);
  }

  function renameKey(key, mode) {
    var w = words(key);
    if (!w.length || mode === "keep") return key;
    if (mode === "camel") return w[0] + w.slice(1).map(function (s) { return s.charAt(0).toUpperCase() + s.slice(1); }).join("");
    if (mode === "pascal") return w.map(function (s) { return s.charAt(0).toUpperCase() + s.slice(1); }).join("");
    if (mode === "snake") return w.join("_");
    if (mode === "kebab") return w.join("-");
    return key;
  }

  function keyLiteral(key) {
    return SAFE_KEY.test(key) && DW_RESERVED.indexOf(key) === -1 ? key : JSON.stringify(key);
  }

  function selector(base, key) {
    return base + "." + (SAFE_KEY.test(key) && DW_RESERVED.indexOf(key) === -1 ? key : JSON.stringify(key));
  }

  function singular(key, used) {
    var w = words(key);
    var name = w.length ? w[w.length - 1] : "item";
    if (/ies$/.test(name)) name = name.replace(/ies$/, "y");
    else if (/sses$/.test(name)) name = name.replace(/es$/, "");
    else if (/s$/.test(name) && name.length > 3) name = name.replace(/s$/, "");
    if (!SAFE_KEY.test(name) || DW_RESERVED.indexOf(name) !== -1 || name === "payload") name = "item";
    var candidate = name, n = 2;
    while (used[candidate]) { candidate = name + n; n++; }
    used[candidate] = true;
    return candidate;
  }

  function defaultFor(value) {
    if (typeof value === "string") return '""';
    if (typeof value === "number") return "0";
    if (typeof value === "boolean") return "false";
    return null;
  }

  function sampleItem(arr) {
    // merge keys from all object items so optional fields are still mapped
    var merged = null;
    arr.forEach(function (v) {
      if (v && typeof v === "object" && !Array.isArray(v)) {
        merged = merged || {};
        Object.keys(v).forEach(function (k) { if (!(k in merged) || merged[k] === null) merged[k] = v[k]; });
      }
    });
    return merged !== null ? merged : arr[0];
  }

  function Gen(opts) {
    this.opts = opts;
    this.used = { payload: true, index: true };
    this.indent = opts.indent === "4" ? "    " : "  ";
  }

  Gen.prototype.pad = function (d) { return new Array(d + 1).join(this.indent); };

  Gen.prototype.value = function (value, expr, depth, key) {
    var o = this.opts;
    if (Array.isArray(value)) {
      var item = value.length ? sampleItem(value) : null;
      if (item && typeof item === "object" && !Array.isArray(item)) {
        var v = singular(key || "item", this.used);
        var idx = v === "item" ? "index" : v + "Index";
        if (o.output === "xml") {
          var tag = keyLiteral(renameKey(v, o.keys));
          return "{\n" + this.pad(depth + 1) + "(" + expr + " map (" + v + ", " + idx + ") -> {\n" +
                 this.pad(depth + 2) + tag + ": " + this.object(item, v, depth + 2) + "\n" +
                 this.pad(depth + 1) + "})\n" + this.pad(depth) + "}";
        }
        return expr + " map (" + v + ", " + idx + ") -> " + this.object(item, v, depth);
      }
      if (o.output === "xml") {
        var pv = singular(key || "item", this.used);
        var ptag = keyLiteral(renameKey(pv, o.keys));
        return "{\n" + this.pad(depth + 1) + "(" + expr + (o.defaults ? " default []" : "") + " map (" + pv + ") -> { " + ptag + ": " + pv + " })\n" + this.pad(depth) + "}";
      }
      return o.defaults ? expr + " default []" : expr;
    }
    if (value && typeof value === "object") {
      return this.object(value, expr, depth);
    }
    if (o.defaults) {
      var d = defaultFor(value);
      if (d !== null) return expr + " default " + d;
    }
    if (o.types && typeof value === "number") return expr + " as Number";
    return expr;
  };

  Gen.prototype.object = function (obj, base, depth) {
    var self = this, keys = Object.keys(obj);
    if (!keys.length) return "{}";
    var lines = keys.map(function (k) {
      var outKey = keyLiteral(renameKey(k, self.opts.keys));
      return self.pad(depth + 1) + outKey + ": " + self.value(obj[k], selector(base, k), depth + 1, k);
    });
    return "{\n" + lines.join(",\n") + "\n" + this.pad(depth) + "}";
  };

  var MIME = { json: "application/json", xml: "application/xml", java: "application/java", csv: "application/csv" };

  function generate(data, opts) {
    var g = new Gen(opts);
    var header = "%dw 2.0\noutput " + MIME[opts.output] + "\n---\n";
    var body, warn = null;
    if (opts.output === "xml") {
      var root = Array.isArray(data) ? { items: data } : data;
      if (!root || typeof root !== "object") throw new Error("XML output needs an object or array as the root.");
      var rootExpr = Array.isArray(data) ? "payload" : "payload";
      if (Array.isArray(data)) {
        body = "{\n" + g.pad(1) + "root: " + g.value(data, rootExpr, 1, "items") + "\n}";
      } else {
        body = "{\n" + g.pad(1) + "root: " + g.object(data, "payload", 1) + "\n}";
      }
    } else if (Array.isArray(data)) {
      body = g.value(data, "payload", 0, "items");
      if (opts.output === "csv" && data.length && typeof sampleItem(data) === "object") {
        var flat = Object.keys(sampleItem(data)).every(function (k) {
          var v = sampleItem(data)[k];
          return v === null || typeof v !== "object";
        });
        if (!flat) warn = "CSV output needs flat rows — nested objects and arrays in each item must be flattened before writing CSV.";
      }
    } else if (data && typeof data === "object") {
      body = g.object(data, "payload", 0);
      if (opts.output === "csv") warn = "CSV output expects an array of flat objects, but the root of this payload is an object.";
    } else {
      body = "payload";
    }
    return { script: header + body + "\n", warn: warn };
  }

  MPT.simpleTool({
    transform: function (text, opts) {
      var data;
      try { data = JSON.parse(text); }
      catch (e) { throw new Error("the input is not valid JSON (" + e.message + ")."); }
      var res = generate(data, opts);
      var lines = res.script.split("\n").length;
      return {
        output: res.script,
        message: res.warn || ("Generated a " + lines + "-line DataWeave 2.0 script. Paste it into a Transform Message component and adjust the field mapping."),
        type: res.warn ? "warn" : "ok"
      };
    },
    sample: JSON.stringify({
      order_id: "ORD-10023",
      "order-date": "2026-03-14",
      customer: { first_name: "Ada", last_name: "Lovelace", email: "ada@example.com" },
      items: [
        { sku: "MULE-001", qty: 2, unit_price: 49.99 },
        { sku: "MULE-002", qty: 1, unit_price: 29.97, discount: 5 }
      ],
      tags: ["priority", "online"],
      paid: true
    }, null, 2),
    errorPrefix: "Could not generate DataWeave",
    downloadName: "transform.dwl",
    emptyMessage: "Paste an example input payload, or press “Load example”."
  });
})();
