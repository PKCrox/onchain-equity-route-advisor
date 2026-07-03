# Mantle AI Agent Skills Chain

This submission is a route-quality agent that wraps Mantle's official Agent Skills pattern, then adds a missing execution-readiness layer for tokenized-equity route comparison.

Official source: `https://github.com/mantle-xyz/mantle-skills`

## Skill Mapping

| Stage | Official Mantle Skill | How this route advisor uses it |
|---|---|---|
| Mantle venue discovery | `mantle-defi-operator` | Treat Mantle as `discovery_only` or `compare_only` until executable RFQ/pool evidence exists. Do not provide execution steps or router addresses in discovery mode. |
| Public quote fallback | `mantle-defi-operator` + `mantle-readonly-debugger` | If Fluxion public quote does not return an executable quote, call Merchant Moe `LBQuoter.findBestPathFromAmountIn` through Mantle RPC before declaring the route unavailable. |
| Liquidity/slippage risk | `mantle-risk-evaluator` | Convert 1k/5k/10k quote or order-book impact into pass/warn/block style caveats. Thin liquidity and missing quotes are warnings or blocks, not hidden. |
| Historical Mantle route analytics | `mantle-data-indexer` | If a Mantle subgraph or SQL endpoint is provided, query pool volume, swaps, and time-windowed liquidity. If no endpoint is configured, label it blocked rather than inventing a URL. |
| Wallet-specific follow-up | `mantle-portfolio-analyst` | Optional follow-up only when the user provides a wallet and asks whether they can execute or hold a route. |
| Read-path debugging | `mantle-readonly-debugger` | Use when Mantle quotes fail, RPC reads disagree, or a quote route reverts. |

## Current Integration Level

- The CLI emits a Mantle skill-chain artifact for each run.
- The CLI emits `mantle-route-check.md`, which separates confirmed Mantle deployment metadata, Fluxion quote results, Merchant Moe LBQuoter direct RPC results, xStocks xChange auth state, and Merchant Moe pool telemetry.
- The agent's recommendation layer follows `mantle-defi-operator` discovery/compare boundaries: Mantle routes are never called cheap unless executable quote evidence exists.
- The risk language follows `mantle-risk-evaluator`: high slippage, missing quote, and insufficient liquidity are surfaced as route-quality warnings.
- `mantle-readonly-debugger` is used as a quote/read-path diagnostic layer: Fluxion error codes such as `NO_LIQUIDITY_POOL` remain in the output, then Merchant Moe LBQuoter RPC reads are attempted as fallback evidence.
- `mantle-data-indexer` remains optional for deeper historical analytics. DexScreener pool telemetry is labeled as a proxy and is kept separate from LBQuoter executable quote output.

## Gap This Skill Adds

The official Mantle Skills are useful for role separation: discovery, risk, read-only debugging, data indexing, and portfolio checks. The missing layer for this research use case is a size-specific execution-readiness bridge. A route advisor needs to know whether `1000`, `5000`, and `10000` USD can actually be quoted, which public endpoint failed, whether an onchain quoter succeeds, and which sizes remain blocked. This skill adds that bridge.

## Submission Claim

Use this wording:

> The tool is implemented as an Agent Skill that chains Mantle's official AI Agent Skills, then adds an execution-readiness layer: Fluxion public quote preflight, Merchant Moe LBQuoter direct RPC fallback, size-specific liquidity/slippage checks, and xChange/RFQ authentication status.

Do not claim that the tool executed a Mantle transaction, signed anything, or queried a private Mantle indexer unless that actually happened.
