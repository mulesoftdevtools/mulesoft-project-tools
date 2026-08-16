/* =====================================================================
   YAML ⇄ JSON converter (general purpose)
   ===================================================================== */
(function () {
  "use strict";

  var SAMPLE = [
    "# Application configuration",
    "app:",
    "  name: order-service",
    "  version: 2.4.1",
    "  debug: false",
    "server:",
    "  host: 0.0.0.0",
    "  port: 8081",
    "  timeouts:",
    "    connect: 5000",
    "    read: 30000",
    "database:",
    "  url: jdbc:mysql://localhost:3306/orders",
    "  pool:",
    "    min: 5",
    "    max: 20",
    "features:",
    "  - retries",
    "  - circuit-breaker",
    "  - metrics"
  ].join("\n");

  function detect(text) {
    var t = text.trim();
    return (t.charAt(0) === "{" || t.charAt(0) === "[") ? "json" : "yaml";
  }

  function summarise(value) {
    if (Array.isArray(value)) return "a list of " + value.length + " item(s)";
    if (value && typeof value === "object") return "a mapping with " + Object.keys(value).length + " top-level key(s)";
    return "a scalar value";
  }

  MPT.simpleTool({
    transform: function (text, opts) {
      var direction = (opts && opts.direction) || "auto";
      if (direction === "auto") direction = detect(text) === "json" ? "json2yaml" : "yaml2json";

      if (direction === "json2yaml") {
        var parsed;
        try {
          parsed = JSON.parse(text);
        } catch (e) {
          throw new Error("the input is not valid JSON — " + e.message);
        }
        return {
          output: jsyaml.dump(parsed, { indent: 2, lineWidth: 120, noRefs: true }),
          message: "Converted JSON → YAML (" + summarise(parsed) + ").",
          type: "ok"
        };
      }

      var docs;
      try {
        docs = jsyaml.loadAll(text);
      } catch (e) {
        throw new Error("the input is not valid YAML — " + e.message);
      }
      docs = docs.filter(function (d) { return d !== undefined && d !== null; });

      if (!docs.length) throw new Error("the YAML document is empty.");

      if (docs.length > 1) {
        return {
          output: JSON.stringify(docs, null, 2),
          message: "Converted YAML → JSON. The input contained " + docs.length +
                   " documents separated by “---”, so they were combined into a JSON array.",
          type: "warn"
        };
      }

      return {
        output: JSON.stringify(docs[0], null, 2),
        message: "Converted YAML → JSON (" + summarise(docs[0]) + ").",
        type: "ok"
      };
    },
    sample: SAMPLE,
    errorPrefix: "Conversion failed",
    downloadName: function (opts) {
      var node = document.getElementById("t-input");
      var dir = opts.direction === "auto"
        ? (detect(node ? node.value : "") === "json" ? "json2yaml" : "yaml2json")
        : opts.direction;
      return dir === "json2yaml" ? "converted.yaml" : "converted.json";
    },
    emptyMessage: "Paste YAML or JSON, or press “Load example”."
  });
})();
