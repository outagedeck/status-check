"use strict";

const fs = require("node:fs");

const API_BASE = "https://outagedeck.com/api/v1/providers";
const STATUS_RANK = Object.freeze({
  operational: 0,
  maintenance: 1,
  unknown: 1,
  degraded: 2,
  partial_outage: 3,
  major_outage: 4,
});
const FAILURE_RANK = Object.freeze({
  degraded: 2,
  outage: 3,
  major_outage: 4,
  never: Number.POSITIVE_INFINITY,
});

function normalizeProviders(value) {
  const providers = [...new Set(String(value || "")
    .split(",")
    .map((provider) => provider.trim().toLowerCase())
    .filter(Boolean))];

  if (providers.length === 0) {
    throw new Error("providers must contain at least one provider slug");
  }
  if (providers.length > 20) {
    throw new Error("providers accepts at most 20 provider slugs per check");
  }
  for (const provider of providers) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(provider)) {
      throw new Error(`invalid provider slug: ${provider}`);
    }
  }
  return providers;
}

function failureThreshold(value) {
  const normalized = String(value || "degraded").trim().toLowerCase();
  if (!(normalized in FAILURE_RANK)) {
    throw new Error("fail-on must be degraded, outage, major_outage, or never");
  }
  return FAILURE_RANK[normalized];
}

function statusRank(status) {
  return STATUS_RANK[status] ?? STATUS_RANK.unknown;
}

function shouldFail(status, threshold) {
  return statusRank(status) >= threshold;
}

function parseBoolean(value, fallback) {
  if (value === undefined || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes"].includes(normalized)) return true;
  if (["false", "0", "no"].includes(normalized)) return false;
  throw new Error(`expected a boolean, received: ${value}`);
}

function annotationEscape(value) {
  return String(value).replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
}

function writeOutput(name, value) {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (!outputFile) return;
  const delimiter = `OUTAGEDECK_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  fs.appendFileSync(outputFile, `${name}<<${delimiter}\n${value}\n${delimiter}\n`);
}

function writeStepSummary(results, operational) {
  const summaryFile = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryFile) return;
  const rows = results.map((result) => {
    const provider = result.url ? `[${result.name}](${result.url})` : result.name;
    const detail = result.error ? result.error.replaceAll("|", "\\|") : result.label;
    return `| ${provider} | \`${result.status}\` | ${detail} |`;
  });
  const body = [
    "## OutageDeck vendor status",
    "",
    operational ? "✅ No checked provider met the failure threshold." : "❌ At least one checked provider met the failure threshold.",
    "",
    "| Provider | Status | Detail |",
    "| --- | --- | --- |",
    ...rows,
    "",
    "[Review live status and configure alerts](https://outagedeck.com/stack)",
    "",
  ].join("\n");
  fs.appendFileSync(summaryFile, body);
}

async function fetchProvider(provider, apiKey) {
  const headers = {
    Accept: "application/json",
    "User-Agent": "outagedeck-status-check/1.0 (+https://github.com/outagedeck/status-check)",
  };
  if (apiKey) headers["X-API-Key"] = apiKey;

  const response = await fetch(`${API_BASE}/${encodeURIComponent(provider)}`, {
    headers,
    signal: AbortSignal.timeout(10_000),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body?.error?.message || body?.message || `HTTP ${response.status}`;
    throw new Error(message);
  }

  const data = body?.data;
  const status = data?.currentStatus?.code;
  if (!data?.name || !status) {
    throw new Error("OutageDeck returned an unexpected provider response");
  }
  return {
    provider,
    name: data.name,
    status,
    label: data.currentStatus.label || status,
    headline: data.currentStatus.headline || data.currentStatus.summary || "",
    checkedAt: data.source?.checkedAt || body?.meta?.generatedAt || null,
    url: `https://outagedeck.com/providers/${data.slug || provider}`,
  };
}

async function main() {
  try {
    const providers = normalizeProviders(process.env.INPUT_PROVIDERS);
    const threshold = failureThreshold(process.env["INPUT_FAIL-ON"]);
    const failOnError = parseBoolean(process.env["INPUT_FAIL-ON-ERROR"], true);
    const apiKey = process.env["INPUT_API-KEY"]?.trim() || "";
    const results = [];
    let failed = false;

    for (const provider of providers) {
      try {
        const result = await fetchProvider(provider, apiKey);
        results.push(result);
        const line = `${result.name}: ${result.label}${result.headline ? ` — ${result.headline}` : ""}`;
        if (shouldFail(result.status, threshold)) {
          failed = true;
          console.log(`::error title=${annotationEscape(`${result.name} status`)}::${annotationEscape(line)}`);
        } else if (result.status !== "operational") {
          console.log(`::warning title=${annotationEscape(`${result.name} status`)}::${annotationEscape(line)}`);
        } else {
          console.log(`✅ ${line}`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        results.push({ provider, name: provider, status: "error", label: "Check failed", error: message, url: null });
        console.log(`::warning title=${annotationEscape(`${provider} check failed`)}::${annotationEscape(message)}`);
        if (failOnError) failed = true;
      }
    }

    const operational = !failed;
    const summary = results.map((result) => `${result.name}: ${result.status}`).join(", ");
    writeOutput("operational", String(operational));
    writeOutput("summary", summary);
    writeOutput("results", JSON.stringify(results));
    writeStepSummary(results, operational);

    if (!operational) {
      process.exitCode = 1;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`::error title=OutageDeck status check::${annotationEscape(message)}`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  failureThreshold,
  normalizeProviders,
  parseBoolean,
  shouldFail,
  statusRank,
};
