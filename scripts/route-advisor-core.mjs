import { createPublicClient, formatUnits, http } from 'viem';

export const DEFAULT_SIZES = [1000, 5000, 10000];
export const DEFAULT_HOLDING_DAYS = [7, 14, 30];

const DAY_MS = 24 * 60 * 60 * 1000;
const BACKED_ASSETS_URL = 'https://api.backed.fi/api/v2/public/assets';
const BACKED_PRICE_URL = (symbol) => `https://api.backed.fi/api/v2/public/assets/${encodeURIComponent(symbol)}/price-data`;
const BYBIT_BASE = 'https://api.bybit.com/v5/market';
const GATE_BASE = 'https://api.gateio.ws/api/v4';
const LBANK_BASE = 'https://api.lbkex.com/v2';
const BINANCE_FAPI = 'https://fapi.binance.com/fapi/v1';
const MEXC_BASE = 'https://api.mexc.com/api/v3';
const BITGET_BASE = 'https://api.bitget.com/api/v2';
const BACKPACK_BASE = 'https://api.backpack.exchange/api/v1';
const JUPITER_QUOTE = 'https://quote-api.jup.ag/v6/quote';
const DEFAULT_USDC_SOLANA = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const FLUXION_QUOTE_BASE = process.env.FLUXION_QUOTE_BASE_URL || 'https://skillapi.fluxion.network';
const FLUXION_EXACT_IN = `${FLUXION_QUOTE_BASE.replace(/\/$/u, '')}/quote/exact-in`;
const DEFAULT_MANTLE_QUOTE_WALLET = '0x000000000000000000000000000000000000dEaD';
const MANTLE_RPC_URL = process.env.MANTLE_RPC_URL || 'https://rpc.mantle.xyz';
const MERCHANT_MOE_LB_QUOTER = '0x501b8AFd35df20f531fF45F6f695793AC3316c85';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const MANTLE_USDT0 = Object.freeze({
  symbol: 'USDT0',
  network: 'Mantle',
  address: '0x779Ded0c9e1022225f8E0630b35a9b54bE713736',
  decimals: 6,
});
const MANTLE_CHAIN = Object.freeze({
  id: 5000,
  name: 'Mantle',
  nativeCurrency: { name: 'MNT', symbol: 'MNT', decimals: 18 },
  rpcUrls: { default: { http: [MANTLE_RPC_URL] } },
});
const LB_QUOTER_ABI = Object.freeze([{
  type: 'function',
  name: 'findBestPathFromAmountIn',
  stateMutability: 'view',
  inputs: [
    { name: 'route', type: 'address[]' },
    { name: 'amountIn', type: 'uint128' },
  ],
  outputs: [{
    name: 'quote',
    type: 'tuple',
    components: [
      { name: 'route', type: 'address[]' },
      { name: 'pairs', type: 'address[]' },
      { name: 'binSteps', type: 'uint256[]' },
      { name: 'versions', type: 'uint8[]' },
      { name: 'amounts', type: 'uint128[]' },
      { name: 'virtualAmountsWithoutSlippage', type: 'uint128[]' },
      { name: 'fees', type: 'uint128[]' },
    ],
  }],
}]);
const DEXSCREENER_TOKEN_URL = (address) => `https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(address)}`;
const XCHANGE_SOFT_QUOTE_URL = 'https://api.backed.fi/api/v2/trades/xchange/rfq/soft';

let mantleClient = null;

export const DEFAULT_FEES = Object.freeze({
  bybitSpot: 0.001,
  gateSpot: 0.001,
  lbankSpot: 0.001,
  bybitPerp: 0.00055,
  binancePerp: 0.0005,
  mexcSpot: 0.001,
  bitgetSpot: 0.001,
  backpackSpot: 0.001,
  jupiter: 0,
});

export function parseCsvNumbers(value) {
  return String(value || '')
    .split(',')
    .map((item) => Number.parseFloat(item.trim()))
    .filter((valueNumber) => Number.isFinite(valueNumber) && valueNumber > 0);
}

export function parseSymbols(value) {
  const raw = String(value || '').trim();
  if (!raw || raw.toLowerCase() === 'auto') return ['auto'];
  return raw.split(',').map((item) => normalizeXStockSymbol(item.trim())).filter(Boolean);
}

export function normalizeXStockSymbol(symbol) {
  if (!symbol) return '';
  const compact = String(symbol).replace(/[_\-\s/]/g, '').replace(/USDT$/i, '');
  if (/x$/u.test(compact)) return `${compact.slice(0, -1).toUpperCase()}x`;
  if (/X$/u.test(compact)) return `${compact.slice(0, -1).toUpperCase()}x`;
  return `${compact.toUpperCase()}x`;
}

export function bybitSpotSymbolFor(symbol) {
  return `${normalizeXStockSymbol(symbol).slice(0, -1)}XUSDT`;
}

export function gatePairFor(symbol) {
  return `${normalizeXStockSymbol(symbol).slice(0, -1)}X_USDT`;
}

export function lbankPairFor(symbol) {
  return gatePairFor(symbol).toLowerCase();
}

export function perpSymbolFor(asset, symbol) {
  const underlying = asset?.underlyingSymbol || normalizeXStockSymbol(symbol).slice(0, -1);
  return `${String(underlying).toUpperCase()}USDT`;
}

function numberOrNull(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function compactError(error) {
  const message = String(error?.shortMessage || error?.details || error?.message || error || 'unknown error')
    .split('\n')[0]
    .slice(0, 180);
  if (/RPC Request failed/i.test(message)) return 'RPC_ERROR';
  return message;
}

export async function fetchJson(url, { timeoutMs = 10000, ...fetchOptions } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, ...fetchOptions });
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) {
      const details = data?.errorCode || data?.error || data?.message || text;
      const error = new Error(`${response.status} ${response.statusText}${details ? `: ${details}` : ''}`);
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

async function safeFetchJson(url, label, options = {}) {
  const { retries = 1, ...fetchOptions } = options;
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return { ok: true, data: await fetchJson(url, fetchOptions), url, label };
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await sleep(250 * (attempt + 1));
      }
    }
  }
  return { ok: false, error: compactError(lastError), errorData: lastError?.data || null, url, label };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeOrderBook(raw) {
  const bids = (raw?.bids || raw?.b || []).map(([price, qty]) => [numberOrNull(price), numberOrNull(qty)])
    .filter(([price, qty]) => price > 0 && qty > 0)
    .sort((left, right) => right[0] - left[0]);
  const asks = (raw?.asks || raw?.a || []).map(([price, qty]) => [numberOrNull(price), numberOrNull(qty)])
    .filter(([price, qty]) => price > 0 && qty > 0)
    .sort((left, right) => left[0] - right[0]);
  return { bids, asks, timestamp: normalizeTimestamp(raw?.timestamp || raw?.ts || raw?.T || raw?.time || Date.now()) };
}

function normalizeTimestamp(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return Date.now();
  if (parsed > 10_000_000_000_000) return Math.round(parsed / 1000);
  return parsed;
}

function xStockFromBybitBase(baseCoin) {
  if (!baseCoin || !String(baseCoin).endsWith('X')) return '';
  return `${String(baseCoin).slice(0, -1).toUpperCase()}x`;
}

function indexBy(items, getter) {
  const map = new Map();
  for (const item of items) {
    const key = getter(item);
    if (key) map.set(key, item);
  }
  return map;
}

function source(label, url, ok = true, note = '') {
  return { label, url, ok, note };
}

async function collectBackedAssets(sourceLog) {
  const assets = [];
  let page = 0;
  let hasNextPage = true;
  while (hasNextPage && page < 10) {
    const url = page === 0 ? BACKED_ASSETS_URL : `${BACKED_ASSETS_URL}?page=${page}`;
    const response = await safeFetchJson(url, `Backed/xStocks assets page ${page}`);
    sourceLog.push(source(`Backed/xStocks assets page ${page}`, url, response.ok, response.error || ''));
    if (!response.ok) break;
    assets.push(...(response.data?.nodes || []));
    hasNextPage = Boolean(response.data?.page?.hasNextPage);
    page += 1;
  }
  return assets;
}

async function collectMarketCatalogs(sourceLog) {
  const [bybitInstrumentsResponse, mexcExchangeInfo, bitgetSymbols, backpackMarkets] = await Promise.all([
    safeFetchJson(`${BYBIT_BASE}/instruments-info?category=spot`, 'Bybit spot instruments'),
    safeFetchJson(`${MEXC_BASE}/exchangeInfo`, 'MEXC spot symbols'),
    safeFetchJson(`${BITGET_BASE}/spot/public/symbols`, 'Bitget spot symbols'),
    safeFetchJson(`${BACKPACK_BASE}/markets`, 'Backpack markets'),
  ]);
  sourceLog.push(source('Bybit spot instruments', `${BYBIT_BASE}/instruments-info?category=spot`, bybitInstrumentsResponse.ok, bybitInstrumentsResponse.error || ''));
  sourceLog.push(source('MEXC spot symbols', `${MEXC_BASE}/exchangeInfo`, mexcExchangeInfo.ok, mexcExchangeInfo.error || ''));
  sourceLog.push(source('Bitget spot symbols', `${BITGET_BASE}/spot/public/symbols`, bitgetSymbols.ok, bitgetSymbols.error || ''));
  sourceLog.push(source('Backpack markets', `${BACKPACK_BASE}/markets`, backpackMarkets.ok, backpackMarkets.error || ''));

  return {
    bybitSpotInstruments: bybitInstrumentsResponse.ok ? bybitInstrumentsResponse.data?.result?.list || [] : [],
    mexcSymbols: new Set((mexcExchangeInfo.ok ? mexcExchangeInfo.data?.symbols || [] : [])
      .filter((item) => item.status === '1' || item.status === 1 || item.status === 'ENABLED')
      .map((item) => item.symbol)),
    bitgetSymbols: new Set((bitgetSymbols.ok ? bitgetSymbols.data?.data || [] : [])
      .filter((item) => item.status === 'online')
      .map((item) => item.symbol)),
    backpackMarkets: new Set((backpackMarkets.ok && Array.isArray(backpackMarkets.data) ? backpackMarkets.data : [])
      .filter((item) => item.marketType === 'SPOT')
      .map((item) => item.symbol)),
  };
}

