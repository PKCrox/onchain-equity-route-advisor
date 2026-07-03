# Onchain Equity Route Advisor

<p align="center">
  <strong>Execution-readiness intelligence for tokenized equities.</strong>
</p>

<p align="center">
  <a href="https://github.com/PKCrox/onchain-equity-route-advisor/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/PKCrox/onchain-equity-route-advisor?label=skill%20zip"></a>
  <a href="https://github.com/PKCrox/onchain-equity-route-advisor"><img alt="Agent Skill" src="https://img.shields.io/badge/Agent%20Skill-Claude%20%2F%20Codex-111827"></a>
  <a href="#global-mode"><img alt="Global mode" src="https://img.shields.io/badge/mode-global%20route%20scan-7c3aed"></a>
  <a href="#mantle-route-readiness"><img alt="Mantle route readiness" src="https://img.shields.io/badge/Mantle-route%20readiness-00b894"></a>
  <a href="#case-study-spcxx"><img alt="SPCXx case study" src="https://img.shields.io/badge/SPCXx-case%20study-2563eb"></a>
</p>

Built for **Mantle Research Challenge Track 2**, this repository packages an Agent Skill and deterministic CLI that answer a simple question users actually care about:

> If I want tokenized equity exposure, where can I buy it, how much will it cost at 1k / 5k / 10k size, and what am I really holding?

The answer is not just a price quote. It requires order-book depth, spread, fees, funding history, product classification, onchain route availability, RFQ status, and a clear distinction between "deployed" and "execution-ready."

This project turns that into a repeatable research workflow for Claude, Codex, and other Agent Skills-compatible runtimes.

## Submission Links

| Artifact | Link |
|---|---|
| X submission post | https://x.com/chanthebob/status/2073061744851976395 |
| GitHub repository | https://github.com/PKCrox/onchain-equity-route-advisor |
| Latest skill ZIP | https://github.com/PKCrox/onchain-equity-route-advisor/releases/latest |
| Primary demo mode | Global route scan across discoverable tokenized equities |
| Worked case study | SPCXx route comparison across CEX spot, perps, and Mantle onchain routes |

## At A Glance

| Reviewer question | What this project gives you |
|---|---|
| What does it do? | Compares tokenized-stock holding routes by execution cost, product type, funding, liquidity, and Mantle route readiness. |
| Why is it useful? | It separates "asset issued" from "route can actually execute at my size." |
| How was it built? | Agent Skill instructions plus deterministic Node adapters for CEX order books, perp funding, Mantle metadata, Fluxion quotes, Merchant Moe LBQuoter, and pool telemetry. |
| What is the working case? | The skill supports global scans; SPCXx is the fully documented case because it touches CEX spot, perps, Mantle deployment, Fluxion, Merchant Moe, and RFQ status. |
| What is the Mantle-specific contribution? | A fallback chain that does not stop at public quote failure: deployment metadata -> Fluxion preflight -> direct LBQuoter RPC -> telemetry/RFQ status -> size-specific verdict. |

## Why This Exists

Tokenized stock research often stops at the wrong layer:

- the ticker exists,
- the asset is deployed,
- a pool is visible,
- a public quote endpoint returns either success or failure.

That is useful, but it does not answer the user question.

A real user asks:

> Can I buy 1,000, 5,000, or 10,000 USD of this tokenized equity right now, through which route, at what total cost, and with what trade-offs?

`onchain-equity-route-advisor` was built for that layer. It compares CEX spot, perps, alternative RWA tokens, pre-market products, and Mantle onchain routes under the same execution-quality framework.

## Global Mode

This is not an SPCXx-only tool.

SPCXx is the worked case study because it is a high-signal example for the Mantle challenge: it has xStocks metadata, CEX markets, perp markets, a Mantle deployment, public quote behavior, Merchant Moe pool telemetry, and an authenticated RFQ layer.

The actual skill is asset-agnostic. It can run in two modes:

| Mode | Command pattern | Use case |
|---|---|---|
| Global discovery | `--symbols auto --max-symbols 12` | Scan currently discoverable tokenized-equity routes and surface candidates worth deeper research. |
| Focused investigation | `--symbols SPCXx` or comma-separated symbols | Produce a full route-quality report for a specific ticker or shortlist. |

The intended workflow is:

