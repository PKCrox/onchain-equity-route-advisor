# Data Sources

## Default Public Sources

- Backed/xStocks public API: asset list, token deployments, trading halt status, and reference price data.
- Bybit V5 public market API: xStocks spot symbols, tickers, order books, linear perp order books, and funding history.
- Gate.io spot API: best-effort spot order book and ticker comparison for `SYMBOL_USDT`.
- LBank spot API: best-effort spot order book and ticker comparison for `symbol_usdt`.
- MEXC spot API: exact xStocks where listed, plus `ON` alternatives as separate products.
- Bitget spot API: `r*`, `ON`, and `PRE*` alternatives as separate products.
- Backpack public market API: best-effort USDC-quoted stock token alternatives where listed.
- Binance USD-M Futures API: best-effort perp order book and funding comparison.
- Jupiter Quote API: optional Solana route quotes when a Solana xStocks deployment and USDC route are available.
- Fluxion Quote API: Mantle exact-in quote preflight at 1k/5k/10k USD. Quote failures and error codes are kept as route-quality evidence.
- Merchant Moe LBQuoter on Mantle RPC: direct `eth_call` fallback for Mantle Liquidity Book routes when public quote APIs do not return executable output. The default quoter address is `0x501b8AFd35df20f531fF45F6f695793AC3316c85`.
- DexScreener token-pairs API: Mantle/Merchant Moe pool telemetry such as liquidity, 24h volume, and 24h tx count. This is a pool-depth proxy, not executable slippage.

## Optional Sources

- `RWA_XYZ_API_KEY`: add RWA.xyz data if available.
- `FLUXION_QUOTE_BASE_URL`: override the default Fluxion quote endpoint.
- `MANTLE_RPC_URL`: override the default Mantle RPC used for Merchant Moe LBQuoter reads.
- `MANTLE_QUOTE_WALLET`: provide a real wallet address for Fluxion quote payload generation. If absent, the tool uses a placeholder address for quote-only preflight and never executes.
- `XSTOCKS_API_KEY`: add authenticated xStocks/xChange soft quote checks if available.

## Data Quality Rules

- Treat live quote failures as missing data, not as proof that a route is bad.
- Treat public Mantle quote failures as execution-quality evidence for that endpoint and size, not as proof that every Mantle route is impossible.
- Treat Merchant Moe LBQuoter output as executable quote evidence for the requested route and size, but not as a signed transaction or guarantee of final settlement.
- Treat pool liquidity as telemetry only unless the endpoint returns executable quote output for the requested size.
- Label all timestamps and quote sources.
- Prefer executable quotes and order books over volume claims.
- Keep venue fee assumptions visible. Defaults are conservative public-retail estimates, not account-specific fee tiers.
- Keep exact xStocks, alternative RWA stock tokens, pre-market tokens, and perps in separate product classes.
- Do not let low-cost alternative products override exact products without a product-structure warning.
