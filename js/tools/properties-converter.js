/* =====================================================================
   Java/Mule .properties ⇄ YAML converter
   ===================================================================== */
(function () {
  "use strict";

  var SAMPLE = [
    "# HTTP listener configuration",
    "http.listener.host=0.0.0.0",
    "http.listener.port=8081",
    "http.listener.basePath=/api/v1",
    "",
    "# Database",
    "db.host=localhost",
    "db.port=3306",
    "db.user=mule_app",
    "db.pool.maxSize=20",
    "db.pool.enabled=true",
    "",
    "# Feature flags",
    "features.retryEnabled=false",
    "features.retryCount=3"
  ].join("\n");

  function detect(text) {
    var lines = text.split("\n").filter(function (l) {
      var t = l.trim();
      return t && t.charAt(0) !== "#" && t.charAt(0) !== "!";
    });
    if (!lines.length) return "prop";
    var propLike = 0, yamlLike = 0;
    lines.forEach(function (line) {
      if (/^\s/.test(line)) { yamlLike++; return; }
      var eq = line.indexOf("=");
      var colon = line.indexOf(":");
      if (eq !== -1 && (colon === -1 || eq < colon)) propLike++;
      else if (colon !== -1) yamlLike++;
    });
    return propLike >= yamlLike ? "prop" : "yaml";
  }

  function coerce(value) {
    var v = value.trim();
    if (v === "") return "";
    if (/^(true|false)$/i.test(v)) return /^true$/i.test(v);
    if (/^-?\d+$/.test(v) && String(parseInt(v, 10)) === v.replace(/^\+/, "")) return parseInt(v, 10);
    if (/^-?\d*\.\d+$/.test(v)) return parseFloat(v);
    return value;
  }

  function unescapeValue(v) {
    return v.replace(/\\(.)/g, function (m, c) {
      if (c === "n") return "\n";
      if (c === "t") return "\t";
      if (c === "r") return "\r";
      return c;
    });
  }

  function propertiesToYaml(text) {
    var lines = String(text).split(/\r?\n/);
    var tree = {};
    var count = 0;
    var conflicts = [];
    var pending = "";

    lines.forEach(function (rawLine) {
      var line = pending ? pending + rawLine : rawLine;
      pending = "";

      var trimmed = line.trim();
      if (!trimmed || trimmed.charAt(0) === "#" || trimmed.charAt(0) === "!") return;

      // line continuation with a trailing backslash
      if (/\\$/.test(line) && !/\\\\$/.test(line)) {
        pending = line.replace(/\\$/, "");
        return;
      }

      var match = trimmed.match(/^([^=:]+?)\s*[=:]\s*([\s\S]*)$/);
      if (!match) {
        // key with no value
        match = [null, trimmed, ""];
      }
      var key = match[1].trim();
      var value = unescapeValue(match[2]);
      if (!key) return;
      count++;

      var segments = key.split(".");
      var node = tree;
      for (var i = 0; i < segments.length - 1; i++) {
        var seg = segments[i];
        if (node[seg] === undefined) node[seg] = {};
        else if (typeof node[seg] !== "object" || node[seg] === null) {
          conflicts.push(key);
          node[seg] = { "": node[seg] };
        }
        node = node[seg];
      }
      var leaf = segments[segments.length - 1];
      if (typeof node[leaf] === "object" && node[leaf] !== null) {
        conflicts.push(key);
        node[leaf][""] = coerce(value);
      } else {
        node[leaf] = coerce(value);
      }
    });

    if (!count) throw new Error("no key=value pairs were found. Properties files use “key=value” or “key:value”.");

    var yaml = jsyaml.dump(tree, { indent: 2, lineWidth: 120, noRefs: true, sortKeys: true });
    var message = "Converted " + count + " propert" + (count === 1 ? "y" : "ies") + " into nested YAML.";
    if (conflicts.length) {
      message += "\n\nNote: these keys are used both as a value and as a parent of other keys, which YAML cannot " +
                 "represent directly — an empty-string key was used for the value: " +
                 conflicts.filter(function (v, i, a) { return a.indexOf(v) === i; }).join(", ");
      return { output: yaml, message: message, type: "warn" };
    }
    return { output: yaml, message: message, type: "ok" };
  }

  function flatten(node, prefix, out, arrays) {
    Object.keys(node).forEach(function (key) {
      var value = node[key];
      var path = prefix ? prefix + "." + key : key;
      if (value === null || value === undefined) {
        out.push([path, ""]);
      } else if (Array.isArray(value)) {
        arrays.push(path);
        value.forEach(function (item, i) {
          if (item !== null && typeof item === "object") flatten(item, path + "[" + i + "]", out, arrays);
          else out.push([path + "[" + i + "]", String(item)]);
        });
      } else if (typeof value === "object") {
        flatten(value, path, out, arrays);
      } else {
        out.push([path, String(value)]);
      }
    });
  }

  function yamlToProperties(text) {
    var doc;
    try {
      doc = jsyaml.load(text);
    } catch (e) {
      throw new Error("the YAML could not be parsed — " + e.message);
    }
    if (doc === null || doc === undefined) throw new Error("the YAML document is empty.");
    if (typeof doc !== "object" || Array.isArray(doc)) {
      throw new Error("the top level of the YAML must be a mapping of keys to values.");
    }

    var pairs = [];
    var arrays = [];
    flatten(doc, "", pairs, arrays);
    if (!pairs.length) throw new Error("no leaf values were found in the YAML document.");

    var lines = pairs.map(function (p) {
      var value = p[1].replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");
      return p[0] + "=" + value;
    });

    var message = "Converted " + pairs.length + " value" + (pairs.length === 1 ? "" : "s") + " into flat properties.";
    if (arrays.length) {
      message += "\n\nNote: YAML lists have no standard properties representation. Indexed keys were used " +
                 "(name[0], name[1], …) for: " + arrays.join(", ");
      return { output: lines.join("\n") + "\n", message: message, type: "warn" };
    }
    return { output: lines.join("\n") + "\n", message: message, type: "ok" };
  }

  MPT.simpleTool({
    transform: function (text, opts) {
      var direction = (opts && opts.direction) || "auto";
      if (direction === "auto") direction = detect(text) === "prop" ? "prop2yaml" : "yaml2prop";
      return direction === "prop2yaml" ? propertiesToYaml(text) : yamlToProperties(text);
    },
    sample: SAMPLE,
    errorPrefix: "Conversion failed",
    downloadName: function (opts) {
      var node = document.getElementById("t-input");
      var dir = opts.direction === "auto"
        ? (detect(node ? node.value : "") === "prop" ? "prop2yaml" : "yaml2prop")
        : opts.direction;
      return dir === "prop2yaml" ? "config.yaml" : "config.properties";
    },
    emptyMessage: "Paste a .properties or YAML configuration, or press “Load example”."
  });
})();