```text
Run global discovery
  -> find assets with active route evidence
  -> run focused checks on the interesting names
  -> compare CEX spot, perps, onchain routes, and RFQ gaps
  -> write a route-quality verdict with confidence and caveats
```

Example global smoke run:

Sample command: `--symbols auto --max-symbols 3 --sizes 1000`

The exact venues and bps values move with live order books. One sample run produced:

| Asset | Best 1k route in smoke run | 1k round-trip cost | Mantle readiness signal |
|---|---|---:|---|
| NVDAx | Bybit spot | 27.1 bps | Mantle deployment confirmed; Fluxion `NO_LIQUIDITY_POOL`; LBQuoter `NO_LB_ROUTE`; RFQ key required |
| COINx | Gate spot | 33.1 bps | Mantle deployment confirmed; Fluxion `NO_LIQUIDITY_POOL`; LBQuoter `NO_LB_ROUTE`; RFQ key required |
| AAPLx | Bybit spot | 33.0 bps | Mantle deployment confirmed; Fluxion `NO_LIQUIDITY_POOL`; LBQuoter `NO_LB_ROUTE`; RFQ key required |

This is the broader point: the skill does not only ask whether a tokenized equity exists. It asks which assets have usable distribution routes, which venues are currently executable, and where Mantle routing needs RFQ or deeper liquidity before larger-size execution can be recommended.

## What It Does

The skill separates the pieces that usually get mixed together:

- Exact xStocks spot vs alternative RWA tokens vs pre-market products
- CEX order-book depth at 1k / 5k / 10k USD size
- Round-trip execution cost in basis points
- Perp funding over 7 / 14 / 30 day windows
- Mantle deployment metadata
- Fluxion public quote preflight
- Merchant Moe LBQuoter direct Mantle RPC fallback
- xChange / RFQ authenticated-route status
- Pool telemetry vs executable quote evidence
- Data confidence, missing evidence, and route caveats

The core path is:

```text
Classify the product
  -> simulate size-specific execution cost
  -> add holding-cost and funding layers
  -> check Mantle deployment and public quote availability
  -> fallback to Merchant Moe LBQuoter via Mantle RPC
  -> separate executable quotes from pool telemetry
  -> rank only comparable, executable routes
```

## Execution Stack

| Layer | Checked evidence | Output |
|---|---|---|
| Product classification | xStocks metadata, venue symbol conventions, route labels | Exact xStocks, alternative RWA, pre-market, perp, or unavailable route |
| CEX spot execution | Public order books and default fee assumptions | 1k / 5k / 10k round-trip cost in bps |
| Perp holding cost | Funding history over 7 / 14 / 30 day windows | Synthetic exposure cost separated from spot ownership |
| Mantle deployment | xStocks deployment metadata and token address | Whether the asset is actually deployed on Mantle |
| Mantle quote preflight | Fluxion public quote response | Public quote availability or specific failure reason |
| Mantle fallback | Merchant Moe LBQuoter read via Mantle RPC | Executable onchain quote by size when available |
| Route caveats | Pool telemetry, RFQ auth status, missing data | Pass / watch / unavailable style route-quality explanation |

## Quick Start For Reviewers

Clone the repository and run a global scan:

```bash
git clone https://github.com/PKCrox/onchain-equity-route-advisor
cd onchain-equity-route-advisor
npm install

npm run advisor -- \
  --symbols auto \
  --max-symbols 12 \
  --sizes 1000,5000,10000 \
  --holding-days 7,14,30 \
  --format markdown,json \
  --output-dir artifacts/latest-auto
```

Then run the focused SPCXx case study:

```bash
npm run advisor -- \
  --symbols SPCXx \
  --sizes 1000,5000,10000 \
  --holding-days 7,14,30 \
  --format markdown,json \
  --output-dir artifacts/latest-spcxx
```

Or install it as an Agent Skill and ask:

```text
Scan discoverable tokenized-equity routes globally, then pick the strongest
case studies and compare 1000, 5000, and 10000 USD execution cost.
For Mantle routes, include deployment checks, Fluxion quotes,
Merchant Moe LBQuoter fallback, xChange/RFQ status, and route caveats.
```

The output is designed for human review, not just machine parsing:

- `report.md` - concise route verdict
- `cost-table.csv` - route-by-size cost table
- `analysis.json` - structured recommendation, confidence, warnings, and source evidence
- `mantle-route-check.md` - Mantle deployment, quote, LBQuoter, pool, and xChange evidence
- `mantle-skill-chain.md` - how the workflow maps onto Mantle Agent Skills

