# Onchain Equity Route Advisor

**A Claude/Codex Agent Skill for answering one practical RWA question:**

> If I want to hold a tokenized stock such as SPCXx, where can I buy it, at what size, at what cost, and with what product risk?

Built for **Mantle Research Challenge Track 2**.

This is not an investment bot. It is an execution-readiness research layer for tokenized equities: CEX spot, perps, alternative RWA tokens, and Mantle onchain routes are compared under one repeatable method.

## 30-Second Summary

Tokenized stock research usually stops too early:

- the asset exists,
- the contract is deployed,
- a pool is visible,
- a quote API says yes or no.

That is not enough for a user deciding whether to buy and hold.

`onchain-equity-route-advisor` checks whether a route is actually usable at **1,000 / 5,000 / 10,000 USD** size, separates spot from perps and lookalike RWA products, adds funding history for perps, and falls back from public Mantle quote APIs to direct onchain quoter reads when needed.

The key design:

```text
Tokenized equity route
  -> classify product type
  -> simulate size-specific execution cost
  -> add holding-cost layer
  -> check Mantle deployment and public quote route
  -> fallback to Merchant Moe LBQuoter on Mantle RPC
  -> separate executable quote from pool telemetry
  -> rank only comparable, executable routes
```

## Judge Quick Start

Clone it and run the skill directly:

```bash
git clone https://github.com/PKCrox/onchain-equity-route-advisor
cd onchain-equity-route-advisor
npm install

npm run advisor -- \
  --symbols SPCXx \
  --sizes 1000,5000,10000 \
  --holding-days 7,14,30 \
  --format markdown,json \
  --output-dir artifacts/latest-spcxx
```

Or install it as an Agent Skill and ask:

```text
Compare SPCXx routes for 1000, 5000, and 10000 USD.
Include CEX spot, perps with 7/14/30 day funding, Mantle deployment checks,
Fluxion quotes, Merchant Moe LBQuoter fallback, xChange auth status,
and a concise long-hold verdict.
```

The run emits:

- `report.md` - human-readable verdict
- `cost-table.csv` - route-by-size bps table
- `analysis.json` - structured recommendation and warnings
- `mantle-route-check.md` - Mantle deployment, quote, LBQuoter, pool, and xChange evidence
- `mantle-skill-chain.md` - how the workflow maps onto Mantle Agent Skills

## Live Example: SPCXx

Sample focused run: **2026-07-04 00:14 KST**. Re-run the command above to refresh the market data.

Costs below are estimated round-trip costs in basis points for buying and later exiting the same notional size.

| Route | 1k USD | 5k USD | 10k USD | What it means |
|---|---:|---:|---:|---|
| Bybit spot | 25.8 bps | 31.7 bps | 33.0 bps | Best exact xStocks spot route at 5k/10k in this run |
| LBank spot | 25.9 bps | 32.3 bps | 40.0 bps | Very close at 1k; weaker at 10k |
| Gate spot | 31.1 bps | 37.9 bps | 43.9 bps | Higher than Bybit/LBank across sizes |
| Bitget Pre | 29.0 bps | 37.2 bps | 43.6 bps | Pre-market product, not exact xStocks spot |
| Bitget RWA | 143.5 bps | 170.4 bps | 204.6 bps | Alternative RWA product, not treated as identical exposure |
| MEXC ON | 187.6 bps | 510.1 bps | 1070.6 bps | Cost expands sharply with size |
| Mantle SPCXx/USDT0 | 1924.4 bps | no executable quote | no executable quote | 1k quote found via LBQuoter; larger public route depth not found |
| Bybit Perp | 104.3 bps | 105.3 bps | 106.4 bps | Includes 30d funding; synthetic exposure |
| Binance Perp | 126.6 bps | 127.2 bps | 128.0 bps | Includes 30d funding; synthetic exposure |

The point is not "pick the lowest number." The skill explains why each route belongs, or does not belong, in the same comparison set:

- Exact xStocks spot routes are comparable with each other.
- Pre-market and alternative RWA products are not assumed to be identical.
- Perps are not spot ownership; funding history changes the long-hold cost.
- Onchain pool visibility is not the same as executable depth at 5k or 10k.

## Mantle Result

For SPCXx, the Mantle route check found:

- SPCXx Mantle deployment confirmed.
- xStocks metadata indicated atomic-swap support.
- Fluxion public quote returned `NO_LIQUIDITY_POOL` for 1k / 5k / 10k.
- Merchant Moe LBQuoter direct Mantle RPC fallback found an executable **1k** `USDT0 -> SPCXx` quote.
- 5k and 10k returned `NO_LB_ROUTE` in the public onchain path.
- Merchant Moe pool proxy showed about **$3.25k liquidity**, **$708 24h volume**, and **11 24h transactions** at run time.
- xChange/RFQ remained an authenticated layer requiring API-key access.

So the result was not reduced to "Mantle works" or "Mantle fails." It was classified as:

> Mantle SPCXx is deployed and a 1k public onchain quote can be read through LBQuoter, but larger public-route depth was not available in this run. Larger sizes should be routed through RFQ or deeper liquidity before being recommended as execution-ready.

That is exactly the missing middle layer this skill adds: **deployment -> execution readiness -> size-specific route quality**.

## How It Uses Mantle Agent Skills

This project follows the role split of Mantle's Agent Skills and adds a route-quality layer for tokenized equities.

| Mantle Skill Layer | Role in this advisor |
|---|---|
| `mantle-defi-operator` | Route discovery and compare-only execution boundaries |
| `mantle-risk-evaluator` | Liquidity, slippage, partial-fill, funding, and product-risk caveats |
| `mantle-readonly-debugger` | Preserve quote failures and RPC read-path evidence instead of hiding them |
| `mantle-data-indexer` | Extension path for pool volume, swap history, and liquidity time windows |

The added execution-readiness layer is:

```text
Public quote failure is not the end.
Try a direct onchain quoter.
Separate telemetry from executable quote.
Show which notional sizes work and which do not.
```

This matters for Mantle because tokenized equities need more than issuance. They need transparent distribution quality: how much can be bought, where, at what cost, with which route, and when RFQ/liquidity support is required.

## What It Compares

- CEX spot order books
- 1k / 5k / 10k USD round-trip execution cost
- Perp funding over 7 / 14 / 30 day windows
- Exact xStocks vs alternative RWA tokens vs pre-market tokens
- Mantle xStocks deployment metadata
- Fluxion public quote preflight
- Merchant Moe LBQuoter direct Mantle RPC fallback
- xStocks xChange / RFQ authentication status
- Pool telemetry vs executable quote evidence
- Data-confidence and route caveats

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

Download the latest skill ZIP from Releases:

https://github.com/PKCrox/onchain-equity-route-advisor/releases

Then upload it in:

```text
Customize -> Skills -> Create skill -> Upload skill
```

Enable the skill and ask the same natural-language route question.

## Run A Broader Scan

Scan currently discoverable xStocks-style venues:

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

## What This Does Not Claim

- It does not give investment advice.
- It does not claim tokenized stocks have identical rights across issuers.
- It does not treat pre-market or alternative RWA tokens as exact xStocks substitutes.
- It does not treat perps as spot/token ownership.
- It does not sign or broadcast Mantle transactions.
- It does not call a route "cheap" unless executable quote or order-book evidence exists for the requested size.

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

The public skill package is expected to pass:

```bash
npm install
npm run advisor -- --help
```

The full challenge workspace also runs:

```bash
npm test
npm run validate-skill
```

## License

MIT-style open research artifact for the Mantle Research Challenge.