export async function collectLiveSnapshot({
  symbols = ['SPCXx'],
  maxSymbols = 12,
  sizes = DEFAULT_SIZES,
  holdingDays = DEFAULT_HOLDING_DAYS,
} = {}) {
  const generatedAt = new Date().toISOString();
  const sourceLog = [];
  const [backedAssets, catalogs] = await Promise.all([
    collectBackedAssets(sourceLog),
    collectMarketCatalogs(sourceLog),
  ]);
  const backedBySymbol = indexBy(backedAssets, (asset) => asset.symbol);

  const bybitXStockSymbols = catalogs.bybitSpotInstruments
    .filter((instrument) => instrument.status === 'Trading' && instrument.symbolType === 'xstocks')
    .map((instrument) => xStockFromBybitBase(instrument.baseCoin))
    .filter(Boolean);

  const selectedSymbols = symbols.includes('auto')
    ? bybitXStockSymbols.slice(0, maxSymbols)
    : symbols.map(normalizeXStockSymbol);
  const fallbackSymbols = selectedSymbols.length ? selectedSymbols : ['SPCXx'];
  const spotInstrumentBySymbol = indexBy(catalogs.bybitSpotInstruments, (instrument) => xStockFromBybitBase(instrument.baseCoin));

  const symbolSnapshots = [];
  for (const symbol of fallbackSymbols) {
    const asset = backedBySymbol.get(symbol) || { symbol, name: `${symbol} tokenized stock`, deployments: [] };
    let referencePrice = null;
    let referencePriceSource = null;
    if (process.env.ENABLE_BACKED_PRICE === '1') {
      const priceResponse = await safeFetchJson(BACKED_PRICE_URL(symbol), `Backed/xStocks ${symbol} price`, { timeoutMs: 5000, retries: 1 });
      sourceLog.push(source(`Backed/xStocks ${symbol} price`, BACKED_PRICE_URL(symbol), priceResponse.ok, priceResponse.error || ''));
      referencePrice = priceResponse.ok ? numberOrNull(priceResponse.data?.quote) : null;
      referencePriceSource = referencePrice == null ? null : 'Backed/xStocks price-data';
    }
    const venues = [];

    venues.push(await collectBybitSpot(symbol, spotInstrumentBySymbol.get(symbol)));
    venues.push(await collectGateSpot(symbol));
    venues.push(await collectLbankSpot(symbol));
    venues.push(...await collectMexcRoutes(symbol, catalogs.mexcSymbols));
    venues.push(...await collectBitgetRoutes(symbol, catalogs.bitgetSymbols));
    venues.push(...await collectBackpackRoutes(symbol, catalogs.backpackMarkets));
    venues.push(await collectMantleRoute(symbol, asset, sizes, sourceLog));
    venues.push(await collectBybitPerp(symbol, asset, Math.max(...holdingDays)));
    venues.push(await collectBinancePerp(symbol, asset, Math.max(...holdingDays)));
    venues.push(await collectJupiterRoute(symbol, asset, sizes));
    if (referencePrice == null) {
      const fallback = deriveReferencePrice(venues);
      referencePrice = fallback.price;
      referencePriceSource = fallback.source;
    }

    symbolSnapshots.push({
      symbol,
      name: asset.name,
      referencePrice,
      referencePriceSource,
      asset: summarizeAsset(asset),
      venues,
    });
  }

  return {
    generatedAt,
    requestedSymbols: symbols,
    sizes,
    holdingDays,
    sources: sourceLog,
    symbols: symbolSnapshots,
  };
}

export function buildSnapshotFromFixture(fixture) {
  return {
    generatedAt: fixture.generatedAt || new Date().toISOString(),
    requestedSymbols: fixture.requestedSymbols || [],
    sizes: fixture.sizes || DEFAULT_SIZES,
    holdingDays: fixture.holdingDays || DEFAULT_HOLDING_DAYS,
    sources: fixture.sources || [],
    symbols: fixture.symbols || [],
  };
}

function summarizeAsset(asset) {
  return {
    symbol: asset.symbol,
    name: asset.name,
    underlyingSymbol: asset.underlyingSymbol,
    isTradingHalted: Boolean(asset.isTradingHalted),
    deployments: (asset.deployments || []).map((deployment) => ({
      network: deployment.network,
      address: deployment.address,
      supportsAtomicSwaps: Boolean(deployment.supportsAtomicSwaps),
      stablecoins: (deployment.stablecoins || []).map((stablecoin) => ({
        symbol: stablecoin.symbol,
        network: stablecoin.network,
        address: stablecoin.address,
        decimals: stablecoin.decimals,
        supportsAtomicSwaps: Boolean(stablecoin.supportsAtomicSwaps),
      })),
    })),
  };
}

async function collectBybitSpot(symbol, instrument) {
  const marketSymbol = bybitSpotSymbolFor(symbol);
  if (!instrument) {
    return unavailableVenue('Bybit', 'cex_spot', 'spot_tokenized_stock', marketSymbol, 'Bybit xStocks spot symbol not listed');
  }
  const [bookResponse, tickerResponse] = await Promise.all([
    safeFetchJson(`${BYBIT_BASE}/orderbook?category=spot&symbol=${marketSymbol}&limit=200`, `Bybit ${marketSymbol} orderbook`),
    safeFetchJson(`${BYBIT_BASE}/tickers?category=spot&symbol=${marketSymbol}`, `Bybit ${marketSymbol} ticker`),
  ]);
  if (!bookResponse.ok) {
    return unavailableVenue('Bybit', 'cex_spot', 'spot_tokenized_stock', marketSymbol, bookResponse.error);
  }
  return {
    venue: 'Bybit',
    routeType: 'cex_spot',
    productClass: 'spot_tokenized_stock',
    status: 'ok',
    marketSymbol,
    feeRate: DEFAULT_FEES.bybitSpot,
    orderBook: normalizeOrderBook(bookResponse.data?.result || {}),
    ticker: tickerResponse.ok ? tickerResponse.data?.result?.list?.[0] || null : null,
    notes: ['CEX-custodied xStocks spot route; account fee tier may differ from default fee.'],
  };
}

async function collectGateSpot(symbol) {
  const pair = gatePairFor(symbol);
  const [bookResponse, tickerResponse] = await Promise.all([
    safeFetchJson(`${GATE_BASE}/spot/order_book?currency_pair=${pair}&limit=100`, `Gate ${pair} orderbook`),
    safeFetchJson(`${GATE_BASE}/spot/tickers?currency_pair=${pair}`, `Gate ${pair} ticker`),
  ]);
  if (!bookResponse.ok || !Array.isArray(bookResponse.data?.asks)) {
    return unavailableVenue('Gate', 'cex_spot', 'spot_tokenized_stock', pair, bookResponse.error || 'No public orderbook');
  }
  return {
    venue: 'Gate',
    routeType: 'cex_spot',
    productClass: 'spot_tokenized_stock',
    status: 'ok',
    marketSymbol: pair,
    feeRate: DEFAULT_FEES.gateSpot,
    orderBook: normalizeOrderBook(bookResponse.data),
    ticker: tickerResponse.ok ? tickerResponse.data?.[0] || null : null,
    notes: ['Best-effort public spot comparison; verify tokenized-stock terms before using.'],
  };
}

async function collectLbankSpot(symbol) {
  const pair = lbankPairFor(symbol);
  const [bookResponse, tickerResponse] = await Promise.all([
    safeFetchJson(`${LBANK_BASE}/depth.do?symbol=${pair}&size=100`, `LBank ${pair} orderbook`),
    safeFetchJson(`${LBANK_BASE}/ticker/24hr.do?symbol=${pair}`, `LBank ${pair} ticker`),
  ]);
  const book = bookResponse.data?.data;
  if (!bookResponse.ok || !Array.isArray(book?.asks)) {
    return unavailableVenue('LBank', 'cex_spot', 'spot_tokenized_stock', pair, bookResponse.error || 'No public orderbook');
  }
  return {
    venue: 'LBank',
    routeType: 'cex_spot',
    productClass: 'spot_tokenized_stock',
    status: 'ok',
    marketSymbol: pair,
    feeRate: DEFAULT_FEES.lbankSpot,
    orderBook: normalizeOrderBook(book),
    ticker: tickerResponse.ok ? tickerResponse.data?.data?.[0] || null : null,
    notes: ['Best-effort public spot comparison; verify tokenized-stock terms before using.'],
  };
}

async function collectMexcRoutes(symbol, mexcSymbols) {
  const base = normalizeXStockSymbol(symbol).slice(0, -1);
  const candidates = [
    { marketSymbol: `${base}XUSDT`, productClass: 'spot_tokenized_stock', routeType: 'cex_spot', venue: 'MEXC' },
    { marketSymbol: `${base}ONUSDT`, productClass: 'tokenized_stock_alt', routeType: 'cex_spot_alt', venue: 'MEXC ON' },
  ].filter((candidate) => mexcSymbols.has(candidate.marketSymbol));

  const routes = await Promise.all(candidates.map(async (candidate) => {
    const [bookResponse, tickerResponse] = await Promise.all([
      safeFetchJson(`${MEXC_BASE}/depth?symbol=${candidate.marketSymbol}&limit=100`, `${candidate.venue} ${candidate.marketSymbol} orderbook`),
      safeFetchJson(`${MEXC_BASE}/ticker/24hr?symbol=${candidate.marketSymbol}`, `${candidate.venue} ${candidate.marketSymbol} ticker`),
    ]);
    if (!bookResponse.ok || !Array.isArray(bookResponse.data?.asks)) {
      return unavailableVenue(candidate.venue, candidate.routeType, candidate.productClass, candidate.marketSymbol, bookResponse.error || 'No public orderbook');
    }
    return {
      venue: candidate.venue,
      routeType: candidate.routeType,
      productClass: candidate.productClass,
      status: 'ok',
      marketSymbol: candidate.marketSymbol,
      feeRate: DEFAULT_FEES.mexcSpot,
      orderBook: normalizeOrderBook(bookResponse.data),
      ticker: tickerResponse.ok ? tickerResponse.data || null : null,
      notes: candidate.productClass === 'spot_tokenized_stock'
        ? ['Best-effort MEXC xStocks spot comparison; verify product terms before using.']
        : ['Alternative tokenized-stock route, not xStocks; compare cost separately from issuer/product rights.'],
    };
  }));
  return routes;
}

async function collectBitgetRoutes(symbol, bitgetSymbols) {
  const base = normalizeXStockSymbol(symbol).slice(0, -1);
  const candidates = [
    { marketSymbol: `R${base}USDT`, productClass: 'tokenized_stock_alt', routeType: 'cex_spot_alt', venue: 'Bitget RWA' },
    { marketSymbol: `${base}ONUSDT`, productClass: 'tokenized_stock_alt', routeType: 'cex_spot_alt', venue: 'Bitget ON' },
    { marketSymbol: `PRE${base}USDT`, productClass: 'pre_market_stock_alt', routeType: 'cex_spot_alt', venue: 'Bitget Pre' },
  ].filter((candidate) => bitgetSymbols.has(candidate.marketSymbol));

  const routes = await Promise.all(candidates.map(async (candidate) => {
    const [bookResponse, tickerResponse] = await Promise.all([
      safeFetchJson(`${BITGET_BASE}/spot/market/orderbook?symbol=${candidate.marketSymbol}&type=step0&limit=100`, `${candidate.venue} ${candidate.marketSymbol} orderbook`),
      safeFetchJson(`${BITGET_BASE}/spot/market/tickers?symbol=${candidate.marketSymbol}`, `${candidate.venue} ${candidate.marketSymbol} ticker`),
    ]);
    const book = bookResponse.data?.data;
    if (!bookResponse.ok || !Array.isArray(book?.asks)) {
      return unavailableVenue(candidate.venue, candidate.routeType, candidate.productClass, candidate.marketSymbol, bookResponse.error || 'No public orderbook');
    }
    return {
      venue: candidate.venue,
      routeType: candidate.routeType,
      productClass: candidate.productClass,
      status: 'ok',
      marketSymbol: candidate.marketSymbol,
      feeRate: DEFAULT_FEES.bitgetSpot,
      orderBook: normalizeOrderBook(book),
      ticker: tickerResponse.ok ? tickerResponse.data?.data?.[0] || null : null,
      notes: ['Alternative tokenized-stock route, not xStocks; compare cost separately from issuer/product rights.'],
    };
  }));
  return routes;
}

