---
name: onchain-equity-route-advisor
description: Compare tokenized stock and onchain equity holding routes across CEX spot, perps, and onchain RWA venues. Use when a user asks where to buy or hold xStocks such as SPCXx, how much 1000/5000/10000 USD execution costs, whether Bybit/Mantle/perps are suitable for long-term holding, or how to produce a Mantle Research Challenge style route-quality report.
---

# Onchain Equity Route Advisor

## Overview

Use this skill to answer tokenized-equity route questions with a deterministic middle-layer pipeline before writing the final recommendation. The goal is not to dump every raw market datum; the goal is to turn quotes, order books, funding history, and product-risk checks into a concise execution/holding route verdict.

## Try It

When this skill is installed in Claude Code, Codex, or another Agent Skills-compatible runtime, ask naturally:

```text
Compare SPCXx routes for 1000, 5000, and 10000 USD. Include CEX spot, perps with 7/14/30 day funding, Mantle deployment checks, Fluxion quotes, Merchant Moe LBQuoter fallback, xChange auth status, and a concise long-hold verdict.
```

The agent should load this skill, run the bundled route-advisor script from this skill folder, and return the generated verdict.

For a direct live SPCXx check from the skill folder:

```bash
npm install
npm run advisor -- \
  --symbols SPCXx \
  --sizes 1000,5000,10000 \
  --holding-days 7,14,30 \
  --format markdown,json \
  --output-dir artifacts/latest-spcxx
```

For a broader scan over currently discoverable Bybit xStocks:

```bash
npm run advisor -- \
  --symbols auto \
  --max-symbols 12 \
  --sizes 1000,5000,10000 \
  --holding-days 7,14,30 \
  --format markdown,json \
  --output-dir artifacts/latest-auto
```

Key output files:

- `report.md`: human-readable verdict and cost table.
- `cost-table.csv`: route-by-size cost rows.
- `analysis.json`: structured recommendation, confidence, and warning data.
- `mantle-route-check.md`: Mantle-specific deployment, quote, LBQuoter, pool, and xChange evidence.
- `mantle-skill-chain.md`: how the run used and extended Mantle Agent Skills.

## Default Workflow

1. Classify the user intent.
   - `long-hold`: prioritize spot/token ownership, cumulative cost, liquidity, custody, redemption, and issuer risk.
   - `short-trade`: prioritize executable spread, depth, latency, and taker fees.
   - `self-custody`: prioritize onchain route availability, bridge/withdrawal path, and token contract provenance.
   - `perp-hedge`: allow perps, but explain funding and liquidation risk.

2. Run the CLI unless the user explicitly only wants methodology.
   If the skill folder has not installed its local dependencies yet, run `npm install` in this skill folder first.
   ```bash
   node scripts/run-route-advisor.mjs \
     --symbols auto \
     --sizes 1000,5000,10000 \
     --holding-days 7,14,30 \
     --format markdown,json \
     --output-dir artifacts/latest
   ```

3. Use the route layers in order.
   - Reference price: Backed/xStocks price data.
   - Venue discovery: xStocks deployments, Bybit/Gate/LBank/MEXC xStocks spot, MEXC/Bitget/Backpack alternatives, Bybit/Binance perps, Jupiter onchain route if available.
   - Execution quality: order book or quote simulation at the requested USD sizes.
   - Holding cost: entry/exit execution plus fees; for perps include funding history over the requested windows.
   - Suitability: distinguish exact xStocks spot, alternative RWA stock tokens, pre-market alternatives, perp exposure, leveraged ETF, and unavailable/unverified routes.
   - Data confidence: score quote freshness, fill completeness, source coverage, fee assumptions, funding samples, and product comparability.
   - Mantle route check: expose Mantle xStocks deployments, atomic swap metadata, Fluxion quote results by size, Merchant Moe LBQuoter direct RPC quotes, xStocks xChange auth status, and Merchant Moe pool telemetry before any ranking.
   - Mantle Skills chain: use the official Mantle skills mapping in `references/mantle-agent-skill-chain.md` to label which Mantle AI Agent Skill handles discovery/risk/debugging, then add this skill's execution-readiness layer where public quote APIs stop.
   - Recommendation: rank only comparable executable routes; mark unavailable or stale routes as manual checks.

4. Write the final answer in a compact form.
   - Start with the best route for the user intent.
   - Include a small 1000/5000/10000 USD cost table.
   - Explain why perps are not long-hold substitutes unless the user asked for leveraged/hedged exposure.
   - Explain Mantle objectively: separate Fluxion executable quote results, Merchant Moe LBQuoter direct quotes, pool telemetry, and authenticated xChange/RFQ requirements.
   - Include a short non-advice disclaimer.

## Output Contract

Use this shape unless the user asks otherwise:

```markdown
**결론**
...

**비용 비교**
| Symbol | Best route | 1000 USD | 5000 USD | 10000 USD | Why |
...

**Mantle route check**
...

**주의할 점**
...
```

Do not present this as investment advice. Present it as execution, holding-cost, and product-structure analysis.

## Resources

- `scripts/run-route-advisor.mjs`: CLI entrypoint.
- `scripts/route-advisor-core.mjs`: reusable data adapters, cost model, ranking, and renderers.
- `references/methodology.md`: scoring, cost formulas, and interpretation rules.
- `references/data-sources.md`: public APIs and optional adapters.
- `references/mantle-agent-skill-chain.md`: how this submission uses official Mantle AI Agent Skills.

Read `references/methodology.md` before changing score weights or explaining the method. Read `references/data-sources.md` before adding or troubleshooting adapters.
Read `references/mantle-agent-skill-chain.md` before writing the challenge submission or claiming Mantle AI Agent Skills usage.

## Guardrails

- Do not choose Mantle, Bybit, or any venue because of the challenge sponsor. Rank by observed cost, liquidity, product fit, and data freshness.
- Do not use a single current funding rate as long-term evidence. Use a funding time series and label the window.
- Do not compare CEX spot and perps as if they are the same product. Perps are synthetic exposure with funding and liquidation risk.
- Do not compare xStocks and alternative RWA stock tokens as if issuer, redemption, and rights are identical.
- Do not hide missing data. Mark it as `manual_check` or `unavailable`, then explain what needs to be verified.
- Do not stop at a failed public Mantle quote API when an onchain quoter exists. Run the Mantle RPC/LBQuoter fallback and report size-specific results.
- Do not overstate shareholder rights, redemption rights, or legal access. Tokenized stocks can have issuer/custody constraints.
