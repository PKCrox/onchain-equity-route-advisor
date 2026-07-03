# Methodology

## Cost Model

For CEX spot routes, simulate a market buy against asks for the requested USD size, then simulate selling the acquired units into bids. Round-trip cost equals entry fee plus execution loss plus exit fee:

`roundTripCostUsd = sizeUsd + entryFeeUsd - (grossExitUsd - exitFeeUsd)`

For perps, simulate the same order book round trip, then add cumulative long funding over each requested holding window:

`holdingCostUsd = roundTripCostUsd + sizeUsd * cumulativeFundingRate`

Positive funding is treated as a cost to long exposure; negative funding is treated as a rebate. The output must label the window and never extrapolate one funding print into a long-hold estimate.

## Ranking

Default long-hold score:

- 35% cost at the primary size, default 5000 USD
- 20% liquidity and executable depth
- 20% product suitability
- 10% self-custody or route control
- 15% data confidence

Product suitability starts high for spot tokenized stock routes, lower for CEX-custodied routes, and very low for perps when the user asks for long-term holding. Unavailable routes are not ranked even if their theoretical product fit is high.

## Data Confidence

Data confidence combines executable order book quality, timestamp freshness, complete fill at the requested size, ticker availability, funding history for perps, fee assumptions, and product comparability.

Confidence caps prevent overclaiming:

- Exact CEX xStocks spot routes cap at 90 because account fees and custody/product terms are still assumptions.
- Perp routes cap at 82 because they are synthetic exposure even when market data is strong.
- Alternative tokenized-stock routes cap at 72 because issuer, redemption, and rights differ from xStocks.
- Pre-market alternatives cap at 55.
- Manual-check routes remain low until executable quotes are available.

Reference price uses Backed/xStocks price data only when `ENABLE_BACKED_PRICE=1` is set and the endpoint responds. Otherwise use the median mid-price across executable exact spot venues, then executable market median, then Bybit ticker fallback.

## Interpretation

- `best`: executable route with the strongest score for the user intent.
- `watch`: usable but weaker due to cost, thin depth, custody tradeoff, or stale data.
- `avoid_for_long_hold`: usually a perp or leveraged product when the user wants stock-like holding.
- `manual_check`: potentially relevant, but public executable quote or fee data is missing.
- `unavailable`: endpoint, symbol, quote, or market data was missing.

The final recommendation should explain the top route and the main caveat in plain language. Put raw JSON/CSV in artifacts, not in the user-facing answer.
