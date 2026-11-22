/* =====================================================================
   JSON Schema / RAML DataType / OpenAPI schema generator
   Infers a schema from an example JSON payload. Arrays of objects are
   merged so that optional fields (missing from some items) are detected.
   ===================================================================== */
(function () {
  "use strict";

  var RE_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;
  var RE_DATE = /^\d{4}-\d{2}-\d{2}$/;
  var RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var RE_URI = /^https?:\/\/\S+$/i;
  var RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  /* ---- inference: produce an internal node { type, ... } ---- */
  function infer(value) {
    if (value === null) return { type: "null" };
    if (Array.isArray(value)) {
      var item = null;
      value.forEach(function (v) { item = item ? merge(item, infer(v)) : infer(v); });
      return { type: "array", items: item || { type: "any" } };
    }
    switch (typeof value) {
      case "boolean": return { type: "boolean", example: value };
      case "number": return { type: Number.isInteger(value) ? "integer" : "number", example: value };
      case "string": {
        var fmt = RE_DATETIME.test(value) ? "date-time" : RE_DATE.test(value) ? "date" :
                  RE_UUID.test(value) ? "uuid" : RE_EMAIL.test(value) ? "email" : RE_URI.test(value) ? "uri" : null;
        var n = { type: "string", example: value };
        if (fmt) n.format = fmt;
        return n;
      }
      case "object": {
        var props = {}, keys = Object.keys(value);
        keys.forEach(function (k) { props[k] = infer(value[k]); });
        return { type: "object", properties: props, required: keys.slice() };
      }
    }
    return { type: "any" };
  }

  function merge(a, b) {
    if (a.type === "any") return b;
    if (b.type === "any") return a;
    if (a.type === "null" && b.type !== "null") return withNull(b);
    if (b.type === "null" && a.type !== "null") return withNull(a);
    var nullable = a.nullable || b.nullable;
    if (a.type === b.type) {
      var out;
      if (a.type === "object") {
        var props = {};
        Object.keys(a.properties).forEach(function (k) { props[k] = a.properties[k]; });
        Object.keys(b.properties).forEach(function (k) {
          props[k] = props[k] ? merge(props[k], b.properties[k]) : b.properties[k];
        });
        var req = a.required.filter(function (k) { return b.required.indexOf(k) !== -1; });
        out = { type: "object", properties: props, required: req };
      } else if (a.type === "array") {
        out = { type: "array", items: merge(a.items, b.items) };
      } else {
        out = { type: a.type, example: a.example };
        if (a.format && a.format === b.format) out.format = a.format;
      }
      if (nullable) out.nullable = true;
      return out;
    }
    if ((a.type === "integer" && b.type === "number") || (a.type === "number" && b.type === "integer")) {
      return { type: "number", example: a.example, nullable: nullable || undefined };
    }
    return { type: "any", nullable: nullable || undefined };
  }

  function withNull(n) {
    var c = {};
    Object.keys(n).forEach(function (k) { c[k] = n[k]; });
    c.nullable = true;
    return c;
  }

  /* ---- emitters ---- */
  function toJsonSchema(n, opts, isRoot) {
    var s = {};
    if (isRoot) {
      s.$schema = "http://json-schema.org/draft-07/schema#";
      s.title = opts.title || "Root";
    }
    if (n.type === "any") { if (n.nullable) return s; return s; }
    s.type = n.nullable && n.type !== "null" ? [n.type, "null"] : n.type;
    if (n.format && n.format !== "uuid") s.format = n.format;
    if (n.format === "uuid") s.format = "uuid";
    if (n.type === "object") {
      s.properties = {};
      Object.keys(n.properties).forEach(function (k) { s.properties[k] = toJsonSchema(n.properties[k], opts); });
      var req = opts.required ? n.required : [];
      if (req.length) s.required = req;
      if (opts.strict) s.additionalProperties = false;
    } else if (n.type === "array") {
      s.items = toJsonSchema(n.items, opts);
    } else if (opts.examples && n.example !== undefined) {
      s.examples = [n.example];
    }
    return s;
  }

  function toOas(n, opts) {
    var s = {};
    if (n.type === "any") { if (n.nullable) s.nullable = true; return s; }
    if (n.type === "null") { s.nullable = true; return s; }
    s.type = n.type;
    if (n.format) s.format = n.format;
    if (n.nullable) s.nullable = true;
    if (n.type === "object") {
      if (opts.required && n.required.length) s.required = n.required;
      s.properties = {};
      Object.keys(n.properties).forEach(function (k) { s.properties[k] = toOas(n.properties[k], opts); });
      if (opts.strict) s.additionalProperties = false;
    } else if (n.type === "array") {
      s.items = toOas(n.items, opts);
    } else if (opts.examples && n.example !== undefined) {
      s.example = n.example;
    }
    return s;
  }

  var RAML_FORMAT = { "date-time": "datetime", "date": "date-only" };

  function ramlType(n) {
    if (n.type === "any") return "any";
    if (n.type === "null") return "nil";
    var t = n.type === "string" && RAML_FORMAT[n.format] ? RAML_FORMAT[n.format] : n.type;
    return t;
  }

  function toRaml(n, opts) {
    var s = {};
    var t = ramlType(n);
    s.type = n.nullable && t !== "nil" && n.type !== "object" && n.type !== "array" ? t + " | nil" : t;
    if (n.type === "string" && n.format === "email") s.pattern = "^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$";
    if (n.type === "string" && n.format === "uuid") s.pattern = "^[0-9a-fA-F-]{36}$";
    if (n.type === "object") {
      s.properties = {};
      Object.keys(n.properties).forEach(function (k) {
        var p = toRaml(n.properties[k], opts);
        var isReq = opts.required ? n.required.indexOf(k) !== -1 : false;
        // RAML properties are required by default
        if (!isReq) p.required = false;
        s.properties[k] = p;
      });
      if (opts.strict) s.additionalProperties = false;
    } else if (n.type === "array") {
      s.items = toRaml(n.items, opts);
    } else if (opts.examples && n.example !== undefined) {
      s.example = n.example;
    }
    return s;
  }

  function countFields(n) {
    if (n.type === "object") {
      return Object.keys(n.properties).reduce(function (acc, k) { return acc + 1 + countFields(n.properties[k]); }, 0);
    }
    if (n.type === "array") return countFields(n.items);
    return 0;
  }

  MPT.simpleTool({
    transform: function (text, opts) {
      var data;
      try { data = JSON.parse(text); }
      catch (e) { throw new Error("the input is not valid JSON (" + e.message + "). Run it through the JSON Validator to find the exact problem."); }
      var node = infer(data);
      var o = { required: !!opts.required, examples: !!opts.examples, strict: !!opts.strict, title: "Root" };
      var out;
      if (opts.format === "raml") {
        out = "#%RAML 1.0 DataType\n" + jsyaml.dump(toRaml(node, o), { lineWidth: 120, noRefs: true });
      } else if (opts.format === "oas") {
        out = jsyaml.dump({ components: { schemas: { Root: toOas(node, o) } } }, { lineWidth: 120, noRefs: true });
      } else {
        out = JSON.stringify(toJsonSchema(node, o, true), null, 2);
      }
      var label = opts.format === "raml" ? "RAML 1.0 DataType" : opts.format === "oas" ? "OpenAPI 3.0 schema" : "JSON Schema (draft-07)";
      return {
        output: out,
        message: "Generated a " + label + " describing " + countFields(node) + " field(s). " +
                 "Review the types — an example payload can only show what is present in it.",
        type: "ok"
      };
    },
    sample: JSON.stringify({
      orderId: "ORD-10023",
      createdAt: "2026-03-14T09:26:53Z",
      customer: { id: "b6f8c1e2-4d1a-4f6e-9c2a-1f3e5d7a9b0c", name: "Ada Lovelace", email: "ada@example.com", vip: true },
      total: 129.95,
      items: [
        { sku: "MULE-001", qty: 2, price: 49.99, note: "gift wrap" },
        { sku: "MULE-002", qty: 1, price: 29.97, note: null }
      ],
      tags: ["priority", "online"]
    }, null, 2),
    errorPrefix: "Could not generate a schema",
    downloadName: function (opts) {
      return opts.format === "raml" ? "root-type.raml" : opts.format === "oas" ? "schema.yaml" : "schema.json";
    },
    emptyMessage: "Paste an example JSON payload, or press “Load example”."
  });
})();
