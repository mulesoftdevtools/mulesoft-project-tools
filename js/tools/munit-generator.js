/* =====================================================================
   MUnit (Mule 4 / MUnit 2.x) test suite skeleton generator
   ===================================================================== */
(function () {
  "use strict";

  var out = document.getElementById("mu-output");
  var msg = document.getElementById("mu-msg");
  var meta = document.getElementById("mu-output-meta");
  if (!out) return;

  var F = {
    flow: document.getElementById("mu-flow"),
    testName: document.getElementById("mu-test-name"),
    description: document.getElementById("mu-description"),
    payload: document.getElementById("mu-payload"),
    mockOn: document.getElementById("mu-mock-on"),
    mockProcessor: document.getElementById("mu-mock-processor"),
    mockPayload: document.getElementById("mu-mock-payload"),
    assertPayload: document.getElementById("mu-assert-payload"),
    assertStatus: document.getElementById("mu-assert-status")
  };

  function xmlAttr(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
  }

  function slug(value) {
    return String(value || "").trim().toLowerCase()
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }

  function generate() {
    MPT.clearMsg(msg);

    var flow = F.flow.value.trim();
    if (!flow) {
      out.textContent = "";
      if (meta) meta.textContent = "";
      MPT.showMsg(msg, "A flow name is required — it is what the generated test will flow-ref.", "warn");
      F.flow.focus();
      return;
    }

    var flowSlug = slug(flow) || "flow";
    var testName = slug(F.testName.value) || (flowSlug + "-test");
    var description = F.description.value.trim();
    var payload = F.payload.value.trim();
    var mockOn = F.mockOn.checked;
    var mockProcessor = F.mockProcessor.value.trim();
    var mockPayload = F.mockPayload.value.trim();
    var assertPayload = F.assertPayload.value.trim();
    var assertStatus = F.assertStatus.value.trim();

    var notes = [];
    var behaviour = [];

    if (mockOn) {
      if (!mockProcessor) {
        notes.push("Mocking was ticked but no processor was named, so no mock-when block was written.");
      } else {
        var mock = '        <munit-tools:mock-when processor="' + xmlAttr(mockProcessor) + '">\n';
        mock += '            <munit-tools:with-attributes>\n';
        mock += '                <munit-tools:with-attribute whereValue="#[\'REPLACE_ME\']" attributeName="doc:name" />\n';
        mock += '            </munit-tools:with-attributes>\n';
        if (mockPayload) {
          mock += '            <munit-tools:then-return>\n';
          mock += '                <munit-tools:payload value="#[' + xmlAttr(mockPayload) + ']" />\n';
          mock += '            </munit-tools:then-return>\n';
        }
        mock += '        </munit-tools:mock-when>';
        behaviour.push(mock);
        notes.push("Replace REPLACE_ME in with-attribute with the doc:name of the processor you are mocking, " +
                   "or delete the with-attributes block to mock every processor of that type.");
      }
    }

    if (payload) {
      behaviour.push(
        '        <munit-tools:set-event>\n' +
        '            <munit-tools:payload value="#[' + xmlAttr(payload) + ']" />\n' +
        '        </munit-tools:set-event>'
      );
    }

    var validation = [];
    if (assertPayload) {
      validation.push('        <munit-tools:assert-that expression="#[payload]"\n' +
                      '                                 is="#[MunitTools::equalTo(' + xmlAttr(assertPayload) + ')]"\n' +
                      '                                 message="Payload did not match the expected value" />');
    }
    if (assertStatus) {
      if (!/^\d{3}$/.test(assertStatus)) {
        notes.push("“" + assertStatus + "” does not look like a three-digit HTTP status code, but it was written out as given.");
      }
      validation.push('        <munit-tools:assert-that expression="#[attributes.statusCode]"\n' +
                      '                                 is="#[MunitTools::equalTo(' + xmlAttr(assertStatus) + ')]"\n' +
                      '                                 message="Unexpected HTTP status code" />');
    }
    if (!validation.length) {
      validation.push('        <munit-tools:assert-that expression="#[payload]"\n' +
                      '                                 is="#[MunitTools::notNullValue()]"\n' +
                      '                                 message="The flow returned a null payload" />');
      notes.push("No assertions were supplied, so a not-null payload assertion was added as a starting point.");
    }

    var xml = '<?xml version="1.0" encoding="UTF-8"?>\n\n' +
      '<mule xmlns:munit="http://www.mulesoft.org/schema/mule/munit"\n' +
      '      xmlns:munit-tools="http://www.mulesoft.org/schema/mule/munit-tools"\n' +
      '      xmlns="http://www.mulesoft.org/schema/mule/core"\n' +
      '      xmlns:doc="http://www.mulesoft.org/schema/mule/documentation"\n' +
      '      xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"\n' +
      '      xsi:schemaLocation="http://www.mulesoft.org/schema/mule/core\n' +
      '                          http://www.mulesoft.org/schema/mule/core/current/mule.xsd\n' +
      '                          http://www.mulesoft.org/schema/mule/munit\n' +
      '                          http://www.mulesoft.org/schema/mule/munit/current/mule-munit.xsd\n' +
      '                          http://www.mulesoft.org/schema/mule/munit-tools\n' +
      '                          http://www.mulesoft.org/schema/mule/munit-tools/current/mule-munit-tools.xsd">\n\n' +
      '    <munit:config name="' + xmlAttr(flowSlug) + '-test-suite.xml" />\n\n' +
      '    <munit:test name="' + xmlAttr(testName) + '"' +
      (description ? '\n               description="' + xmlAttr(description) + '"' : "") + '>\n' +
      (behaviour.length ? '        <munit:behavior>\n' + behaviour.join("\n") + '\n        </munit:behavior>\n\n' : "") +
      '        <munit:execution>\n' +
      '            <flow-ref name="' + xmlAttr(flow) + '" doc:name="Call ' + xmlAttr(flow) + '" />\n' +
      '        </munit:execution>\n\n' +
      '        <munit:validation>\n' +
      validation.join("\n") + "\n" +
      '        </munit:validation>\n' +
      '    </munit:test>\n\n' +
      '</mule>\n';

    out.textContent = xml;
    if (meta) meta.textContent = MPT.textStats(xml);

    var base = "Generated. Save as src/test/munit/" + flowSlug + "-test-suite.xml in your Mule project.";
    if (notes.length) MPT.showMsg(msg, base + "\n\nNotes:\n• " + notes.join("\n• "), "warn");
    else MPT.showMsg(msg, base, "ok");
  }

  document.getElementById("mu-run").addEventListener("click", generate);

  document.getElementById("mu-clear").addEventListener("click", function () {
    Object.keys(F).forEach(function (k) {
      if (F[k].type === "checkbox") F[k].checked = false;
      else F[k].value = "";
    });
    out.textContent = "";
    if (meta) meta.textContent = "";
    MPT.clearMsg(msg);
    F.flow.focus();
  });

  document.getElementById("mu-sample").addEventListener("click", function () {
    F.flow.value = "get-orders-flow";
    F.testName.value = "get-orders-flow-returns-orders";
    F.description.value = "Verifies get-orders-flow returns the order list with a 200 status";
    F.payload.value = "{}";
    F.mockOn.checked = true;
    F.mockProcessor.value = "http:request";
    F.mockPayload.value = "[{ id: 1, total: 42.5 }]";
    F.assertPayload.value = "[{ id: 1, total: 42.5 }]";
    F.assertStatus.value = "200";
    generate();
  });

  document.getElementById("mu-copy").addEventListener("click", function () { MPT.copy(out.textContent); });

  document.getElementById("mu-download").addEventListener("click", function () {
    if (!out.textContent) { MPT.toast("Generate the test first"); return; }
    var name = (slug(F.flow.value) || "munit") + "-test-suite.xml";
    MPT.download(name, out.textContent, "application/xml;charset=utf-8");
  });

  // regenerate live once the required field is filled
  Object.keys(F).forEach(function (k) {
    var node = F[k];
    var evt = node.type === "checkbox" ? "change" : "input";
    node.addEventListener(evt, MPT.debounce(function () {
      if (F.flow.value.trim()) generate();
    }, 300));
  });
})();