## Case Study: SPCXx

Sample focused run: **2026-07-04 00:14 KST**. Market data moves, so the command above should be treated as the source of truth for a fresh run.

Estimated round-trip cost in basis points:

| Route | 1k USD | 5k USD | 10k USD | Interpretation |
|---|---:|---:|---:|---|
| Bybit spot | 25.8 bps | 31.7 bps | 33.0 bps | Best exact xStocks spot route at 5k/10k in this run |
| LBank spot | 25.9 bps | 32.3 bps | 40.0 bps | Very close at 1k; weaker at 10k |
| Gate spot | 31.1 bps | 37.9 bps | 43.9 bps | Higher than Bybit/LBank across sizes |
| Bitget Pre | 29.0 bps | 37.2 bps | 43.6 bps | Cheap-looking, but pre-market exposure, not exact xStocks spot |
| Bitget RWA | 143.5 bps | 170.4 bps | 204.6 bps | Alternative RWA product, not treated as identical exposure |
| MEXC ON | 187.6 bps | 510.1 bps | 1070.6 bps | Cost expands sharply with size |
| Mantle SPCXx/USDT0 | 1924.4 bps | no executable quote | no executable quote | 1k quote found via LBQuoter; larger public route depth not found |
| Bybit Perp | 104.3 bps | 105.3 bps | 106.4 bps | Includes 30d funding; synthetic exposure |
| Binance Perp | 126.6 bps | 127.2 bps | 128.0 bps | Includes 30d funding; synthetic exposure |

The conclusion is intentionally not "pick the lowest number."

The skill explains why a route is, or is not, comparable:

- Exact xStocks spot routes can be ranked against each other.
- Pre-market and alternative RWA products may be useful, but they are not treated as identical exposure.
- Perps can look cheap at entry, but 30-day funding changes the holding-cost picture.
- A visible onchain pool is not the same as executable depth at 5k or 10k.

## Mantle Route Readiness

For SPCXx, the Mantle check found:

- SPCXx deployment on Mantle confirmed.
- xStocks metadata indicates atomic-swap support.
- Fluxion public quote returned `NO_LIQUIDITY_POOL` for 1k / 5k / 10k.
- Merchant Moe LBQuoter direct Mantle RPC fallback found an executable **1k** `USDT0 -> SPCXx` quote.
- 5k and 10k returned `NO_LB_ROUTE` through the public onchain path.
- Merchant Moe pool proxy showed about **$3.25k liquidity**, **$708 24h volume**, and **11 24h transactions** at run time.
- xChange / RFQ remained an authenticated layer requiring API-key access.

That result is more useful than a binary "works" or "fails."

It shows that Mantle has the deployment and route components needed for tokenized equity distribution, while the current public route still needs deeper liquidity or RFQ access before larger sizes can be called execution-ready.

In other words:

```text
Issuance is visible.
The 1k onchain quote path is measurable.
The 5k/10k public route is not ready yet.
The next layer is RFQ, liquidity depth, and distribution-quality monitoring.
```

That is the exact gap this skill is meant to expose and improve.

| Mantle evidence layer | SPCXx result from sample run | Why it matters |
|---|---|---|
| Deployment | Confirmed on Mantle | Issuance exists, so the route is worth checking. |
| Atomic-swap metadata | Supported in xStocks metadata | There is a designed path beyond a passive token listing. |
| Fluxion public quote | `NO_LIQUIDITY_POOL` at 1k / 5k / 10k | Public quote availability is not enough yet. |
| Merchant Moe LBQuoter | 1k executable quote found | Direct onchain reads can recover evidence that a public API did not return. |
| Larger sizes | 5k / 10k returned `NO_LB_ROUTE` | Execution readiness is size-specific. |
| Pool telemetry | About $3.25k liquidity and $708 24h volume | Telemetry is useful context, but not a substitute for executable quote depth. |
| xChange / RFQ | Authenticated access required | Larger-size routing likely belongs in the RFQ layer. |

## How This Uses Mantle Agent Skills

This project follows the role split of Mantle's official Agent Skills, then adds a tokenized-equity execution-readiness layer on top.

Official Mantle Skills reference: https://github.com/mantle-xyz/mantle-skills

