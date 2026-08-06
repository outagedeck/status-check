# OutageDeck vendor status check

[![GitHub release](https://img.shields.io/github/v/release/outagedeck/status-check)](https://github.com/outagedeck/status-check/releases)

Stop burning CI minutes on an upstream outage. This GitHub Action checks the live status of the cloud and SaaS vendors your workflow depends on using [OutageDeck](https://outagedeck.com?utm_source=github&utm_medium=repository&utm_campaign=status_check), then fails or warns at the threshold you choose.

Public checks are free, keyless, and read-only. Status comes from each vendor's official status feed.

## Quick start

```yaml
name: Deploy

on:
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Check upstream dependencies
        uses: outagedeck/status-check@v1
        with:
          providers: aws,cloudflare,github,openai
          fail-on: outage

      - uses: actions/checkout@v4
      - run: ./deploy.sh
```

The action adds a provider table to the workflow summary and links every result to its live OutageDeck status page.

## Inputs

| Input | Required | Default | Description |
| --- | --- | --- | --- |
| `providers` | Yes | — | Comma-separated provider slugs. Find them in the [provider directory](https://outagedeck.com/providers?utm_source=github&utm_medium=repository&utm_campaign=status_check). |
| `fail-on` | No | `degraded` | `degraded`, `outage`, `major_outage`, or `never`. |
| `fail-on-error` | No | `true` | Fail if a slug is invalid or the status API cannot be reached. |
| `api-key` | No | — | Optional OutageDeck API key for a higher hourly quota. |

## Outputs

| Output | Description |
| --- | --- |
| `operational` | `true` when no provider met the configured failure threshold. |
| `summary` | A compact human-readable status summary. |
| `results` | JSON array with provider status, headline, source timestamp, and link. |

Use outputs when you want a warning-only preflight gate:

```yaml
- id: vendors
  uses: outagedeck/status-check@v1
  with:
    providers: github,vercel,cloudflare
    fail-on: never

- if: steps.vendors.outputs.operational == 'true'
  run: echo "Upstream services look healthy"
```

## Status thresholds

| `fail-on` | Fails for |
| --- | --- |
| `degraded` | degraded, partial outage, or major outage |
| `outage` | partial outage or major outage |
| `major_outage` | major outage only |
| `never` | never fails because of provider state |

API or configuration errors are controlled separately with `fail-on-error`.

## More ways to use OutageDeck

- [Install the cross-platform CLI](https://github.com/outagedeck/cli) with `brew install outagedeck/tap/outagedeck`
- [Install the cloud and SaaS outage-triage agent in VS Code](https://aka.ms/awesome-copilot/install/agent?url=vscode%3Achat-agent%2Finstall%3Furl%3Dhttps%3A%2F%2Fraw.githubusercontent.com%2Foutagedeck%2Fmcp%2Fmain%2F.github%2Fagents%2Fcloud-saas-outage-triage.agent.md)
- [Set up free email alerts](https://outagedeck.com/alerts?utm_source=github&utm_medium=repository&utm_campaign=status_check_alerts)
- [Check your whole stack](https://outagedeck.com/stack?utm_source=github&utm_medium=repository&utm_campaign=status_check)
- [Use the remote MCP server](https://outagedeck.com/developers/mcp?utm_source=github&utm_medium=repository&utm_campaign=status_check)
- [Build with the JSON API](https://outagedeck.com/developers/api?utm_source=github&utm_medium=repository&utm_campaign=status_check)

## License

MIT
