/* =====================================================================
   RAML 1.0 → OpenAPI 3.0 converter (best-effort, client-side)
   ===================================================================== */
(function () {
  "use strict";

  var METHODS = ["get", "post", "put", "delete", "patch", "options", "head"];
  var PRIMITIVES = {
    string: { type: "string" },
    number: { type: "number" },
    integer: { type: "integer" },
    boolean: { type: "boolean" },
    "date-only": { type: "string", format: "date" },
    "time-only": { type: "string", format: "time" },
    "datetime": { type: "string", format: "date-time" },
    "datetime-only": { type: "string", format: "date-time" },
    file: { type: "string", format: "binary" },
    nil: { type: "string", nullable: true },
    any: {},
    array: { type: "array", items: {} },
    object: { type: "object" }
  };

  var SAMPLE = [
    "#%RAML 1.0",
    "title: Orders API",
    "version: v1",
    "baseUri: https://api.example.com/{version}",
    "mediaType: application/json",
    "description: Manages customer orders.",
    "types:",
    "  Order:",
    "    type: object",
    "    properties:",
    "      id: string",
    "      total: number",
    "      status:",
    "        type: string",
    "        enum: [NEW, PAID, SHIPPED]",
    "      note?: string",
    "/orders:",
    "  get:",
    "    displayName: List orders",
    "    description: Returns every order the caller can see.",
    "    queryParameters:",
    "      status:",
    "        type: string",
    "        required: false",
    "      limit:",
    "        type: integer",
    "    responses:",
    "      200:",
    "        body:",
    "          application/json:",
    "            type: Order[]",
    "  post:",
    "    displayName: Create order",
    "    body:",
    "      application/json:",
    "        type: Order",
    "    responses:",
    "      201:",
    "        body:",
    "          application/json:",
    "            type: Order",
    "      400:",
    "        description: Invalid payload",
    "  /{orderId}:",
    "    uriParameters:",
    "      orderId:",
    "        type: string",
    "        description: Unique order identifier",
    "    get:",
    "      displayName: Get order",
    "      responses:",
    "        200:",
    "          body:",
    "            application/json:",
    "              type: Order",
    "        404:",
    "          description: Not found",
    "    delete:",
    "      displayName: Cancel order",
    "      responses:",
    "        204:",
    "          description: Cancelled"
  ].join("\n");

  function convert(text, opts) {
    var warnings = [];
    var raw = String(text);

    if (!/^\s*#%RAML/.test(raw)) {
      warnings.push("Input does not begin with a “#%RAML 1.0” header — it was parsed as plain YAML.");
    }
    if (/!include\s/.test(raw)) {
      warnings.push("The document uses !include. External files cannot be read in the browser, so those " +
                    "references were left unresolved — flatten the RAML into one file for a complete conversion.");
    }

    var body = raw.replace(/^\s*#%RAML[^\n]*\n?/, "");
    // Neutralise RAML tags that are not valid YAML so the parser does not abort.
    body = body.replace(/!include\s+(\S+)/g, '"!include $1"');

    var doc;
    try {
      doc = jsyaml.load(body);
    } catch (e) {
      throw new Error("could not parse the RAML body as YAML — " + e.message);
    }
    if (!doc || typeof doc !== "object") {
      throw new Error("the document did not parse into an object. Check the indentation.");
    }

    var declaredTypes = (doc.types && typeof doc.types === "object") ? Object.keys(doc.types) : [];

    function schemaFor(def) {
      if (def === null || def === undefined) return {};

      if (typeof def === "string") {
        var name = def.trim();
        if (/\[\]$/.test(name)) {
          return { type: "array", items: schemaFor(name.replace(/\[\]$/, "")) };
        }
        if (name.indexOf("|") !== -1) {
          return { oneOf: name.split("|").map(function (p) { return schemaFor(p.trim()); }) };
        }
        if (declaredTypes.indexOf(name) !== -1) return { $ref: "#/components/schemas/" + name };
        if (PRIMITIVES[name]) return JSON.parse(JSON.stringify(PRIMITIVES[name]));
        return { type: "string" };
      }

      if (Array.isArray(def)) return { oneOf: def.map(schemaFor) };

      if (typeof def === "object") {
        var out = {};
        var baseType = def.type || (def.properties ? "object" : "string");

        if (typeof baseType === "string" && /\[\]$/.test(baseType)) {
          out.type = "array";
          out.items = schemaFor(baseType.replace(/\[\]$/, ""));
        } else if (typeof baseType === "string" && declaredTypes.indexOf(baseType) !== -1 && !def.properties) {
          out.$ref = "#/components/schemas/" + baseType;
          return out;
        } else if (typeof baseType === "string" && PRIMITIVES[baseType]) {
          Object.keys(PRIMITIVES[baseType]).forEach(function (k) { out[k] = PRIMITIVES[baseType][k]; });
        } else {
          out.type = "object";
        }

        if (def.description) out.description = def.description;
        if (def.enum) out.enum = def.enum;
        if (def.example !== undefined) out.example = def.example;
        if (def.pattern) out.pattern = def.pattern;
        if (def.minLength !== undefined) out.minLength = def.minLength;
        if (def.maxLength !== undefined) out.maxLength = def.maxLength;
        if (def.minimum !== undefined) out.minimum = def.minimum;
        if (def.maximum !== undefined) out.maximum = def.maximum;
        if (def["default"] !== undefined) out["default"] = def["default"];

        if (def.items !== undefined) {
          out.type = "array";
          out.items = schemaFor(def.items);
        }

        if (def.properties && typeof def.properties === "object") {
          out.type = "object";
          out.properties = {};
          var required = [];
          Object.keys(def.properties).forEach(function (key) {
            var optional = /\?$/.test(key);
            var clean = key.replace(/\?$/, "");
            var propDef = def.properties[key];
            out.properties[clean] = schemaFor(propDef);
            var explicitlyOptional = propDef && typeof propDef === "object" && propDef.required === false;
            if (!optional && !explicitlyOptional) required.push(clean);
          });
          if (required.length) out.required = required;
        }
        return out;
      }
      return {};
    }

    function paramsFrom(source, location) {
      if (!source || typeof source !== "object") return [];
      return Object.keys(source).map(function (rawName) {
        var def = source[rawName] || {};
        var optionalMark = /\?$/.test(rawName);
        var name = rawName.replace(/\?$/, "");
        if (typeof def === "string") def = { type: def };
        var required;
        if (location === "path") required = true;
        else if (def.required !== undefined) required = !!def.required;
        else required = !optionalMark;

        var param = { name: name, "in": location, required: required, schema: schemaFor(def) };
        if (def.description) param.description = def.description;
        if (def.example !== undefined) param.example = def.example;
        return param;
      });
    }

    function bodyContent(bodyDef, defaultMediaTypes) {
      var content = {};
      if (!bodyDef || typeof bodyDef !== "object") return content;

      var keys = Object.keys(bodyDef);
      var looksLikeMediaTypes = keys.some(function (k) { return k.indexOf("/") !== -1; });

      if (looksLikeMediaTypes) {
        keys.forEach(function (mt) {
          if (mt.indexOf("/") === -1) return;
          var def = bodyDef[mt] || {};
          content[mt] = { schema: schemaFor(typeof def === "string" ? def : (def.type ? def : def)) };
          if (def && def.example !== undefined) content[mt].example = def.example;
        });
      } else {
        defaultMediaTypes.forEach(function (mt) {
          content[mt] = { schema: schemaFor(bodyDef) };
        });
      }
      return content;
    }

    var globalMedia = doc.mediaType ? [].concat(doc.mediaType) : ["application/json"];

    function convertOperation(def, path, method) {
      if (typeof def !== "object" || def === null) def = {};
      var op = {};
      if (def.displayName) op.summary = def.displayName;
      if (def.description) op.description = def.description;
      op.operationId = (method + "-" + path)
        .replace(/[{}]/g, "")
        .replace(/[^A-Za-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase();

      var params = [];
      params = params.concat(paramsFrom(def.queryParameters, "query"));
      params = params.concat(paramsFrom(def.headers, "header"));
      if (params.length) op.parameters = params;

      if (def.body) {
        var content = bodyContent(def.body, globalMedia);
        if (Object.keys(content).length) op.requestBody = { content: content };
      }

      op.responses = {};
      if (def.responses && typeof def.responses === "object") {
        Object.keys(def.responses).forEach(function (code) {
          var r = def.responses[code] || {};
          if (typeof r !== "object") r = {};
          var resp = { description: r.description || defaultDescription(code) };
          if (r.body) {
            var rc = bodyContent(r.body, globalMedia);
            if (Object.keys(rc).length) resp.content = rc;
          }
          if (r.headers) {
            resp.headers = {};
            Object.keys(r.headers).forEach(function (h) {
              var hd = r.headers[h] || {};
              if (typeof hd === "string") hd = { type: hd };
              resp.headers[h.replace(/\?$/, "")] = {
                description: hd.description || undefined,
                schema: schemaFor(hd)
              };
            });
          }
          op.responses[String(code)] = resp;
        });
      }
      if (!Object.keys(op.responses).length) {
        op.responses["200"] = { description: "Successful response" };
        warnings.push(method.toUpperCase() + " " + path + " declared no responses — a default 200 was added.");
      }

      if (def.is) {
        warnings.push(method.toUpperCase() + " " + path + " applies trait(s) “" +
                      [].concat(def.is).map(traitName).join(", ") + "”, which were not expanded.");
      }
      if (def.securedBy) {
        warnings.push(method.toUpperCase() + " " + path + " uses securedBy — security schemes are not converted.");
      }
      return op;
    }

    function traitName(t) {
      if (typeof t === "string") return t;
      if (t && typeof t === "object") return Object.keys(t)[0];
      return String(t);
    }

    function defaultDescription(code) {
      var map = { "200": "OK", "201": "Created", "202": "Accepted", "204": "No content",
                  "400": "Bad request", "401": "Unauthorized", "403": "Forbidden",
                  "404": "Not found", "409": "Conflict", "500": "Server error" };
      return map[String(code)] || "Response " + code;
    }

    var paths = {};

    function walk(node, basePath) {
      Object.keys(node).forEach(function (key) {
        if (key.charAt(0) !== "/") return;
        var full = (basePath + key).replace(/\/{2,}/g, "/");
        var resource = node[key];
        if (typeof resource !== "object" || resource === null) resource = {};

        var item = paths[full] || {};

        if (resource.type) {
          warnings.push("Resource " + full + " uses resourceType “" +
                        traitName(resource.type) + "”, which was not expanded.");
        }
        if (resource.is) {
          warnings.push("Resource " + full + " applies trait(s) “" +
                        [].concat(resource.is).map(traitName).join(", ") + "”, which were not expanded.");
        }

        var uriParams = paramsFrom(resource.uriParameters, "path");
        // Any {placeholder} in the path that has no declaration still needs a parameter entry.
        var declared = uriParams.map(function (p) { return p.name; });
        (full.match(/{([^}]+)}/g) || []).forEach(function (token) {
          var name = token.slice(1, -1);
          if (declared.indexOf(name) === -1) {
            uriParams.push({ name: name, "in": "path", required: true, schema: { type: "string" } });
          }
        });
        if (uriParams.length) item.parameters = uriParams;

        METHODS.forEach(function (m) {
          if (resource[m] !== undefined) item[m] = convertOperation(resource[m], full, m);
        });

        if (Object.keys(item).length) paths[full] = item;
        walk(resource, full);
      });
    }

    walk(doc, "");

    var oas = {
      openapi: "3.0.3",
      info: {
        title: doc.title || "Converted API",
        version: String(doc.version === undefined || doc.version === null ? "1.0.0" : doc.version)
      }
    };
    if (doc.description) oas.info.description = doc.description;

    if (doc.baseUri) {
      var url = String(doc.baseUri);
      var server = { url: url.replace(/\/+$/, "") };
      var vars = url.match(/{([^}]+)}/g) || [];
      if (vars.length) {
        server.variables = {};
        vars.forEach(function (token) {
          var name = token.slice(1, -1);
          var dflt = (name === "version" && doc.version !== undefined) ? String(doc.version) : "";
          if (doc.baseUriParameters && doc.baseUriParameters[name] && doc.baseUriParameters[name]["default"] !== undefined) {
            dflt = String(doc.baseUriParameters[name]["default"]);
          }
          server.variables[name] = { "default": dflt || name };
        });
      }
      oas.servers = [server];
    } else {
      warnings.push("No baseUri was declared, so the OpenAPI document has no servers entry.");
    }

    oas.paths = paths;

    if (doc.types && typeof doc.types === "object") {
      oas.components = { schemas: {} };
      Object.keys(doc.types).forEach(function (name) {
        oas.components.schemas[name] = schemaFor(doc.types[name]);
      });
    }
    if (doc.schemas && typeof doc.schemas === "object") {
      warnings.push("The deprecated RAML “schemas” node was found. Use “types” for RAML 1.0 — it was skipped.");
    }
    if (doc.traits) warnings.push("Top-level traits were declared but are not expanded into operations.");
    if (doc.resourceTypes) warnings.push("Top-level resourceTypes were declared but are not expanded.");
    if (doc.securitySchemes) warnings.push("securitySchemes were declared but are not converted to OpenAPI securitySchemes.");

    if (!Object.keys(paths).length) {
      warnings.push("No resources were found. RAML resource keys must start with “/”.");
    }

    var opCount = 0;
    Object.keys(paths).forEach(function (p) {
      METHODS.forEach(function (m) { if (paths[p][m]) opCount++; });
    });

    var output = (opts && opts.format === "json")
      ? JSON.stringify(oas, null, 2)
      : jsyaml.dump(oas, { indent: 2, lineWidth: 120, noRefs: true, sortKeys: false });

    var summary = "Converted " + Object.keys(paths).length + " path(s) and " + opCount + " operation(s).";
    if (warnings.length) {
      return {
        output: output,
        message: summary + "\n\nNotes (" + warnings.length + "):\n• " + warnings.join("\n• "),
        type: "warn"
      };
    }
    return { output: output, message: summary, type: "ok" };
  }

  MPT.simpleTool({
    transform: convert,
    sample: SAMPLE,
    errorPrefix: "Conversion failed",
    downloadName: function (opts) { return opts.format === "json" ? "openapi.json" : "openapi.yaml"; },
    downloadMime: "text/plain;charset=utf-8",
    emptyMessage: "Paste a RAML 1.0 definition on the left, or press “Load example” to see how it works."
  });
})();
