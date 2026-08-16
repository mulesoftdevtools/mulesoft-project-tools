/* =====================================================================
   OpenAPI 3.x / Swagger 2.0 structural validator
   ===================================================================== */
(function () {
  "use strict";

  var METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"];

  var SAMPLE = [
    "openapi: 3.0.0",
    "info:",
    "  title: Sample API",
    "paths:",
    "  /users:",
    "    get:",
    "      responses:",
    "        '200':",
    "          description: OK",
    "  /users/{id}:",
    "    get:",
    "      operationId: getUser",
    "      parameters:",
    "        - name: id",
    "          in: path",
    "          schema:",
    "            type: string",
    "      responses:",
    "        '200':",
    "          description: OK",
    "          content:",
    "            application/json:",
    "              schema:",
    "                $ref: '#/components/schemas/User'",
    "  /orders/{orderId}:",
    "    get:",
    "      operationId: getUser",
    "      responses: {}"
  ].join("\n");

  function parse(text) {
    var trimmed = text.trim();
    if (trimmed.charAt(0) === "{" || trimmed.charAt(0) === "[") {
      try {
        return JSON.parse(text);
      } catch (e) {
        throw new Error("the document is not valid JSON — " + e.message);
      }
    }
    try {
      return jsyaml.load(text);
    } catch (e) {
      throw new Error("the document is not valid YAML — " + e.message);
    }
  }

  function validate(spec) {
    var issues = [];
    function add(level, path, message) { issues.push({ level: level, path: path, message: message }); }

    if (spec === null || typeof spec !== "object" || Array.isArray(spec)) {
      add("error", "$", "The document did not parse into an object.");
      return issues;
    }

    var isOas3 = typeof spec.openapi === "string";
    var isSwagger2 = typeof spec.swagger === "string";

    if (!isOas3 && !isSwagger2) {
      add("error", "$", "Missing the version field. OpenAPI 3.x needs “openapi: 3.x.x”; Swagger 2.0 needs “swagger: '2.0'”.");
    } else if (isOas3 && !/^3\.\d+\.\d+$/.test(spec.openapi) && !/^3\.\d+$/.test(spec.openapi)) {
      add("warn", "openapi", "Unusual OpenAPI version string “" + spec.openapi + "”. Expected something like 3.0.3 or 3.1.0.");
    } else if (isSwagger2 && spec.swagger !== "2.0") {
      add("warn", "swagger", "Swagger version “" + spec.swagger + "” is not 2.0.");
    }

    // ---- info ----
    if (!spec.info || typeof spec.info !== "object") {
      add("error", "info", "Missing the required “info” object.");
    } else {
      if (!spec.info.title) add("error", "info.title", "Missing the required “info.title”.");
      if (!spec.info.version) add("error", "info.version", "Missing the required “info.version”.");
      if (!spec.info.description) add("warn", "info.description", "No API description — documentation tools will render an empty summary.");
    }

    // ---- servers / host ----
    if (isOas3) {
      if (!Array.isArray(spec.servers) || !spec.servers.length) {
        add("warn", "servers", "No “servers” defined. Clients will resolve paths against the document's own URL.");
      } else {
        spec.servers.forEach(function (s, i) {
          if (!s || !s.url) add("error", "servers[" + i + "].url", "Server entry has no “url”.");
        });
      }
    } else if (isSwagger2 && !spec.host) {
      add("warn", "host", "Swagger 2.0 document declares no “host”.");
    }

    // ---- reference targets ----
    var refTargets = {};
    function collect(container, prefix) {
      if (container && typeof container === "object") {
        Object.keys(container).forEach(function (k) { refTargets[prefix + k] = true; });
      }
    }
    if (spec.components) {
      collect(spec.components.schemas, "#/components/schemas/");
      collect(spec.components.responses, "#/components/responses/");
      collect(spec.components.parameters, "#/components/parameters/");
      collect(spec.components.requestBodies, "#/components/requestBodies/");
      collect(spec.components.headers, "#/components/headers/");
      collect(spec.components.securitySchemes, "#/components/securitySchemes/");
      collect(spec.components.examples, "#/components/examples/");
    }
    collect(spec.definitions, "#/definitions/");
    collect(spec.parameters, "#/parameters/");
    collect(spec.responses, "#/responses/");

    var refs = [];
    (function walk(node, path) {
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node)) {
        node.forEach(function (child, i) { walk(child, path + "[" + i + "]"); });
        return;
      }
      if (typeof node.$ref === "string") refs.push({ ref: node.$ref, path: path });
      Object.keys(node).forEach(function (k) {
        if (k === "$ref") return;
        walk(node[k], path + "." + k);
      });
    })(spec, "$");

    refs.forEach(function (r) {
      if (r.ref.charAt(0) !== "#") {
        add("warn", r.path, "External reference “" + r.ref + "” cannot be checked here.");
      } else if (!refTargets[r.ref]) {
        add("error", r.path, "Unresolved reference “" + r.ref + "” — no such component is defined.");
      }
    });

    // ---- paths ----
    if (!spec.paths || typeof spec.paths !== "object") {
      add("error", "paths", "Missing the required “paths” object.");
      return issues;
    }

    var pathKeys = Object.keys(spec.paths);
    if (!pathKeys.length) add("error", "paths", "“paths” is empty — the API exposes no operations.");

    var operationIds = {};
    var totalOps = 0;

    pathKeys.forEach(function (p) {
      var pathItem = spec.paths[p];
      var base = "paths." + p;

      if (p.charAt(0) !== "/") add("error", base, "Path keys must start with “/”.");
      if (/\?|#/.test(p)) add("error", base, "Path must not contain a query string or fragment.");

      if (!pathItem || typeof pathItem !== "object") {
        add("error", base, "Path item is not an object.");
        return;
      }

      var templateParams = (p.match(/{([^}]+)}/g) || []).map(function (t) { return t.slice(1, -1); });
      templateParams.forEach(function (name) {
        if (!name.trim()) add("error", base, "Path contains an empty {} template placeholder.");
      });
      var dupTemplates = templateParams.filter(function (n, i) { return templateParams.indexOf(n) !== i; });
      if (dupTemplates.length) {
        add("error", base, "Path template repeats the parameter “" + dupTemplates[0] + "”.");
      }

      var pathLevelParams = Array.isArray(pathItem.parameters) ? pathItem.parameters : [];
      var methodsFound = 0;

      Object.keys(pathItem).forEach(function (key) {
        if (METHODS.indexOf(key.toLowerCase()) === -1) return;
        methodsFound++;
        totalOps++;
        var op = pathItem[key];
        var opPath = base + "." + key;

        if (!op || typeof op !== "object") {
          add("error", opPath, "Operation is not an object.");
          return;
        }

        if (op.operationId) {
          if (operationIds[op.operationId]) {
            add("error", opPath + ".operationId",
                "Duplicate operationId “" + op.operationId + "” (already used by " + operationIds[op.operationId] + ").");
          } else {
            operationIds[op.operationId] = opPath;
          }
        } else {
          add("warn", opPath + ".operationId", "No operationId — code generators derive awkward method names without it.");
        }

        if (!op.summary && !op.description) {
          add("warn", opPath, "No summary or description.");
        }

        // responses
        if (!op.responses || typeof op.responses !== "object" || !Object.keys(op.responses).length) {
          add("error", opPath + ".responses", "Operation defines no responses. At least one is required.");
        } else {
          var codes = Object.keys(op.responses);
          var hasSuccess = codes.some(function (c) { return /^2\d\d$/.test(c) || c === "default" || /^2XX$/i.test(c); });
          if (!hasSuccess) add("warn", opPath + ".responses", "No 2xx success response is described.");
          codes.forEach(function (code) {
            if (!/^([1-5]\d\d|[1-5]XX|default)$/i.test(code)) {
              add("error", opPath + ".responses." + code, "“" + code + "” is not a valid response key (expected a status code, nXX range, or “default”).");
            }
            var resp = op.responses[code];
            if (resp && typeof resp === "object" && !resp.$ref && !resp.description) {
              add("error", opPath + ".responses." + code + ".description", "Response objects require a “description”.");
            }
          });
        }

        // parameters
        var allParams = pathLevelParams.concat(Array.isArray(op.parameters) ? op.parameters : []);
        var seen = {};
        allParams.forEach(function (param, i) {
          var ppath = opPath + ".parameters[" + i + "]";
          if (!param || typeof param !== "object") {
            add("error", ppath, "Parameter entry is not an object.");
            return;
          }
          if (param.$ref) return;
          if (!param.name) add("error", ppath, "Parameter is missing “name”.");
          if (!param["in"]) add("error", ppath, "Parameter is missing “in”.");
          else if (["path", "query", "header", "cookie", "formData", "body"].indexOf(param["in"]) === -1) {
            add("error", ppath, "Parameter “in” value “" + param["in"] + "” is not valid.");
          }
          if (param["in"] === "path" && param.required !== true) {
            add("error", ppath, "Path parameter “" + (param.name || "?") + "” must set required: true.");
          }
          if (isOas3 && param["in"] && param["in"] !== "body" && !param.schema && !param.content) {
            add("warn", ppath, "Parameter “" + (param.name || "?") + "” has no schema or content.");
          }
          var sig = param["in"] + ":" + param.name;
          if (seen[sig]) add("error", ppath, "Duplicate parameter “" + param.name + "” in “" + param["in"] + "”.");
          seen[sig] = true;
        });

        // path template coverage
        var declaredPathParams = allParams
          .filter(function (x) { return x && x["in"] === "path" && x.name; })
          .map(function (x) { return x.name; });
        templateParams.forEach(function (name) {
          if (declaredPathParams.indexOf(name) === -1) {
            add("error", opPath + ".parameters",
                "Path template uses {" + name + "} but no matching path parameter is declared.");
          }
        });
        declaredPathParams.forEach(function (name) {
          if (templateParams.indexOf(name) === -1) {
            add("error", opPath + ".parameters",
                "Path parameter “" + name + "” is declared but does not appear in the path template.");
          }
        });

        if (isOas3 && op.requestBody && ["get", "delete", "head"].indexOf(key.toLowerCase()) !== -1) {
          add("warn", opPath + ".requestBody", key.toUpperCase() + " operations with a request body are widely unsupported by tooling.");
        }
        if (op.security && !Array.isArray(op.security)) {
          add("error", opPath + ".security", "“security” must be an array.");
        }
      });

      if (!methodsFound) add("warn", base, "Path item declares no HTTP methods.");
    });

    // security scheme references
    function checkSecurity(list, where) {
      if (!Array.isArray(list)) return;
      var schemes = (spec.components && spec.components.securitySchemes) || spec.securityDefinitions || {};
      list.forEach(function (entry) {
        if (!entry || typeof entry !== "object") return;
        Object.keys(entry).forEach(function (name) {
          if (!schemes[name]) add("error", where, "Security requirement “" + name + "” has no matching security scheme definition.");
        });
      });
    }
    checkSecurity(spec.security, "security");

    issues.__stats = { paths: pathKeys.length, operations: totalOps };
    return issues;
  }

  function render(issues) {
    var errors = issues.filter(function (i) { return i.level === "error"; });
    var warns = issues.filter(function (i) { return i.level === "warn"; });
    var stats = issues.__stats || { paths: 0, operations: 0 };
    var esc = MPT.escapeHtml;

    var html = '<div class="stats">' +
      '<div class="stat"><div class="stat-label">Paths</div><div class="stat-value">' + stats.paths + "</div></div>" +
      '<div class="stat"><div class="stat-label">Operations</div><div class="stat-value">' + stats.operations + "</div></div>" +
      '<div class="stat"><div class="stat-label">Errors</div><div class="stat-value" style="color:var(--danger)">' + errors.length + "</div></div>" +
      '<div class="stat"><div class="stat-label">Warnings</div><div class="stat-value" style="color:var(--warning)">' + warns.length + "</div></div>" +
      "</div>";

    if (!issues.length) return html;

    var rows = errors.concat(warns).map(function (i) {
      return "<tr><td><span class=\"pill pill-" + (i.level === "error" ? "error" : "warning") + "\">" +
        i.level.toUpperCase() + "</span></td>" +
        '<td><code class="inline">' + esc(i.path) + "</code></td>" +
        "<td>" + esc(i.message) + "</td></tr>";
    }).join("");

    html += '<div class="table-wrap"><table class="data">' +
      "<thead><tr><th>Level</th><th>Location</th><th>Finding</th></tr></thead>" +
      "<tbody>" + rows + "</tbody></table></div>";
    return html;
  }

  MPT.simpleTool({
    transform: function (text) {
      var spec = parse(text);
      var issues = validate(spec);
      var errors = issues.filter(function (i) { return i.level === "error"; }).length;
      var warns = issues.filter(function (i) { return i.level === "warn"; }).length;
      var message, type;
      if (errors) {
        message = errors + " error" + (errors === 1 ? "" : "s") + " and " + warns + " warning" + (warns === 1 ? "" : "s") + " found.";
        type = "error";
      } else if (warns) {
        message = "No errors. " + warns + " warning" + (warns === 1 ? "" : "s") + " worth reviewing.";
        type = "warn";
      } else {
        message = "Valid — no structural problems found.";
        type = "ok";
      }
      return { html: render(issues), message: message, type: type };
    },
    sample: SAMPLE,
    errorPrefix: "Could not read the document",
    emptyMessage: "Paste an OpenAPI or Swagger document to validate, or press “Load example”."
  });
})();
