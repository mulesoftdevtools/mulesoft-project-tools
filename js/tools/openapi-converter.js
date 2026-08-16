/* =====================================================================
   OpenAPI / Swagger JSON ⇄ YAML converter
   ===================================================================== */
(function () {
  "use strict";

  var SAMPLE = JSON.stringify({
    openapi: "3.0.3",
    info: { title: "Orders API", version: "1.0.0", description: "Manages customer orders." },
    servers: [{ url: "https://api.example.com/v1" }],
    paths: {
      "/orders": {
        get: {
          summary: "List orders",
          operationId: "listOrders",
          parameters: [{ name: "status", "in": "query", required: false, schema: { type: "string" } }],
          responses: { "200": { description: "OK" } }
        },
        post: { summary: "Create order", operationId: "createOrder", responses: { "201": { description: "Created" } } }
      },
      "/orders/{orderId}": {
        get: {
          summary: "Get an order",
          operationId: "getOrder",
          parameters: [{ name: "orderId", "in": "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "OK" }, "404": { description: "Not found" } }
        }
      }
    }
  }, null, 2);

  function detect(text) {
    var t = text.trim();
    return (t.charAt(0) === "{" || t.charAt(0) === "[") ? "json" : "yaml";
  }

  function convert(text, opts) {
    var direction = (opts && opts.direction) || "auto";
    var source = direction === "auto" ? detect(text) : (direction === "yaml2json" ? "yaml" : "json");
    var obj;

    if (source === "json") {
      try {
        obj = JSON.parse(text);
      } catch (e) {
        throw new Error("input is not valid JSON — " + e.message);
      }
      return {
        output: jsyaml.dump(obj, { indent: 2, lineWidth: 120, noRefs: true }),
        message: "Converted JSON → YAML." + describe(obj),
        type: "ok"
      };
    }

    try {
      obj = jsyaml.load(text);
    } catch (e) {
      throw new Error("input is not valid YAML — " + e.message);
    }
    if (obj === null || obj === undefined) throw new Error("the YAML document is empty.");
    return {
      output: JSON.stringify(obj, null, 2),
      message: "Converted YAML → JSON." + describe(obj),
      type: "ok"
    };
  }

  function describe(obj) {
    if (!obj || typeof obj !== "object") return "";
    var bits = [];
    if (obj.openapi) bits.push("OpenAPI " + obj.openapi);
    else if (obj.swagger) bits.push("Swagger " + obj.swagger);
    if (obj.info && obj.info.title) bits.push("“" + obj.info.title + "”");
    if (obj.paths && typeof obj.paths === "object") bits.push(Object.keys(obj.paths).length + " path(s)");
    return bits.length ? " Detected " + bits.join(", ") + "." : "";
  }

  MPT.simpleTool({
    transform: convert,
    sample: SAMPLE,
    errorPrefix: "Conversion failed",
    downloadName: function (opts) {
      var input = document.getElementById("t-input");
      var dir = opts.direction === "auto"
        ? (detect(input ? input.value : "") === "json" ? "json2yaml" : "yaml2json")
        : opts.direction;
      return dir === "json2yaml" ? "openapi.yaml" : "openapi.json";
    },
    emptyMessage: "Paste an OpenAPI or Swagger document, or press “Load example”."
  });
})();