async function collectBackpackRoutes(symbol, backpackMarkets) {
  const base = normalizeXStockSymbol(symbol).slice(0, -1);
  const marketSymbol = `${base}.US_USDC`;
  if (!backpackMarkets.has(marketSymbol)) return [];
  const [bookResponse, tickerResponse] = await Promise.all([
    safeFetchJson(`${BACKPACK_BASE}/depth?symbol=${encodeURIComponent(marketSymbol)}`, `Backpack ${marketSymbol} orderbook`),
    safeFetchJson(`${BACKPACK_BASE}/ticker?symbol=${encodeURIComponent(marketSymbol)}`, `Backpack ${marketSymbol} ticker`),
  ]);
  if (!bookResponse.ok || !Array.isArray(bookResponse.data?.asks)) {
    return [unavailableVenue('Backpack', 'cex_spot_alt', 'tokenized_stock_alt', marketSymbol, bookResponse.error || 'No public orderbook')];
  }
  return [{
    venue: 'Backpack',
    routeType: 'cex_spot_alt',
    productClass: 'tokenized_stock_alt',
    status: 'ok',
    marketSymbol,
    feeRate: DEFAULT_FEES.backpackSpot,
    orderBook: normalizeOrderBook(bookResponse.data),
    ticker: tickerResponse.ok ? tickerResponse.data || null : null,
    notes: ['Alternative tokenized-stock route quoted in USDC; verify issuer, redemption, and custody terms separately.'],
  }];
}

function deriveReferencePrice(venues) {
  const exactSpotMids = venues
    .filter((venue) => venue.status === 'ok' && venue.routeType === 'cex_spot' && venue.orderBook)
    .map((venue) => bestMid(venue.orderBook))
    .filter((value) => Number.isFinite(value));
  if (exactSpotMids.length) {
    return { price: median(exactSpotMids), source: `Executable exact-spot median (${exactSpotMids.length} venues)` };
  }
  const altSpotMids = venues
    .filter((venue) => venue.status === 'ok' && venue.orderBook)
    .map((venue) => bestMid(venue.orderBook))
    .filter((value) => Number.isFinite(value));
  if (altSpotMids.length) {
    return { price: median(altSpotMids), source: `Executable market median (${altSpotMids.length} venues)` };
  }
  const bybitTicker = venues.find((venue) => venue.venue === 'Bybit')?.ticker;
  const tickerPrice = numberOrNull(bybitTicker?.usdIndexPrice) || numberOrNull(bybitTicker?.lastPrice);
  return { price: tickerPrice, source: tickerPrice == null ? null : 'Bybit ticker fallback' };
}

function bestMid(orderBook) {
  const bid = orderBook?.bids?.[0]?.[0];
  const ask = orderBook?.asks?.[0]?.[0];
  return bid > 0 && ask > 0 ? (bid + ask) / 2 : null;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

async function collectMantleRoute(symbol, asset, sizes, sourceLog) {
  const mantleDeployment = (asset.deployments || []).find((deployment) => deployment.network === 'Mantle');
  if (!mantleDeployment) {
    return unavailableVenue('Mantle xStocks', 'onchain_rwa', 'onchain_tokenized_stock', symbol, 'No Mantle deployment in xStocks public asset list');
  }
  const stablecoins = mantleStablecoinCandidates(mantleDeployment);
  const [fluxion, merchantMoe, poolTelemetry, xChange] = await Promise.all([
    collectFluxionQuotes(symbol, mantleDeployment, stablecoins, sizes, sourceLog),
    collectMerchantMoeLbQuotes(symbol, mantleDeployment, stablecoins, sizes, sourceLog),
    collectMantlePoolTelemetry(symbol, mantleDeployment, sourceLog),
    collectXChangeSoftQuoteStatus(symbol, sizes, sourceLog),
  ]);
  const quoteBySize = mergeMantleQuoteBySize(sizes, [
    { name: 'Fluxion Quote API', quoteBySize: fluxion.quoteBySize },
    { name: 'Merchant Moe LBQuoter', quoteBySize: merchantMoe.quoteBySize },
  ]);
  const hasExecutableQuote = Object.values(quoteBySize).some((quote) => quote.status === 'ok');
  const activeStablecoins = [...new Set(Object.values(quoteBySize)
    .map((quote) => quote?.stablecoin)
    .filter(Boolean))];
  return {
    venue: 'Mantle xStocks',
    routeType: 'onchain_rwa',
    productClass: 'onchain_tokenized_stock',
    status: hasExecutableQuote ? 'ok' : 'quote_failed',
    marketSymbol: `${symbol}/${activeStablecoins.length ? activeStablecoins.join('+') : 'USDC+USDT0'} on Mantle`,
    feeRate: null,
    deployment: {
      address: mantleDeployment.address,
      supportsAtomicSwaps: Boolean(mantleDeployment.supportsAtomicSwaps),
      stablecoins: (mantleDeployment.stablecoins || []).map((stablecoin) => stablecoin.symbol),
    },
    quoteBySize,
    executionEvidence: {
      fluxion,
      merchantMoe,
      poolTelemetry,
      xChange,
    },
    notes: [
      'Mantle deployment exists in xStocks metadata.',
      Object.values(fluxion.quoteBySize).some((quote) => quote.status === 'ok')
        ? 'Fluxion public quote API returned executable quote evidence for at least one requested size.'
        : 'Fluxion public quote API was checked but did not return executable quote evidence for the requested sizes.',
      Object.values(merchantMoe.quoteBySize).some((quote) => quote.status === 'ok')
        ? 'Merchant Moe LBQuoter returned executable onchain quote evidence for at least one requested size.'
        : 'Merchant Moe LBQuoter was checked through Mantle RPC but did not return executable quote evidence for the requested sizes.',
    ],
  };
}

function mantleStablecoinCandidates(mantleDeployment) {
  const candidates = [...(mantleDeployment.stablecoins || [])]
    .filter((stablecoin) => stablecoin.address && stablecoin.decimals != null);
  if (!candidates.some((stablecoin) => stablecoin.address.toLowerCase() === MANTLE_USDT0.address.toLowerCase())) {
    candidates.push(MANTLE_USDT0);
  }
  return candidates;
}

async function collectFluxionQuotes(symbol, mantleDeployment, stablecoins, sizes, sourceLog) {
  const userPublicKey = process.env.MANTLE_QUOTE_WALLET || DEFAULT_MANTLE_QUOTE_WALLET;
  const quoteBySize = {};
  const attempts = [];
  for (const size of sizes) {
    const sizeAttempts = [];
    let selectedQuote = null;
    for (const stablecoin of stablecoins) {
      const amount = stablecoinAmount(size, stablecoin.decimals);
      const buy = await fluxionExactIn({
        inputMint: stablecoin.address,
        outputMint: mantleDeployment.address,
        amount,
        userPublicKey,
        label: `Fluxion ${symbol} ${stablecoin.symbol}->${symbol} ${size}`,
      });
      sizeAttempts.push({
        side: 'buy',
        stablecoin: stablecoin.symbol,
        amount,
        ok: buy.ok,
        errorCode: buy.errorData?.errorCode || null,
        error: buy.error || null,
      });
      if (!buy.ok || !buy.data?.outAmount) continue;

      const sell = await fluxionExactIn({
        inputMint: mantleDeployment.address,
        outputMint: stablecoin.address,
        amount: String(buy.data.outAmount),
        userPublicKey,
        label: `Fluxion ${symbol} ${symbol}->${stablecoin.symbol} ${size}`,
      });
      sizeAttempts.push({
        side: 'sell',
        stablecoin: stablecoin.symbol,
        amount: String(buy.data.outAmount),
        ok: sell.ok,
        errorCode: sell.errorData?.errorCode || null,
        error: sell.error || null,
      });
      if (!sell.ok || !sell.data?.outAmount) continue;

      const usdcBack = Number.parseFloat(sell.data.outAmount) / 10 ** stablecoin.decimals;
      selectedQuote = {
        status: 'ok',
        inputUsd: size,
        stablecoin: stablecoin.symbol,
        tokenOutRaw: String(buy.data.outAmount),
        usdcBack,
        buyPriceImpactPct: numberOrNull(buy.data.priceImpact),
        sellPriceImpactPct: numberOrNull(sell.data.priceImpact),
        source: 'Fluxion Quote API',
      };
      break;
    }
    attempts.push({ sizeUsd: size, attempts: sizeAttempts });
    quoteBySize[size] = selectedQuote || {
      status: 'unavailable',
      reason: summarizeQuoteAttempts(sizeAttempts),
      attempts: sizeAttempts,
      source: 'Fluxion Quote API',
    };
  }
  sourceLog.push(source('Fluxion public quote API', FLUXION_EXACT_IN, true, summarizeQuoteAvailability(quoteBySize)));
  return {
    status: Object.values(quoteBySize).some((quote) => quote.status === 'ok') ? 'ok' : 'no_executable_quote',
    endpoint: FLUXION_EXACT_IN,
    userPublicKeyMode: process.env.MANTLE_QUOTE_WALLET ? 'provided_wallet' : 'placeholder_quote_only',
    quoteBySize,
    attempts,
  };
}

async function fluxionExactIn({ inputMint, outputMint, amount, userPublicKey, label }) {
  return safeFetchJson(FLUXION_EXACT_IN, label, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      inputMint,
      outputMint,
      amount,
      userPublicKey,
      dynamicSlippage: false,
      slippageBps: '50',
    }),
    retries: 0,
    timeoutMs: 12000,
  });
}

async function collectMerchantMoeLbQuotes(symbol, mantleDeployment, stablecoins, sizes, sourceLog) {
  const quoteBySize = {};
  const routeCandidates = merchantMoeRouteCandidates(symbol, mantleDeployment, stablecoins);
  const attempts = [];
  for (const size of sizes) {
    const sizeAttempts = [];
    const executableQuotes = [];
    for (const candidate of routeCandidates) {
      const quote = await merchantMoeRoundTripQuote(symbol, size, candidate);
      sizeAttempts.push(...quote.attempts);
      if (quote.status === 'ok') executableQuotes.push(quote);
    }
    attempts.push({ sizeUsd: size, attempts: sizeAttempts });
    if (executableQuotes.length) {
      quoteBySize[size] = executableQuotes.sort((left, right) => right.usdcBack - left.usdcBack)[0];
    } else {
      quoteBySize[size] = {
        status: 'unavailable',
        reason: summarizeQuoteAttempts(sizeAttempts) || 'NO_LB_ROUTE',
        attempts: sizeAttempts,
        source: 'Merchant Moe LBQuoter',
      };
    }
  }
  sourceLog.push(source('Merchant Moe LBQuoter RPC', `${MANTLE_RPC_URL} -> ${MERCHANT_MOE_LB_QUOTER}`, true, summarizeQuoteAvailability(quoteBySize)));
  return {
    status: Object.values(quoteBySize).some((quote) => quote.status === 'ok') ? 'ok' : 'no_executable_quote',
    rpcUrl: MANTLE_RPC_URL,
    quoter: MERCHANT_MOE_LB_QUOTER,
    quoteBySize,
    attempts,
  };
}

function merchantMoeRouteCandidates(symbol, mantleDeployment, stablecoins) {
  const candidates = [];
  const pushCandidate = (stablecoin, path, pathSymbols) => {
    const key = path.map((address) => address.toLowerCase()).join('>');
    if (candidates.some((candidate) => candidate.key === key)) return;
    candidates.push({
      key,
      stablecoin,
      path,
      pathSymbols,
    });
  };

  for (const stablecoin of stablecoins) {
    pushCandidate(stablecoin, [stablecoin.address, mantleDeployment.address], [stablecoin.symbol, symbol]);
    if (stablecoin.address.toLowerCase() !== MANTLE_USDT0.address.toLowerCase()) {
      pushCandidate(stablecoin, [stablecoin.address, MANTLE_USDT0.address, mantleDeployment.address], [stablecoin.symbol, MANTLE_USDT0.symbol, symbol]);
    }
  }

  return candidates.sort((left, right) => {
    const leftDirectUsdt0 = left.stablecoin.address.toLowerCase() === MANTLE_USDT0.address.toLowerCase() && left.path.length === 2;
    const rightDirectUsdt0 = right.stablecoin.address.toLowerCase() === MANTLE_USDT0.address.toLowerCase() && right.path.length === 2;
    if (leftDirectUsdt0 !== rightDirectUsdt0) return leftDirectUsdt0 ? -1 : 1;
    return left.path.length - right.path.length;
  });
}