| Mantle Skill Layer | Role in this advisor |
|---|---|
| `mantle-defi-operator` | Discover Mantle routes and keep the tool in compare-only mode unless executable evidence exists |
| `mantle-risk-evaluator` | Convert liquidity, slippage, funding, and partial-fill problems into clear route caveats |
| `mantle-readonly-debugger` | Preserve failed quote/RPC paths as evidence instead of hiding them |
| `mantle-data-indexer` | Extension point for pool volume, swap history, and time-windowed liquidity |
| `mantle-portfolio-analyst` | Optional wallet-specific follow-up when a user wants position-level analysis |

The added layer is deliberately practical:

```text
Public quote failure is not the end.
Try a direct onchain quoter.
Separate telemetry from executable quote.
Show which sizes work and which sizes are blocked.
```

This is why the project is a skill, not just a static dashboard. The useful output is the judgment layer between raw APIs and the final recommendation.

## Install As An Agent Skill

### Claude Code

```bash
git clone https://github.com/PKCrox/onchain-equity-route-advisor
cp -R onchain-equity-route-advisor ~/.claude/skills/
cd ~/.claude/skills/onchain-equity-route-advisor
npm install
```

### Codex

```bash
git clone https://github.com/PKCrox/onchain-equity-route-advisor
cp -R onchain-equity-route-advisor ~/.codex/skills/
cd ~/.codex/skills/onchain-equity-route-advisor
npm install
```

### claude.ai

Download the latest ZIP from Releases:

https://github.com/PKCrox/onchain-equity-route-advisor/releases

Then upload it in:

```text
Customize -> Skills -> Create skill -> Upload skill
```

Enable the skill and ask the global scan or focused comparison prompt above.

## Run A Broader Scan

```bash
npm run advisor -- \
  --symbols auto \
  --max-symbols 12 \
  --sizes 1000,5000,10000 \
  --holding-days 7,14,30 \
  --format markdown,json \
  --output-dir artifacts/latest-auto
```

## Data Sources

Default public sources include:

- Backed / xStocks public asset metadata
- Bybit spot and perp APIs
- Gate spot API
- LBank spot API
- MEXC spot API
- Bitget spot API
- Backpack public markets
- Binance USD-M Futures
- Fluxion Quote API
- Mantle RPC
- Merchant Moe LBQuoter
- DexScreener token-pairs API
- Optional Jupiter quote path

Optional environment variables:

```bash
MANTLE_RPC_URL=https://rpc.mantle.xyz
FLUXION_QUOTE_BASE_URL=https://skillapi.fluxion.network
MANTLE_QUOTE_WALLET=0x...
XSTOCKS_API_KEY=...
```

## Design Principles

- Do not rank incomparable products together without labeling the difference.
- Do not treat perps as spot ownership.
- Do not use a single current funding print as long-hold evidence.
- Do not call an onchain route cheap unless an executable quote exists for the requested size.
- Do not stop at a failed public quote if a direct read-only onchain quoter can be queried.
- Do not hide missing data; mark it as unavailable, manual-check, or authenticated-layer required.

## What This Does Not Claim

- It does not give investment advice.
- It does not claim tokenized stocks have identical legal rights across issuers.
- It does not treat pre-market or alternative RWA products as exact xStocks substitutes.
- It does not sign or broadcast Mantle transactions.
- It does not claim xChange/RFQ pricing without API-key access.

## Repository Layout

```text
SKILL.md
README.md
package.json
agents/openai.yaml
references/
  data-sources.md
  mantle-agent-skill-chain.md
  methodology.md
scripts/
  run-route-advisor.mjs
  route-advisor-core.mjs
```

## Verification

The public skill package should pass:

```bash
npm install
npm run advisor -- --help
```

The full challenge workspace also runs:

```bash
npm test
npm run validate-skill
```

## Submission Fit

Mantle Research Challenge Track 2 asks for a research agent, workflow, script, dashboard, or guide that helps people conduct onchain finance research.

This submission contributes a working Agent Skill that makes tokenized-equity distribution measurable across venues and assets:

- what the tool does: route-quality analysis for tokenized stocks,
- why it is useful: it separates issuance from execution readiness,
- how it is built: deterministic adapters plus Mantle Agent Skill-style reasoning layers,
- working case: global discovery mode, with SPCXx documented as the full Mantle route-readiness case study.

## License

MIT-style open research artifact for the Mantle Research Challenge.
