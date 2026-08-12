const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { test } = require("node:test");
const vm = require("node:vm");

const pagePath = new URL("./index.html", `file://${__dirname}/`);

async function runPage(fetch) {
  const page = await readFile(pagePath, "utf8");
  const script = page.match(/<script>([\s\S]+)<\/script>/)?.[1];
  assert.ok(script, "page script should be present");

  const nodes = new Map();
  for (const id of [
    "application",
    "database",
    "ingestion",
    "origin",
    "checked-at",
    "response-time",
    "state-label",
    "recheck",
  ]) {
    nodes.set(`#${id}`, {
      disabled: false,
      textContent: "",
      addEventListener() {},
    });
  }

  const body = { dataset: {} };
  vm.runInNewContext(script, {
    Date,
    Error,
    fetch,
    performance: { now: () => 100 },
    document: {
      body,
      querySelector(selector) {
        return nodes.get(selector);
      },
    },
  });
  await new Promise((resolve) => setImmediate(resolve));

  return { body, nodes };
}

test("external health page keeps the availability boundary explicit", async () => {
  const page = await readFile(pagePath, "utf8");

  assert.match(page, /served by GitHub Pages, outside/);
  assert.match(page, /https:\/\/outagedeck\.com\/api\/health/);
  assert.match(page, /cache: "no-store"/);
  assert.match(page, /database\?\.reachable === true/);
  assert.match(page, /ingestion\?\.stale === false/);
  assert.match(page, /OutageDeck could not be reached/);
  assert.match(page, /GitHub-hosted run history/);
  assert.match(page, /utm_campaign=external_health_page/);
  assert.match(
    page,
    /\/stack\?p=github%2Ccloudflare%2Copenai%2Canthropic%2Creddit/,
  );
  assert.match(page, /utm_content=five_provider_stack/);
  assert.doesNotMatch(page, /—/);
});

test("external health page reports a complete healthy path", async () => {
  const result = await runPage(async () => ({
    ok: true,
    json: async () => ({
      ok: true,
      status: "ok",
      time: "2026-08-12T18:00:00Z",
      dataMode: "database",
      database: { reachable: true },
      ingestion: { stale: false, ageSeconds: 8 },
      renderedData: { origin: "database" },
    }),
  }));

  assert.equal(result.body.dataset.state, "healthy");
  assert.equal(result.nodes.get("#state-label").textContent, "OutageDeck is answering");
  assert.equal(result.nodes.get("#database").textContent, "Reachable");
  assert.equal(result.nodes.get("#ingestion").textContent, "Fresh, 8 seconds old");
});

test("external health page stays useful when OutageDeck is unreachable", async () => {
  const result = await runPage(async () => {
    throw new Error("Network request failed");
  });

  assert.equal(result.body.dataset.state, "unreachable");
  assert.equal(
    result.nodes.get("#state-label").textContent,
    "OutageDeck could not be reached",
  );
  assert.equal(result.nodes.get("#application").textContent, "Network request failed");
  assert.equal(
    result.nodes.get("#database").textContent,
    "Unknown while endpoint is unreachable",
  );
});
