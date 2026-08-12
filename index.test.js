"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildAlertsUrl,
  buildStepSummary,
  failureThreshold,
  normalizeProviders,
  parseBoolean,
  shouldFail,
  statusRank,
} = require("./index");

test("adds an attributable proactive-alert link to workflow summaries", () => {
  const summary = buildStepSummary([
    { provider: "github", name: "GitHub", status: "operational", label: "Operational", url: "https://outagedeck.com/providers/github" },
    { provider: "cloudflare", name: "Cloudflare", status: "operational", label: "Operational", url: "https://outagedeck.com/providers/cloudflare" },
  ], true);

  assert.match(summary, /Get alerts for this checked stack/);
  assert.match(summary, /stack=github%2Ccloudflare/);
  assert.match(summary, /utm_source=github_actions/);
  assert.match(summary, /utm_medium=workflow_summary/);
  assert.match(summary, /utm_campaign=status_check_alerts/);
  assert.match(summary, /utm_content=stack_handoff/);
});

test("builds a deduplicated alert handoff from successful checks", () => {
  const url = buildAlertsUrl([
    { provider: "github", status: "operational" },
    { provider: "cloudflare", status: "degraded" },
    { provider: "github", status: "operational" },
    { provider: "unknown-provider", status: "error" },
  ]);

  assert.equal(
    url,
    "https://outagedeck.com/account?stack=github%2Ccloudflare&utm_source=github_actions&utm_medium=workflow_summary&utm_campaign=status_check_alerts&utm_content=stack_handoff",
  );
});

test("caps the prefilled alert handoff at twelve successful checks", () => {
  const results = Array.from({ length: 14 }, (_, index) => ({
    provider: `provider-${index + 1}`,
    status: "operational",
  }));
  const url = new URL(buildAlertsUrl(results));

  assert.equal(url.searchParams.get("stack").split(",").length, 12);
  assert.match(buildStepSummary(results, true), /first 12 successful checks/);
});

test("falls back to the alerts guide when every provider check fails", () => {
  assert.equal(
    buildAlertsUrl([{ provider: "github", status: "error" }]),
    "https://outagedeck.com/alerts?utm_source=github_actions&utm_medium=workflow_summary&utm_campaign=status_check_alerts",
  );
});

test("normalizes and deduplicates provider slugs", () => {
  assert.deepEqual(normalizeProviders(" GitHub,aws,github "), ["github", "aws"]);
});

test("rejects empty and malformed provider input", () => {
  assert.throws(() => normalizeProviders(""), /at least one/);
  assert.throws(() => normalizeProviders("github.com"), /invalid provider slug/);
});

test("maps outage thresholds", () => {
  assert.equal(failureThreshold("degraded"), 2);
  assert.equal(failureThreshold("outage"), 3);
  assert.equal(failureThreshold("major_outage"), 4);
  assert.equal(failureThreshold("never"), Number.POSITIVE_INFINITY);
  assert.throws(() => failureThreshold("minor"), /fail-on must be/);
});

test("evaluates provider status against a threshold", () => {
  assert.equal(shouldFail("operational", 2), false);
  assert.equal(shouldFail("maintenance", 2), false);
  assert.equal(shouldFail("degraded", 2), true);
  assert.equal(shouldFail("partial_outage", 3), true);
  assert.equal(shouldFail("major_outage", 4), true);
  assert.equal(statusRank("unexpected"), statusRank("unknown"));
});

test("parses action booleans", () => {
  assert.equal(parseBoolean("yes", false), true);
  assert.equal(parseBoolean("0", true), false);
  assert.equal(parseBoolean(undefined, true), true);
  assert.throws(() => parseBoolean("sometimes", true), /expected a boolean/);
});