async function merchantMoeRoundTripQuote(symbol, sizeUsd, candidate) {
  const inputAmount = stablecoinAmount(sizeUsd, candidate.stablecoin.decimals);
  const buy = await merchantMoeExactIn(candidate.path, inputAmount, `Merchant Moe ${candidate.pathSymbols.join('->')} ${sizeUsd}`);
  const attempts = [{
    side: 'buy',
    stablecoin: candidate.stablecoin.symbol,
    path: candidate.path,
    pathSymbols: candidate.pathSymbols,
    amount: inputAmount,
    ok: buy.ok && quoteHasOutput(buy.data),
    errorCode: buy.ok && !quoteHasOutput(buy.data) ? 'NO_LB_ROUTE' : null,
    error: buy.ok ? null : buy.error,
    quote: buy.ok ? serializeLbQuote(buy.data) : null,
  }];
  if (!buy.ok || !quoteHasOutput(buy.data)) {
    return {
      status: 'unavailable',
      reason: buy.ok ? 'NO_LB_ROUTE' : buy.error,
      source: 'Merchant Moe LBQuoter',
      attempts,
    };
  }

  const tokenOutRaw = String(lastQuoteAmount(buy.data));
  const sellPath = [...candidate.path].reverse();
  const sellPathSymbols = [...candidate.pathSymbols].reverse();
  const sell = await merchantMoeExactIn(sellPath, tokenOutRaw, `Merchant Moe ${sellPathSymbols.join('->')} ${sizeUsd} roundtrip`);
  attempts.push({
    side: 'sell',
    stablecoin: candidate.stablecoin.symbol,
    path: sellPath,
    pathSymbols: sellPathSymbols,
    amount: tokenOutRaw,
    ok: sell.ok && quoteHasOutput(sell.data),
    errorCode: sell.ok && !quoteHasOutput(sell.data) ? 'NO_LB_ROUTE' : null,
    error: sell.ok ? null : sell.error,
    quote: sell.ok ? serializeLbQuote(sell.data) : null,
  });
  if (!sell.ok || !quoteHasOutput(sell.data)) {
    return {
      status: 'unavailable',
      reason: sell.ok ? 'NO_LB_ROUTE' : sell.error,
      source: 'Merchant Moe LBQuoter',
      attempts,
    };
  }

  const stablecoinBackRaw = lastQuoteAmount(sell.data);
  const usdcBack = Number.parseFloat(formatUnits(stablecoinBackRaw, candidate.stablecoin.decimals));
  return {
    status: 'ok',
    inputUsd: sizeUsd,
    stablecoin: candidate.stablecoin.symbol,
    tokenOutRaw,
    stablecoinBackRaw: String(stablecoinBackRaw),
    usdcBack,
    buyPath: candidate.path,
    buyPathSymbols: candidate.pathSymbols,
    sellPath,
    sellPathSymbols,
    buyPairs: (buy.data.pairs || []).map(String),
    sellPairs: (sell.data.pairs || []).map(String),
    buyBinSteps: (buy.data.binSteps || []).map(String),
    sellBinSteps: (sell.data.binSteps || []).map(String),
    buyFeesRaw: (buy.data.fees || []).map(String),
    sellFeesRaw: (sell.data.fees || []).map(String),
    source: 'Merchant Moe LBQuoter',
    attempts,
  };
}

async function merchantMoeExactIn(path, amount, label) {
  try {
    const data = await mantlePublicClient().readContract({
      address: MERCHANT_MOE_LB_QUOTER,
      abi: LB_QUOTER_ABI,
      functionName: 'findBestPathFromAmountIn',
      args: [path, BigInt(amount)],
    });
    return { ok: true, data, label };
  } catch (error) {
    return { ok: false, error: compactError(error), label };
  }
}

function mantlePublicClient() {
  if (!mantleClient) {
    mantleClient = createPublicClient({
      chain: MANTLE_CHAIN,
      transport: http(MANTLE_RPC_URL),
    });
  }
  return mantleClient;
}

function quoteHasOutput(quote) {
  const amount = lastQuoteAmount(quote);
  const pairs = quote?.pairs || [];
  return amount > 0n && pairs.some((pair) => String(pair).toLowerCase() !== ZERO_ADDRESS.toLowerCase());
}

function lastQuoteAmount(quote) {
  const amounts = quote?.amounts || [];
  const last = amounts[amounts.length - 1];
  try {
    return BigInt(last || 0);
  } catch {
    return 0n;
  }
}

function serializeLbQuote(quote) {
  if (!quote) return null;
  return {
    route: (quote.route || []).map(String),
    pairs: (quote.pairs || []).map(String),
    binSteps: (quote.binSteps || []).map(String),
    versions: (quote.versions || []).map(Number),
    amounts: (quote.amounts || []).map(String),
    virtualAmountsWithoutSlippage: (quote.virtualAmountsWithoutSlippage || []).map(String),
    fees: (quote.fees || []).map(String),
  };
}

function mergeMantleQuoteBySize(sizes, quoteSources) {
  const quoteBySize = {};
  for (const size of sizes) {
    const sourceQuotes = quoteSources
      .map((quoteSource) => ({ name: quoteSource.name, quote: quoteSource.quoteBySize?.[size] }))
      .filter((entry) => entry.quote);
    const okQuotes = sourceQuotes
      .filter((entry) => entry.quote.status === 'ok')
      .map((entry) => ({ ...entry.quote, source: entry.quote.source || entry.name }));
    if (okQuotes.length) {
      quoteBySize[size] = okQuotes.sort((left, right) => right.usdcBack - left.usdcBack)[0];
      continue;
    }
    const reasons = sourceQuotes
      .map((entry) => `${entry.name}: ${entry.quote.reason || entry.quote.errorCode || entry.quote.status}`)
      .filter(Boolean);
    quoteBySize[size] = {
      status: 'unavailable',
      reason: reasons.length ? reasons.join('; ') : 'No executable quote',
      attempts: sourceQuotes.flatMap((entry) => (entry.quote.attempts || []).map((attempt) => ({ ...attempt, source: entry.name }))),
      source: quoteSources.map((entry) => entry.name).join(' + '),
    };
  }
  return quoteBySize;
}

async function collectMantlePoolTelemetry(symbol, mantleDeployment, sourceLog) {
  const url = DEXSCREENER_TOKEN_URL(mantleDeployment.address);
  const response = await safeFetchJson(url, `DexScreener ${symbol} Mantle pools`, { retries: 0, timeoutMs: 10000 });
  sourceLog.push(source(`DexScreener ${symbol} token pools`, url, response.ok, response.error || ''));
  const pairs = (response.ok ? response.data?.pairs || [] : [])
    .filter((pair) => pair.chainId === 'mantle')
    .map((pair) => ({
      dexId: pair.dexId,
      pairAddress: pair.pairAddress,
      labels: pair.labels || [],
      baseToken: pair.baseToken,
      quoteToken: pair.quoteToken,
      priceUsd: numberOrNull(pair.priceUsd),
      liquidityUsd: numberOrNull(pair.liquidity?.usd),
      liquidityBase: numberOrNull(pair.liquidity?.base),
      liquidityQuote: numberOrNull(pair.liquidity?.quote),
      volumeH24Usd: numberOrNull(pair.volume?.h24),
      txnsH24: (pair.txns?.h24?.buys || 0) + (pair.txns?.h24?.sells || 0),
      url: pair.url,
    }))
    .sort((left, right) => (right.liquidityUsd || 0) - (left.liquidityUsd || 0));
  return {
    status: response.ok ? (pairs.length ? 'ok' : 'no_mantle_pool_indexed') : 'source_failed',
    source: 'DexScreener token pairs',
    url,
    pairs,
  };
}

