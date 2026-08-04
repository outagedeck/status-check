"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  failureThreshold,
  normalizeProviders,
  parseBoolean,
  shouldFail,
  statusRank,
} = require("./index");

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
