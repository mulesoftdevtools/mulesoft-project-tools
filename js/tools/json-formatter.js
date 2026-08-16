/* =====================================================================
   JSON formatter / beautifier / minifier
   ===================================================================== */
(function () {
  "use strict";

  var SAMPLE = '{"orderId":"A-1001","customer":{"id":42,"name":"Ada Lovelace","email":"ada@example.com"},' +
    '"items":[{"sku":"WID-1","qty":2,"price":19.99},{"sku":"GAD-7","qty":1,"price":249}],' +
    '"total":288.98,"paid":true,"notes":null,"tags":["priority","eu"]}';

  function sortDeep(value) {
    if (Array.isArray(value)) return value.map(sortDeep);
    if (value && typeof value === "object") {
      var out = {};
      Object.keys(value).sort().forEach(function (k) { out[k] = sortDeep(value[k]); });
      return out;
    }
    return value;
  }

  function describe(value) {
    var objects = 0, arrays = 0, keys = 0, maxDepth = 0;
    (function walk(node, depth) {
      if (depth > maxDepth) maxDepth = depth;
      if (Array.isArray(node)) {
        arrays++;
        node.forEach(function (c) { walk(c, depth + 1); });
      } else if (node && typeof node === "object") {
        objects++;
        Object.keys(node).forEach(function (k) { keys++; walk(node[k], depth + 1); });
      }
    })(value, 1);
    return { objects: objects, arrays: arrays, keys: keys, depth: maxDepth };
  }

  MPT.simpleTool({
    transform: function (text, opts) {
      var parsed;
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        throw new Error(window.MPT_JSON_ERROR ? window.MPT_JSON_ERROR(e, text) : e.message);
      }

      if (opts.sort) parsed = sortDeep(parsed);

      var indent = opts.indent || "2";
      var output;
      if (indent === "minify") output = JSON.stringify(parsed);
      else if (indent === "tab") output = JSON.stringify(parsed, null, "\t");
      else output = JSON.stringify(parsed, null, parseInt(indent, 10) || 2);

      var stats = describe(parsed);
      var saved = "";
      if (indent === "minify") {
        var before = text.length, after = output.length;
        if (before > after) {
          saved = " Minifying saved " + (before - after).toLocaleString() + " characters (" +
                  Math.round(((before - after) / before) * 100) + "%).";
        }
      }

      var message = "Valid JSON — " + stats.objects + " object(s), " + stats.arrays + " array(s), " +
                    stats.keys + " key(s), max depth " + stats.depth + "." + saved;
      return { output: output, message: message, type: "ok" };
    },
    sample: SAMPLE,
    errorPrefix: "Invalid JSON",
    downloadName: "formatted.json",
    downloadMime: "application/json;charset=utf-8",
    emptyMessage: "Paste some JSON to format, or press “Load example”."
  });
})();