async function collectXChangeSoftQuoteStatus(symbol, sizes, sourceLog) {
  const apiKey = process.env.XSTOCKS_API_KEY;
  if (!apiKey) {
    return {
      status: 'requires_api_key',
      endpoint: XCHANGE_SOFT_QUOTE_URL,
      reason: 'xStocks xChange soft quote requires XSTOCKS_API_KEY.',
    };
  }
  const quoteBySize = {};
  for (const size of sizes) {
    const response = await safeFetchJson(XCHANGE_SOFT_QUOTE_URL, `xStocks xChange ${symbol} soft quote ${size}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-KEY': apiKey },
      body: JSON.stringify({
        identifier: symbol,
        side: 'Buy',
        network: 'Mantle',
        cashAmount: String(size),
      }),
      retries: 0,
      timeoutMs: 12000,
    });
    quoteBySize[size] = response.ok
      ? { status: 'ok', price: numberOrNull(response.data?.price), quantity: response.data?.quantity, cashAmount: response.data?.cashAmount, expiresAt: response.data?.expiresAt }
      : { status: 'unavailable', reason: response.error, errorCode: response.errorData?.code || response.errorData?.errorCode || null };
  }
  sourceLog.push(source('xStocks xChange soft quote API', XCHANGE_SOFT_QUOTE_URL, true, summarizeQuoteAvailability(quoteBySize)));
  return {
    status: Object.values(quoteBySize).some((quote) => quote.status === 'ok') ? 'ok' : 'no_soft_quote',
    endpoint: XCHANGE_SOFT_QUOTE_URL,
    quoteBySize,
  };
}

function stablecoinAmount(sizeUsd, decimals) {
  return String(Math.round(sizeUsd * 10 ** decimals));
}

function summarizeQuoteAttempts(attempts) {
  const errors = [...new Set((attempts || []).map((attempt) => attempt.errorCode || attempt.error).filter(Boolean))];
  return errors.length ? errors.join(', ') : 'No executable quote';
}

function summarizeQuoteAvailability(quoteBySize) {
  const entries = Object.entries(quoteBySize || {});
  const okSizes = entries.filter(([, quote]) => quote.status === 'ok').map(([size]) => size);
  if (okSizes.length) return `ok sizes: ${okSizes.join(',')}`;
  const errors = [...new Set(entries.map(([, quote]) => quote.reason || quote.errorCode).filter(Boolean))];
  return errors.length ? `no executable quote: ${errors.slice(0, 3).join('; ')}` : 'no executable quote';
}

async function collectBybitPerp(symbol, asset, maxHoldingDays) {
  const marketSymbol = perpSymbolFor(asset, symbol);
  const instrumentResponse = await safeFetchJson(`${BYBIT_BASE}/instruments-info?category=linear&symbol=${marketSymbol}`, `Bybit ${marketSymbol} perp instrument`);
  const instrument = instrumentResponse.ok ? instrumentResponse.data?.result?.list?.[0] : null;
  if (!instrument || instrument.status !== 'Trading') {
    return unavailableVenue('Bybit Perp', 'perp', 'perpetual_future', marketSymbol, instrumentResponse.error || 'Perp symbol not listed');
  }
  const startTime = Date.now() - maxHoldingDays * DAY_MS;
  const [bookResponse, fundingResponse] = await Promise.all([
    safeFetchJson(`${BYBIT_BASE}/orderbook?category=linear&symbol=${marketSymbol}&limit=200`, `Bybit ${marketSymbol} perp orderbook`),
    safeFetchJson(`${BYBIT_BASE}/funding/history?category=linear&symbol=${marketSymbol}&startTime=${startTime}&endTime=${Date.now()}&limit=200`, `Bybit ${marketSymbol} funding history`),
  ]);
  if (!bookResponse.ok) {
    return unavailableVenue('Bybit Perp', 'perp', 'perpetual_future', marketSymbol, bookResponse.error);
  }
  return {
    venue: 'Bybit Perp',
    routeType: 'perp',
    productClass: 'perpetual_future',
    status: 'ok',
    marketSymbol,
    feeRate: DEFAULT_FEES.bybitPerp,
    orderBook: normalizeOrderBook(bookResponse.data?.result || {}),
    fundingHistory: normalizeFunding(fundingResponse.ok ? fundingResponse.data?.result?.list || [] : [], 'fundingRateTimestamp', 'fundingRate'),
    notes: ['Synthetic exposure only. Not token/share ownership; funding and liquidation risk apply.'],
  };
}

async function collectBinancePerp(symbol, asset, maxHoldingDays) {
  const marketSymbol = perpSymbolFor(asset, symbol);
  const startTime = Date.now() - maxHoldingDays * DAY_MS;
  const [bookResponse, fundingResponse] = await Promise.all([
    safeFetchJson(`${BINANCE_FAPI}/depth?symbol=${marketSymbol}&limit=100`, `Binance ${marketSymbol} perp orderbook`),
    safeFetchJson(`${BINANCE_FAPI}/fundingRate?symbol=${marketSymbol}&startTime=${startTime}&limit=1000`, `Binance ${marketSymbol} funding history`),
  ]);
  if (!bookResponse.ok || !Array.isArray(bookResponse.data?.asks)) {
    return unavailableVenue('Binance Perp', 'perp', 'perpetual_future', marketSymbol, bookResponse.error || bookResponse.data?.msg || 'Perp orderbook unavailable');
  }
  return {
    venue: 'Binance Perp',
    routeType: 'perp',
    productClass: 'perpetual_future',
    status: 'ok',
    marketSymbol,
    feeRate: DEFAULT_FEES.binancePerp,
    orderBook: normalizeOrderBook(bookResponse.data),
    fundingHistory: normalizeFunding(Array.isArray(fundingResponse.data) ? fundingResponse.data : [], 'fundingTime', 'fundingRate'),
    notes: ['Synthetic exposure only. Not token/share ownership; funding and liquidation risk apply.'],
  };
}

async function collectJupiterRoute(symbol, asset, sizes) {
  const solanaDeployment = (asset.deployments || []).find((deployment) => deployment.network === 'Solana');
  const usdc = solanaDeployment?.stablecoins?.find((stablecoin) => stablecoin.symbol === 'USDC')?.address || DEFAULT_USDC_SOLANA;
  if (!solanaDeployment?.address) {
    return unavailableVenue('Jupiter', 'onchain_dex', 'onchain_tokenized_stock', `${symbol}/USDC`, 'No Solana deployment in xStocks public asset list');
  }
  if (process.env.ENABLE_JUPITER !== '1') {
    return {
      venue: 'Jupiter',
      routeType: 'onchain_dex',
      productClass: 'onchain_tokenized_stock',
      status: 'manual_check',
      marketSymbol: `${symbol}/USDC on Solana`,
      feeRate: DEFAULT_FEES.jupiter,
      notes: ['Set ENABLE_JUPITER=1 to fetch live Solana route quotes.'],
      deployment: { address: solanaDeployment.address, usdc },
      quoteBySize: {},
    };
  }

  const quoteBySize = {};
  for (const size of sizes) {
    const amount = Math.round(size * 1_000_000);
    const buyUrl = `${JUPITER_QUOTE}?inputMint=${usdc}&outputMint=${solanaDeployment.address}&amount=${amount}&slippageBps=50`;
    const buyResponse = await safeFetchJson(buyUrl, `Jupiter ${symbol} buy ${size}`);
    if (!buyResponse.ok || !buyResponse.data?.outAmount) {
      quoteBySize[size] = { status: 'unavailable', reason: buyResponse.error || 'No buy quote' };
      continue;
    }
    const sellUrl = `${JUPITER_QUOTE}?inputMint=${solanaDeployment.address}&outputMint=${usdc}&amount=${buyResponse.data.outAmount}&slippageBps=50`;
    const sellResponse = await safeFetchJson(sellUrl, `Jupiter ${symbol} sell ${size}`);
    if (!sellResponse.ok || !sellResponse.data?.outAmount) {
      quoteBySize[size] = { status: 'unavailable', reason: sellResponse.error || 'No sell quote' };
      continue;
    }
    quoteBySize[size] = {
      status: 'ok',
      inputUsd: size,
      tokenOutRaw: buyResponse.data.outAmount,
      usdcBack: Number.parseFloat(sellResponse.data.outAmount) / 1_000_000,
      buyRoute: buyResponse.data,
      sellRoute: sellResponse.data,
    };
  }

  return {
    venue: 'Jupiter',
    routeType: 'onchain_dex',
    productClass: 'onchain_tokenized_stock',
    status: Object.values(quoteBySize).some((quote) => quote.status === 'ok') ? 'ok' : 'unavailable',
    marketSymbol: `${symbol}/USDC on Solana`,
    feeRate: DEFAULT_FEES.jupiter,
    deployment: { address: solanaDeployment.address, usdc },
    quoteBySize,
    notes: ['Solana route quote; bridge, custody, wallet, and priority-fee costs are not included.'],
  };
}

function unavailableVenue(venue, routeType, productClass, marketSymbol, reason) {
  return {
    venue,
    routeType,
    productClass,
    status: 'unavailable',
    marketSymbol,
    reason,
    notes: [reason].filter(Boolean),
  };
}

function normalizeFunding(rows, timestampKey, rateKey) {
  return rows
    .map((row) => ({
      timestamp: Number.parseInt(row[timestampKey], 10),
      rate: numberOrNull(row[rateKey]),
    }))
    .filter((row) => Number.isFinite(row.timestamp) && Number.isFinite(row.rate))
    .sort((a, b) => a.timestamp - b.timestamp);
}

export function simulateOrderBookFill(levels, sizeUsd) {
  let remaining = sizeUsd;
  let quantity = 0;
  let spent = 0;
  const consumed = [];

  for (const [price, availableQty] of levels || []) {
    if (remaining <= 1e-9) break;
    const availableUsd = price * availableQty;
    const usedUsd = Math.min(remaining, availableUsd);
    const usedQty = usedUsd / price;
    spent += usedUsd;
    quantity += usedQty;
    remaining -= usedUsd;
    consumed.push({ price, quantity: usedQty, notionalUsd: usedUsd });
  }

  return {
    requestedUsd: sizeUsd,
    filledUsd: spent,
    quantity,
    averagePrice: quantity > 0 ? spent / quantity : null,
    unfilledUsd: Math.max(0, remaining),
    complete: remaining <= Math.max(1e-8, sizeUsd * 1e-8),
    consumed,
  };
}

export function simulateSellFill(levels, quantity) {
  let remainingQty = quantity;
  let proceedsUsd = 0;
  const consumed = [];

  for (const [price, availableQty] of levels || []) {
    if (remainingQty <= 1e-12) break;
    const usedQty = Math.min(remainingQty, availableQty);
    const notionalUsd = usedQty * price;
    proceedsUsd += notionalUsd;
    remainingQty -= usedQty;
    consumed.push({ price, quantity: usedQty, notionalUsd });
  }

  const soldQty = quantity - Math.max(0, remainingQty);
  return {
    requestedQuantity: quantity,
    soldQuantity: soldQty,
    proceedsUsd,
    averagePrice: soldQty > 0 ? proceedsUsd / soldQty : null,
    unsoldQuantity: Math.max(0, remainingQty),
    complete: remainingQty <= Math.max(1e-12, quantity * 1e-8),
    consumed,
  };
}

export function simulateRoundTrip(orderBook, sizeUsd, feeRate = 0) {
  const buy = simulateOrderBookFill(orderBook?.asks || [], sizeUsd);
  if (!buy.complete || buy.quantity <= 0) {
    return {
      status: 'partial',
      sizeUsd,
      filledUsd: buy.filledUsd,
      unfilledUsd: buy.unfilledUsd,
      costUsd: null,
      costBps: null,
      buy,
      sell: null,
    };
  }

  const sell = simulateSellFill(orderBook?.bids || [], buy.quantity);
  if (!sell.complete) {
    return {
      status: 'partial',
      sizeUsd,
      filledUsd: buy.filledUsd,
      unfilledUsd: buy.unfilledUsd,
      costUsd: null,
      costBps: null,
      buy,
      sell,
    };
  }

  const entryFeeUsd = sizeUsd * feeRate;
  const exitFeeUsd = sell.proceedsUsd * feeRate;
  const costUsd = sizeUsd + entryFeeUsd - (sell.proceedsUsd - exitFeeUsd);
  return {
    status: 'ok',
    sizeUsd,
    filledUsd: buy.filledUsd,
    unfilledUsd: 0,
    costUsd,
    costBps: (costUsd / sizeUsd) * 10000,
    entryFeeUsd,
    exitFeeUsd,
    buy,
    sell,
  };
}

export function cumulativeFundingRate(fundingHistory, days, now = Date.now()) {
  const start = now - days * DAY_MS;
  return (fundingHistory || [])
    .filter((entry) => entry.timestamp >= start && entry.timestamp <= now)
    .reduce((sum, entry) => sum + entry.rate, 0);
}

export function analyzeSnapshot(snapshot, {
  sizes = snapshot.sizes || DEFAULT_SIZES,
  holdingDays = snapshot.holdingDays || DEFAULT_HOLDING_DAYS,
  intent = 'long-hold',
  primarySize = 5000,
} = {}) {
  const costRows = [];
  const venueScores = [];
  const recommendations = [];
  const now = Date.parse(snapshot.generatedAt) || Date.now();

  for (const symbolSnapshot of snapshot.symbols || []) {
    const symbolRows = [];
    for (const venue of symbolSnapshot.venues || []) {
      if (venue.status === 'ok' && venue.orderBook) {
        for (const sizeUsd of sizes) {
          const roundTrip = simulateRoundTrip(venue.orderBook, sizeUsd, venue.feeRate || 0);
          const confidence = assessDataConfidence(venue, roundTrip, symbolSnapshot, now);
          const premiumBps = roundTrip.buy?.averagePrice && symbolSnapshot.referencePrice
            ? ((roundTrip.buy.averagePrice - symbolSnapshot.referencePrice) / symbolSnapshot.referencePrice) * 10000
            : null;
          const fundingByDays = venue.routeType === 'perp'
            ? Object.fromEntries(holdingDays.map((days) => {
                const rate = cumulativeFundingRate(venue.fundingHistory || [], days, now);
                const fundingCostUsd = sizeUsd * rate;
                const totalCostUsd = roundTrip.costUsd == null ? null : roundTrip.costUsd + fundingCostUsd;
                return [days, {
                  cumulativeRate: rate,
                  fundingCostUsd,
                  totalCostUsd,
                  totalCostBps: totalCostUsd == null ? null : (totalCostUsd / sizeUsd) * 10000,
                }];
              }))
            : {};
          const row = {
            symbol: symbolSnapshot.symbol,
            venue: venue.venue,
            routeType: venue.routeType,
            productClass: venue.productClass,
            marketSymbol: venue.marketSymbol,
            sizeUsd,
            status: roundTrip.status,
            costUsd: roundTrip.costUsd,
            costBps: roundTrip.costBps,
            premiumBps,
            entryAveragePrice: roundTrip.buy?.averagePrice ?? null,
            exitAveragePrice: roundTrip.sell?.averagePrice ?? null,
            dataConfidence: confidence.score,
            dataQuality: confidence.label,
            dataQualityReasons: confidence.reasons,
            fundingByDays,
            notes: venue.notes || [],
          };
          costRows.push(row);
          symbolRows.push(row);
        }
      } else if (venue.quoteBySize && Object.keys(venue.quoteBySize).length) {
        for (const sizeUsd of sizes) {
          const quote = venue.quoteBySize[sizeUsd];
          const costUsd = quote?.status === 'ok' ? sizeUsd - quote.usdcBack : null;
          const confidence = assessDataConfidence(venue, { status: quote?.status === 'ok' ? 'ok' : 'unavailable' }, symbolSnapshot, now);
          const row = {
            symbol: symbolSnapshot.symbol,
            venue: venue.venue,
            routeType: venue.routeType,
            productClass: venue.productClass,
            marketSymbol: venue.marketSymbol,
            sizeUsd,
            status: quote?.status === 'ok' ? 'ok' : 'unavailable',
            costUsd,
            costBps: costUsd == null ? null : (costUsd / sizeUsd) * 10000,
            premiumBps: null,
            entryAveragePrice: null,
            exitAveragePrice: null,
            dataConfidence: confidence.score,
            dataQuality: confidence.label,
            dataQualityReasons: confidence.reasons,
            reason: quote?.reason || null,
            quoteSource: quote?.source || null,
            quoteStablecoin: quote?.stablecoin || null,
            quoteAttempts: quote?.attempts || [],
            fundingByDays: {},
            notes: venue.notes || [],
          };
          costRows.push(row);
          symbolRows.push(row);
        }
      } else {
        const row = {
          symbol: symbolSnapshot.symbol,
          venue: venue.venue,
          routeType: venue.routeType,
          productClass: venue.productClass,
          marketSymbol: venue.marketSymbol,
          sizeUsd: null,
          status: venue.status || 'unavailable',
          costUsd: null,
          costBps: null,
          premiumBps: null,
          reason: venue.reason || venue.notes?.[0] || 'No executable quote',
          dataConfidence: venue.status === 'manual_check' ? 35 : 10,
          dataQuality: venue.status === 'manual_check' ? '수동확인' : '낮음',
          dataQualityReasons: [venue.reason || venue.notes?.[0] || 'No executable quote'],
          fundingByDays: {},
          notes: venue.notes || [],
        };
        costRows.push(row);
        symbolRows.push(row);
      }
    }

    const scores = scoreVenues(symbolSnapshot, symbolRows, { sizes, holdingDays, intent, primarySize });
    venueScores.push(...scores);
    recommendations.push(buildRecommendation(symbolSnapshot, scores, symbolRows, { sizes, holdingDays, intent }));
  }

  const routeChecks = summarizeRouteChecks(snapshot.symbols || [], sizes);
  const coverage = summarizeCoverage(costRows);
  return {
    generatedAt: snapshot.generatedAt,
    intent,
    sizes,
    holdingDays,
    symbols: snapshot.symbols?.map((entry) => ({
      symbol: entry.symbol,
      name: entry.name,
      referencePrice: entry.referencePrice,
      referencePriceSource: entry.referencePriceSource,
      asset: entry.asset,
    })) || [],
    recommendations,
    venueScores,
    costRows,
    routeChecks,
    sources: snapshot.sources || [],
    coverage,
    readiness: summarizeReadiness(costRows, routeChecks, recommendations),
    disclaimer: 'Execution and holding-cost analysis only. Not investment advice.',
  };
}

function assessDataConfidence(venue, execution, symbolSnapshot, now) {
  let score = 0;
  const reasons = [];
  if (venue.status === 'ok') score += 25;
  if (venue.orderBook) {
    const bidLevels = venue.orderBook.bids?.length || 0;
    const askLevels = venue.orderBook.asks?.length || 0;
    const levels = Math.min(bidLevels, askLevels);
    if (levels >= 50) score += 18;
    else if (levels >= 20) score += 14;
    else if (levels >= 5) score += 9;
    else if (levels > 0) score += 4;
    else reasons.push('오더북 레벨 부족');

    const ageMs = Math.abs(now - (venue.orderBook.timestamp || now));
    if (ageMs <= 2 * 60 * 1000) score += 15;
    else if (ageMs <= 10 * 60 * 1000) score += 8;
    else reasons.push('오더북 timestamp가 오래됨');
  }
  if (execution?.status === 'ok') score += 15;
  else reasons.push('요청 금액 완전 체결 불가');
  if (venue.quoteBySize) {
    const executableQuoteCount = Object.values(venue.quoteBySize).filter((quote) => quote?.status === 'ok').length;
    if (executableQuoteCount >= 3) score += 12;
    else if (executableQuoteCount > 0) score += 6;
    if (venue.executionEvidence?.merchantMoe?.status === 'ok') score += 6;
    if (venue.executionEvidence?.poolTelemetry?.pairs?.length) score += 3;
  }
  if (venue.ticker) score += 5;
  if (venue.feeRate != null) reasons.push('수수료는 기본 retail 가정');
  else reasons.push('수수료 가정 없음');
  if (venue.routeType === 'perp') {
    const fundingCount = venue.fundingHistory?.length || 0;
    if (fundingCount >= 21) score += 12;
    else if (fundingCount > 0) score += 6;
    else reasons.push('펀딩 히스토리 부족');
  } else {
    score += 6;
  }
  if (venue.productClass === 'spot_tokenized_stock') score += 10;
  else if (venue.productClass === 'onchain_tokenized_stock') score += 8;
  else if (venue.productClass === 'tokenized_stock_alt') {
    score += 3;
    reasons.push('xStocks와 다른 발행자/상품 구조');
  } else if (venue.productClass === 'pre_market_stock_alt') {
    reasons.push('pre-market 성격의 대체 상품');
  }
  if (symbolSnapshot.referencePriceSource) score += 4;
  const cap = confidenceCapForVenue(venue);
  const finalScore = clamp(score, 0, cap);
  return {
    score: finalScore,
    label: finalScore >= 80 ? '높음' : finalScore >= 60 ? '보통' : finalScore >= 35 ? '수동확인' : '낮음',
    reasons,
  };
}

function confidenceCapForVenue(venue) {
  if (venue.productClass === 'pre_market_stock_alt') return 55;
  if (venue.productClass === 'tokenized_stock_alt') return 72;
  if (venue.routeType === 'perp') return 82;
  if (venue.routeType === 'cex_spot') return 90;
  if (venue.routeType === 'onchain_dex' || venue.routeType === 'onchain_rwa') return 80;
  return 75;
}

function summarizeCoverage(costRows) {
  const okRows = costRows.filter((row) => row.status === 'ok' && row.sizeUsd != null);
  const nonOkRows = costRows.filter((row) => row.status !== 'ok');
  return {
    symbols: [...new Set(costRows.map((row) => row.symbol))].length,
    venues: [...new Set(okRows.map((row) => row.venue))].sort(),
    routeTypes: [...new Set(okRows.map((row) => row.routeType))].sort(),
    executableRows: okRows.length,
    manualVenues: [...new Set(nonOkRows.map((row) => row.venue))].sort(),
    manualRows: nonOkRows.length,
  };
}

function summarizeReadiness(costRows, routeChecks, recommendations) {
  const symbols = [...new Set(costRows.map((row) => row.symbol).filter(Boolean))];
  const exactSpotSymbols = uniqueSymbols(costRows.filter((row) =>
    row.status === 'ok' &&
    row.routeType === 'cex_spot' &&
    row.productClass === 'spot_tokenized_stock'));
  const alternativeSymbols = uniqueSymbols(costRows.filter((row) =>
    row.status === 'ok' &&
    (row.productClass === 'tokenized_stock_alt' || row.productClass === 'pre_market_stock_alt')));
  const perpSymbols = uniqueSymbols(costRows.filter((row) => row.status === 'ok' && row.routeType === 'perp'));
  const mantleChecks = (routeChecks || []).filter((check) => check.venue === 'Mantle xStocks');
  const mantleDeployedSymbols = uniqueSymbols(mantleChecks.filter((check) =>
    (check.confirmed || []).some((item) => item.includes('배포 확인'))));
  const mantleExecutableSymbols = uniqueSymbols(costRows.filter((row) =>
    row.status === 'ok' && row.venue === 'Mantle xStocks'));
  const mantleRfqRequiredSymbols = uniqueSymbols(mantleChecks.filter((check) =>
    [...(check.missing || []), ...(check.execution || [])].some((item) => /API key|RFQ/u.test(item))));
  const topRoutes = (recommendations || [])
    .filter((recommendation) => recommendation.best)
    .map((recommendation) => `${recommendation.symbol}: ${recommendation.best.venue} ${formatBps(recommendation.best.representativeCostBps)}`);

  return {
    symbols: symbols.length,
    exactSpotSymbols,
    alternativeSymbols,
    perpSymbols,
    mantleDeployedSymbols,
    mantleExecutableSymbols,
    mantleRfqRequiredSymbols,
    topRoutes,
  };
}

function uniqueSymbols(rowsOrChecks) {
  return [...new Set((rowsOrChecks || []).map((item) => item.symbol).filter(Boolean))].sort();
}

function summarizeRouteChecks(symbolSnapshots, requestedSizes = DEFAULT_SIZES) {
  const checks = [];
  for (const symbolSnapshot of symbolSnapshots) {
    for (const venue of symbolSnapshot.venues || []) {
      if (!shouldExposeRouteCheck(venue)) continue;
      const confirmed = [];
      const missing = [];
      const nextEvidence = [];
      if (venue.deployment?.address) {
        confirmed.push(`${venue.deployment.address} 배포 확인`);
      }
      if (venue.deployment?.supportsAtomicSwaps) {
        confirmed.push('xStocks 메타데이터상 atomic swap 지원');
      }
      if (venue.deployment?.stablecoins?.length) {
        confirmed.push(`${venue.deployment.stablecoins.join('/')} route 메타데이터`);
      }
      const execution = routeExecutionFindings(venue, requestedSizes);
      if (venue.status === 'manual_check') {
        missing.push('실행 가능한 RFQ/AMM quote 미호출');
        missing.push('1k/5k/10k pool depth와 slippage 미측정');
        missing.push('브릿지/출금/settlement 비용 미측정');
        nextEvidence.push(...routeSpecificNextEvidence(venue));
      } else if (venue.status === 'quote_failed') {
        missing.push('Fluxion/Merchant Moe executable quote 부족으로 비용 랭킹 제외');
        if (venue.executionEvidence?.poolTelemetry?.pairs?.length) {
          missing.push('Merchant Moe pool telemetry는 depth proxy이며 executable slippage가 아님');
        }
        missing.push('브릿지/출금/settlement 비용 미포함');
        if (venue.executionEvidence?.xChange?.status === 'requires_api_key') {
          missing.push('xStocks xChange soft quote는 API key 필요');
        }
      } else if (venue.status !== 'ok') {
        missing.push(venue.reason || venue.notes?.[0] || '공개 route 확인 필요');
        nextEvidence.push('xStocks deployment metadata 재확인');
      } else {
        const unavailableSizes = Object.entries(venue.quoteBySize || {})
          .filter(([size]) => requestedSizes.includes(Number(size)))
          .filter(([, quote]) => quote?.status !== 'ok')
          .map(([size]) => `${size} USD`);
        if (unavailableSizes.length) {
          missing.push(`일부 size(${unavailableSizes.join(', ')})는 executable quote 미확인`);
        }
        if (venue.executionEvidence?.poolTelemetry?.pairs?.length) {
          missing.push('pool telemetry는 참고값이며 최종 체결 전 quote 재확인 필요');
        }
        if (venue.executionEvidence?.xChange?.status === 'requires_api_key') {
          missing.push('xStocks xChange soft quote는 API key 필요');
        }
        missing.push('브릿지/출금/settlement 비용 미포함');
      }
      if (!confirmed.length) confirmed.push('공개 실행 데이터 없음');
      checks.push({
        symbol: symbolSnapshot.symbol,
        venue: venue.venue,
        routeType: venue.routeType,
        productClass: venue.productClass,
        marketSymbol: venue.marketSymbol,
        status: venue.status || 'unavailable',
        deployment: venue.deployment || null,
        confirmed,
        execution,
        missing,
        nextEvidence,
        notes: venue.notes || [],
      });
    }
  }
  return checks;
}

function routeExecutionFindings(venue, requestedSizes = DEFAULT_SIZES) {
  const findings = [];
  const fluxion = venue.executionEvidence?.fluxion;
  if (fluxion?.quoteBySize) {
    const quoteFindings = Object.entries(fluxion.quoteBySize)
      .filter(([size]) => requestedSizes.includes(Number(size)))
      .map(([size, quote]) => {
      if (quote.status === 'ok') {
        return `${size}: Fluxion quote ok via ${quote.stablecoin}, roundtrip ${formatBps(((Number(size) - quote.usdcBack) / Number(size)) * 10000)}`;
      }
      return `${size}: Fluxion quote 실패 (${quote.reason || 'No executable quote'})`;
    });
    findings.push(...quoteFindings);
  }
  const merchantMoe = venue.executionEvidence?.merchantMoe;
  if (merchantMoe?.quoteBySize) {
    const quoteFindings = Object.entries(merchantMoe.quoteBySize)
      .filter(([size]) => requestedSizes.includes(Number(size)))
      .map(([size, quote]) => {
      if (quote.status === 'ok') {
        const route = quote.buyPathSymbols?.join('->') || quote.stablecoin || 'route';
        return `${size}: Merchant Moe LBQuoter ok via ${route}, roundtrip ${formatBps(((Number(size) - quote.usdcBack) / Number(size)) * 10000)}`;
      }
      return `${size}: Merchant Moe LBQuoter 미체결 (${quote.reason || 'No executable quote'})`;
    });
    findings.push(...quoteFindings);
  }
  const pools = venue.executionEvidence?.poolTelemetry?.pairs || [];
  if (pools.length) {
    const topPool = pools[0];
    findings.push(`Merchant Moe pool proxy: ${topPool.quoteToken?.symbol || 'quote'} pair, liquidity ${formatUsd(topPool.liquidityUsd)}, 24h volume ${formatUsd(topPool.volumeH24Usd)}, 24h tx ${topPool.txnsH24}`);
  } else if (venue.executionEvidence?.poolTelemetry) {
    findings.push('Merchant Moe/Mantle pool proxy: 공개 indexer에서 pool 미검출');
  }
  const xChange = venue.executionEvidence?.xChange;
  if (xChange?.status === 'requires_api_key') {
    findings.push('xStocks xChange soft quote: API key 필요');
  } else if (xChange?.quoteBySize) {
    findings.push(`xStocks xChange soft quote: ${summarizeQuoteAvailability(xChange.quoteBySize)}`);
  }
  return findings.length ? findings : ['실행 quote/depth evidence 없음'];
}

function routeSpecificNextEvidence(venue) {
  if (venue.venue === 'Mantle xStocks') {
    return [
      'xStocks xChange authenticated RFQ quote',
      'Merchant Moe LBQuoter direct quote',
      'Mantle indexer/subgraph로 volume, holder, pool depth 시계열',
    ];
  }
  if (venue.venue === 'Jupiter') {
    return [
      'Jupiter quote API 활성화',
      'Solana DEX route depth와 slippage',
      'Solana token account, bridge, redemption path 확인',
    ];
  }
  return [
    '실행 가능한 public quote endpoint',
    'pool reserve/swap history',
    'venue별 출금, 브릿지, settlement 비용',
  ];
}

function shouldExposeRouteCheck(venue) {
  return venue.venue === 'Mantle xStocks'
    || venue.routeType === 'onchain_rwa'
    || venue.routeType === 'onchain_dex'
    || venue.status === 'manual_check';
}

function scoreVenues(symbolSnapshot, symbolRows, { sizes, holdingDays, intent, primarySize }) {
  const grouped = new Map();
  for (const row of symbolRows.filter((item) => item.sizeUsd != null)) {
    const key = `${row.venue}|${row.marketSymbol}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }

  const targetSize = sizes.includes(primarySize)
    ? primarySize
    : sizes.reduce((best, size) => (Math.abs(size - primarySize) < Math.abs(best - primarySize) ? size : best), sizes[0]);

  const scores = [];
  for (const rows of grouped.values()) {
    const primary = rows.find((row) => row.sizeUsd === targetSize) || rows[0];
    const okRows = rows.filter((row) => row.status === 'ok');
    if (!primary || primary.status !== 'ok') continue;

    const productFit = productFitScore(primary, intent);
    const selfCustodyScore = primary.routeType === 'onchain_rwa' || primary.routeType === 'onchain_dex' ? 100 : primary.routeType === 'cex_spot' ? 35 : 20;
    const representativeBps = representativeCostBps(primary, holdingDays);
    const costScore = clamp(100 - Math.max(0, representativeBps) / 2, 0, 100);
    const liquidityScore = okRows.length === sizes.length ? 100 : okRows.length > 0 ? 45 : 0;
    const dataConfidence = primary.dataConfidence ?? 50;
    const score = costScore * 0.35 + liquidityScore * 0.2 + productFit * 0.2 + selfCustodyScore * 0.1 + dataConfidence * 0.15;
    scores.push({
      symbol: symbolSnapshot.symbol,
      venue: primary.venue,
      routeType: primary.routeType,
      productClass: primary.productClass,
      marketSymbol: primary.marketSymbol,
      score,
      representativeSizeUsd: targetSize,
      representativeCostBps: representativeBps,
      productFit,
      liquidityScore,
      costScore,
      selfCustodyScore,
      dataConfidence,
      dataQuality: primary.dataQuality,
      verdict: verdictFor(primary, intent),
    });
  }

  return scores.sort((a, b) => b.score - a.score);
}

function representativeCostBps(row, holdingDays) {
  if (row.routeType !== 'perp') return row.costBps ?? 10000;
  const maxDays = Math.max(...holdingDays);
  return row.fundingByDays?.[maxDays]?.totalCostBps ?? row.costBps ?? 10000;
}

function productFitScore(row, intent) {
  if (row.routeType === 'perp') return intent === 'perp-hedge' ? 70 : 15;
  if (row.routeType === 'onchain_rwa' || row.routeType === 'onchain_dex') return intent === 'self-custody' ? 95 : 85;
  if (row.routeType === 'cex_spot') return intent === 'self-custody' ? 55 : 80;
  if (row.productClass === 'tokenized_stock_alt') return intent === 'self-custody' ? 45 : 55;
  if (row.productClass === 'pre_market_stock_alt') return 25;
  return 40;
}

function verdictFor(row, intent) {
  if (row.routeType === 'perp' && intent !== 'perp-hedge') return 'avoid_for_long_hold';
  if ((row.dataConfidence ?? 100) < 60) return 'manual_check';
  if (row.costBps != null && row.costBps > 250) return 'watch';
  return 'best_candidate';
}

function buildRecommendation(symbolSnapshot, scores, symbolRows, { sizes, holdingDays, intent }) {
  const ranked = scores.filter((score) => !(score.routeType === 'perp' && intent !== 'perp-hedge'));
  const best = ranked[0] || scores[0] || null;
  const missing = symbolRows
    .filter((row) => row.sizeUsd == null && row.status !== 'ok')
    .map((row) => `${row.venue}: ${row.reason || row.status}`);
  const warnings = [];
  if (scores.some((score) => score.routeType === 'perp') && intent !== 'perp-hedge') {
    warnings.push('무기한 선물은 주식/토큰 보유가 아니라 합성 노출입니다. 장기 보유 목적이면 펀딩비와 청산 위험 때문에 별도 분리해야 합니다.');
  }
  const mantleRows = symbolRows.filter((row) => row.venue === 'Mantle xStocks' && row.status !== 'ok');
  if (missing.some((item) => item.includes('Mantle')) || mantleRows.length) {
    const mantleReasonSummary = summarizeMantleFailureReasons(mantleRows);
    const reasonText = mantleReasonSummary ? ` 이번 실행의 Mantle quote 결과: ${mantleReasonSummary}.` : '';
    warnings.push(`Mantle은 "싸다/비싸다"보다 실행 가능한 RFQ, 풀 깊이, 브릿지/출금 비용을 확인해야 하는 유통 품질 문제로 봐야 합니다.${reasonText}`);
  }
  if (best?.productClass === 'tokenized_stock_alt' || best?.productClass === 'pre_market_stock_alt') {
    warnings.push(`${symbolSnapshot.symbol}의 추천 경로는 xStocks와 다른 대체 RWA 주식 토큰입니다. 비용은 비교 가능하지만 발행자, 환매, 권리 구조는 별도 확인해야 합니다.`);
  }

  return {
    symbol: symbolSnapshot.symbol,
    name: symbolSnapshot.name,
    referencePrice: symbolSnapshot.referencePrice,
    best,
    missing,
    warnings,
    sizeSummary: Object.fromEntries(sizes.map((size) => [size, best ? bestCostFor(symbolRows, best, size, holdingDays) : null])),
  };
}

function summarizeMantleFailureReasons(rows) {
  const bySource = new Map();
  const other = new Set();
  for (const row of rows || []) {
    const reason = row.reason;
    if (!reason) continue;
    for (const part of String(reason).split(';')) {
      const [rawSource, rawCodes] = part.split(':');
      if (!rawCodes) {
        other.add(part.trim());
        continue;
      }
      const sourceName = rawSource.trim()
        .replace('Fluxion Quote API', 'Fluxion')
        .replace('Merchant Moe LBQuoter', 'Merchant Moe');
      if (!sourceName) continue;
      if (!bySource.has(sourceName)) bySource.set(sourceName, new Set());
      for (const code of rawCodes.split(',')) {
        const clean = code.trim();
        if (clean) bySource.get(sourceName).add(clean);
      }
    }
  }
  const sourceText = [...bySource.entries()]
    .map(([sourceName, codes]) => `${sourceName}: ${[...codes].join('/')}`);
  const otherText = [...other];
  return [...sourceText, ...otherText].join('; ');
}

function bestCostFor(symbolRows, best, size, holdingDays) {
  const row = symbolRows.find((item) => item.venue === best.venue && item.marketSymbol === best.marketSymbol && item.sizeUsd === size);
  if (!row || row.status !== 'ok') return null;
  if (row.routeType === 'perp') {
    const maxDays = Math.max(...holdingDays);
    return {
      costUsd: row.fundingByDays?.[maxDays]?.totalCostUsd ?? row.costUsd,
      costBps: row.fundingByDays?.[maxDays]?.totalCostBps ?? row.costBps,
      status: row.status,
    };
  }
  return { costUsd: row.costUsd, costBps: row.costBps, status: row.status };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function costsToCsv(costRows) {
  const fundingDays = [...new Set(costRows.flatMap((row) => Object.keys(row.fundingByDays || {})))].sort((a, b) => Number(a) - Number(b));
  const headers = [
    'symbol',
    'venue',
    'routeType',
    'productClass',
    'marketSymbol',
    'sizeUsd',
    'status',
    'costUsd',
    'costBps',
    'premiumBps',
    'dataConfidence',
    'dataQuality',
    'reason',
    'quoteSource',
    'quoteStablecoin',
    ...fundingDays.flatMap((days) => [
      `funding${days}dRate`,
      `funding${days}dCostUsd`,
      `total${days}dCostUsd`,
      `total${days}dCostBps`,
    ]),
  ];
  const lines = [headers.join(',')];
  for (const row of costRows) {
    lines.push(headers.map((header) => csvValue(csvField(row, header))).join(','));
  }
  return lines.join('\n');
}

function csvField(row, header) {
  const fundingMatch = /^funding(\d+)d(Rate|CostUsd)$/u.exec(header);
  if (fundingMatch) {
    const data = row.fundingByDays?.[fundingMatch[1]];
    return fundingMatch[2] === 'Rate' ? data?.cumulativeRate : data?.fundingCostUsd;
  }
  const totalMatch = /^total(\d+)dCost(Usd|Bps)$/u.exec(header);
  if (totalMatch) {
    const data = row.fundingByDays?.[totalMatch[1]];
    return totalMatch[2] === 'Usd' ? data?.totalCostUsd : data?.totalCostBps;
  }
  return row[header];
}

function csvValue(value) {
  if (value == null) return '';
  const stringValue = String(typeof value === 'number' ? round(value, 8) : value);
  return /[",\n]/u.test(stringValue) ? `"${stringValue.replaceAll('"', '""')}"` : stringValue;
}

export function renderMarkdown(analysis) {
  const lines = [];
  lines.push('**결론**');
  lines.push(renderConclusion(analysis));
  lines.push('');
  lines.push(`기준 시각: ${analysis.generatedAt}`);
  if (analysis.coverage) {
    const executableVenues = analysis.coverage.venues.length ? analysis.coverage.venues.join(', ') : '없음';
    const manualVenues = analysis.coverage.manualVenues?.length ? ` / 수동·미확인: ${analysis.coverage.manualVenues.join(', ')}` : '';
    lines.push(`비교군: ${executableVenues}${manualVenues} (${analysis.coverage.symbols}개 종목, 실행 가능 row ${analysis.coverage.executableRows}개, 수동·미확인 row ${analysis.coverage.manualRows || 0}개)`);
  }
  const readiness = renderReadinessSummary(analysis.readiness);
  if (readiness) {
    lines.push('');
    lines.push(readiness);
  }
  lines.push('');
  lines.push('**비용 비교**');
  const displaySizes = (analysis.sizes?.length ? analysis.sizes : DEFAULT_SIZES);
  lines.push(`| 종목 | 추천 경로 | ${displaySizes.map(formatSizeHeader).join(' | ')} | 신뢰도 | 핵심 이유 |`);
  lines.push(`|---|---:|${displaySizes.map(() => '---:').join('|')}|---:|---|`);
  for (const recommendation of analysis.recommendations) {
    const bestRoute = recommendation.best ? `${recommendation.best.venue} / ${productLabel(recommendation.best.productClass)}` : 'n/a';
    const cells = displaySizes.map((size) => formatCostCell(recommendation.sizeSummary?.[size]));
    const confidence = recommendation.best ? `${Math.round(recommendation.best.dataConfidence ?? 0)}/100 ${recommendation.best.dataQuality || ''}` : 'n/a';
    const why = recommendation.best
      ? `${recommendation.best.representativeSizeUsd} USD 기준 ${formatBps(recommendation.best.representativeCostBps)}, 상품 적합도 ${Math.round(recommendation.best.productFit)}/100`
      : '실행 가능한 공개 경로 부족';
    lines.push(`| ${recommendation.symbol} | ${bestRoute} | ${cells.join(' | ')} | ${confidence} | ${why} |`);
  }
  const routeCheckMarkdown = renderRouteChecksSection(analysis.routeChecks || []);
  if (routeCheckMarkdown) {
    lines.push('');
    lines.push(routeCheckMarkdown);
  }
  lines.push('');
  lines.push('**주의할 점**');
  const warnings = [...new Set(analysis.recommendations.flatMap((recommendation) => recommendation.warnings))];
  if (warnings.length) {
    for (const warning of warnings) lines.push(`- ${warning}`);
  } else {
    lines.push('- 주요 경고 없음. 그래도 계정별 수수료, 출금, 브릿지, 환매 조건은 별도 확인해야 합니다.');
  }
  const missing = analysis.recommendations.flatMap((recommendation) => recommendation.missing.map((item) => `${recommendation.symbol} ${item}`));
  if (missing.length) {
    lines.push('- 수동 확인 필요: ' + missing.slice(0, 8).map(koreanizeMissing).join('; ') + (missing.length > 8 ? '; ...' : ''));
  }
  const failedSources = (analysis.sources || []).filter((item) => item.ok === false);
  if (failedSources.length) {
    lines.push('- 데이터 소스 실패: ' + failedSources.slice(0, 4).map((item) => item.label).join(', ') + (failedSources.length > 4 ? ', ...' : ''));
  }
  lines.push('');
  lines.push('투자 권유가 아니라 실행 비용, 보유 비용, 상품 구조 비교입니다.');
  return lines.join('\n');
}

function renderConclusion(analysis) {
  const recommendations = analysis.recommendations || [];
  if (recommendations.length > 3) {
    const topRoutes = (analysis.readiness?.topRoutes || []).slice(0, 5);
    const topText = topRoutes.length ? ` 상위 route: ${topRoutes.join('; ')}.` : '';
    return `${recommendations.length}개 tokenized-equity 후보를 ${intentLabel(analysis.intent)} 기준으로 스캔했습니다.${topText}`;
  }
  const topSummaries = recommendations.map((recommendation) => {
    if (!recommendation.best) return `${recommendation.symbol}: 실행 가능한 공개 quote가 부족합니다.`;
    return `${recommendation.symbol}: ${recommendation.best.venue} (${recommendation.best.marketSymbol})가 현재 ${intentLabel(analysis.intent)} 기준 1순위입니다.`;
  });
  return topSummaries.join(' ');
}

function renderReadinessSummary(readiness) {
  if (!readiness || readiness.symbols <= 1) return '';
  const rows = [
    ['스캔 종목', `${readiness.symbols}개`, '전역 discovery 범위'],
    ['정확 xStocks 현물 실행 가능', `${readiness.exactSpotSymbols.length}개`, summarizeSymbolList(readiness.exactSpotSymbols)],
    ['대체 RWA/pre-market 실행 가능', `${readiness.alternativeSymbols.length}개`, summarizeSymbolList(readiness.alternativeSymbols)],
    ['Perp 노출 존재', `${readiness.perpSymbols.length}개`, '장기 보유 추천군과 분리'],
    ['Mantle 배포 확인', `${readiness.mantleDeployedSymbols.length}개`, summarizeSymbolList(readiness.mantleDeployedSymbols)],
    ['Mantle public quote 실행 가능', `${readiness.mantleExecutableSymbols.length}개`, summarizeSymbolList(readiness.mantleExecutableSymbols)],
    ['RFQ/API-key layer 필요', `${readiness.mantleRfqRequiredSymbols.length}개`, summarizeSymbolList(readiness.mantleRfqRequiredSymbols)],
  ];
  return [
    '**실행 준비도 요약**',
    '| 항목 | 결과 | 해석 |',
    '|---|---:|---|',
    ...rows.map(([label, value, note]) => `| ${label} | ${value} | ${note} |`),
  ].join('\n');
}

function summarizeSymbolList(symbols, max = 5) {
  if (!symbols?.length) return '없음';
  const shown = symbols.slice(0, max).join(', ');
  return symbols.length > max ? `${shown} 외 ${symbols.length - max}개` : shown;
}

export function renderRouteChecksMarkdown(analysis) {
  return renderRouteChecksSection(analysis.routeChecks || [], { title: '# Mantle Route Check' })
    || '# Mantle Route Check\n\nNo Mantle or onchain manual-check route was found in this run.';
}

function renderRouteChecksSection(routeChecks, { title = '**Mantle route check**' } = {}) {
  const checks = routeChecks.filter((check) => check.venue === 'Mantle xStocks');
  if (!checks.length) return '';
  const lines = [title];
  lines.push('| 종목 | route | 상태 | 확인된 것 | quote/depth 결과 | 남은 한계 |');
  lines.push('|---|---|---|---|---|---|');
  for (const check of checks) {
    const cells = [
      check.symbol,
      `${check.venue}<br>${check.marketSymbol || ''}`,
      routeStatusLabel(check.status),
      tableList(check.confirmed),
      tableList(check.execution),
      tableList(check.missing),
    ].map(escapeTableCell);
    lines.push(`| ${cells.join(' | ')} |`);
  }
  lines.push('');
  lines.push('해석: Mantle row는 배포 확인만으로 랭킹하지 않고, Fluxion quote, Merchant Moe LBQuoter, pool telemetry, xChange 인증 상태를 분리해서 검증합니다.');
  return lines.join('\n');
}

function routeStatusLabel(status) {
  return {
    ok: '실행 가능',
    manual_check: '수동 확인',
    quote_failed: 'quote 실패',
    unavailable: '미지원/미확인',
    partial: '부분 체결',
  }[status] || status || '미확인';
}

function tableList(items) {
  return (items || []).length ? items.join('<br>') : 'n/a';
}

function escapeTableCell(value) {
  return String(value ?? '').replaceAll('|', '\\|');
}

function intentLabel(intent) {
  return {
    'long-hold': '장기 보유',
    'short-trade': '단기 매매',
    'self-custody': '셀프커스터디',
    'perp-hedge': '선물/헤지',
  }[intent] || intent;
}

function productLabel(productClass) {
  return {
    spot_tokenized_stock: '토큰화 주식 현물',
    onchain_tokenized_stock: '온체인 토큰화 주식',
    tokenized_stock_alt: '대체 RWA 주식 토큰',
    pre_market_stock_alt: '프리마켓 대체 토큰',
    perpetual_future: '무기한 선물',
  }[productClass] || productClass;
}

function formatSizeHeader(sizeUsd) {
  if (sizeUsd >= 1000 && sizeUsd % 1000 === 0) return `${sizeUsd / 1000}k`;
  return `${sizeUsd} USD`;
}

function koreanizeMissing(text) {
  return text
    .replace('Mantle deployment exists in xStocks metadata.', 'xStocks 메타데이터상 Mantle 배포는 확인됨')
    .replace('Set ENABLE_JUPITER=1 to fetch live Solana route quotes.', 'Solana/Jupiter 실시간 quote는 ENABLE_JUPITER=1 설정 후 확인')
    .replace('No Mantle deployment in xStocks public asset list', 'xStocks 공개 자산 목록에서 Mantle 배포 확인 안 됨')
    .replace('No Solana deployment in xStocks public asset list', 'xStocks 공개 자산 목록에서 Solana 배포 확인 안 됨')
    .replace('No public orderbook', '공개 오더북 없음')
    .replace('No executable quote', '실행 가능한 quote 없음');
}

function formatCostCell(cost) {
  if (!cost || cost.costUsd == null) return 'n/a';
  return `${formatUsd(cost.costUsd)} (${formatBps(cost.costBps)})`;
}

function formatUsd(value) {
  if (!Number.isFinite(value)) return 'n/a';
  return `$${round(value, 2).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatBps(value) {
  if (!Number.isFinite(value)) return 'n/a';
  return `${round(value, 1)} bps`;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
