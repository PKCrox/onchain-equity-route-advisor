#!/usr/bin/env node
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  DEFAULT_HOLDING_DAYS,
  DEFAULT_SIZES,
  analyzeSnapshot,
  buildSnapshotFromFixture,
  collectLiveSnapshot,
  costsToCsv,
  parseCsvNumbers,
  parseSymbols,
  renderMarkdown,
  renderRouteChecksMarkdown,
} from './route-advisor-core.mjs';

function parseArgs(argv) {
  const args = {
    symbols: ['SPCXx'],
    sizes: DEFAULT_SIZES,
    holdingDays: DEFAULT_HOLDING_DAYS,
    format: ['markdown'],
    outputDir: null,
    fixture: null,
    maxSymbols: 12,
    intent: 'long-hold',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (token === '--symbols') {
      args.symbols = parseSymbols(next);
      index += 1;
    } else if (token === '--sizes') {
      args.sizes = parseCsvNumbers(next);
      index += 1;
    } else if (token === '--holding-days') {
      args.holdingDays = parseCsvNumbers(next).map((value) => Math.trunc(value));
      index += 1;
    } else if (token === '--format') {
      args.format = String(next || '').split(',').map((value) => value.trim()).filter(Boolean);
      index += 1;
    } else if (token === '--output-dir') {
      args.outputDir = next;
      index += 1;
    } else if (token === '--fixture') {
      args.fixture = next;
      index += 1;
    } else if (token === '--max-symbols') {
      args.maxSymbols = Number.parseInt(next, 10);
      index += 1;
    } else if (token === '--intent') {
      args.intent = next || args.intent;
      index += 1;
    } else if (token === '--help' || token === '-h') {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
  }

  if (!args.sizes.length) throw new Error('--sizes must include at least one number');
  if (!args.holdingDays.length) throw new Error('--holding-days must include at least one number');
  if (!args.format.length) throw new Error('--format must include markdown and/or json');
  return args;
}

function helpText() {
  return `Usage:
  node mantle-research-challenge/scripts/run-route-advisor.mjs \\
    --symbols auto \\
    --sizes 1000,5000,10000 \\
    --holding-days 7,14,30 \\
    --format markdown,json \\
    --output-dir mantle-research-challenge/artifacts/latest

Options:
  --symbols        Comma-separated xStocks symbols or "auto".
  --sizes          USD notional sizes to simulate.
  --holding-days   Funding/holding windows for perp routes.
  --format         markdown, json, or markdown,json.
  --fixture        Read a saved raw snapshot JSON instead of live APIs.
  --output-dir     Write report.md, raw.json, and cost-table.csv.
  --intent         long-hold, short-trade, self-custody, or perp-hedge.
`;
}

export async function runCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(helpText());
    return;
  }

  const snapshot = args.fixture
    ? buildSnapshotFromFixture(JSON.parse(await readFile(args.fixture, 'utf8')))
    : await collectLiveSnapshot({
        symbols: args.symbols,
        maxSymbols: args.maxSymbols,
        sizes: args.sizes,
        holdingDays: args.holdingDays,
      });

  const analysis = analyzeSnapshot(snapshot, {
    sizes: args.sizes,
    holdingDays: args.holdingDays,
    intent: args.intent,
  });
  const markdown = renderMarkdown(analysis);
  const csv = costsToCsv(analysis.costRows);

  if (args.format.includes('markdown')) {
    console.log(markdown);
  }
  if (args.format.includes('json')) {
    console.log(JSON.stringify(analysis, null, 2));
  }

  if (args.outputDir) {
    await mkdir(args.outputDir, { recursive: true });
    await writeFile(path.join(args.outputDir, 'report.md'), `${markdown}\n`);
    await writeFile(path.join(args.outputDir, 'raw.json'), `${JSON.stringify(snapshot, null, 2)}\n`);
    await writeFile(path.join(args.outputDir, 'analysis.json'), `${JSON.stringify(analysis, null, 2)}\n`);
    await writeFile(path.join(args.outputDir, 'cost-table.csv'), `${csv}\n`);
    await writeFile(path.join(args.outputDir, 'sources.md'), `${renderSources(snapshot)}\n`);
    await writeFile(path.join(args.outputDir, 'mantle-route-check.md'), `${renderRouteChecksMarkdown(analysis)}\n`);
    await writeFile(path.join(args.outputDir, 'mantle-skill-chain.md'), `${renderMantleSkillChain(analysis)}\n`);
  }
}

function renderSources(snapshot) {
  const lines = ['# Sources', ''];
  for (const item of snapshot.sources || []) {
    const status = item.ok ? 'ok' : 'failed';
    const note = item.note ? ` - ${item.note}` : '';
    lines.push(`- ${status}: ${item.label} (${item.url})${note}`);
  }
  if (!snapshot.sources?.length) {
    lines.push('- No source log was included in this fixture.');
  }
  return lines.join('\n');
}

function renderMantleSkillChain(analysis) {
  const lines = [
    '# Mantle AI Agent Skills Chain',
    '',
    'Official source: https://github.com/mantle-xyz/mantle-skills',
    '',
    'This run uses the Mantle Agent Skills pattern as a chained workflow, not as an execution bot.',
    '',
    '| Stage | Official Mantle Skill | Status in this run | Evidence |',
    '|---|---|---|---|',
  ];
  const hasMantleManual = analysis.costRows?.some((row) => row.venue === 'Mantle xStocks');
  const hasMerchantMoeQuote = analysis.costRows?.some((row) => row.venue === 'Mantle xStocks' && row.status === 'ok' && row.quoteSource === 'Merchant Moe LBQuoter');
  const mantleQuoteFailures = [...new Set((analysis.costRows || [])
    .filter((row) => row.venue === 'Mantle xStocks' && row.status !== 'ok')
    .map((row) => row.reason || row.status)
    .filter(Boolean))];
  const hasHighCostOrPartial = analysis.costRows?.some((row) => row.status === 'partial' || (row.costBps != null && row.costBps > 250));
  const hasPerps = analysis.costRows?.some((row) => row.routeType === 'perp');
  lines.push(`| Mantle venue discovery | mantle-defi-operator | ${hasMantleManual ? 'quote_probe / compare_only' : 'not_available'} | Mantle route is not ranked without executable RFQ or pool quote evidence. |`);
  lines.push(`| Public quote fallback | mantle-readonly-debugger + mantle-defi-operator | ${hasMerchantMoeQuote ? 'lbquoter_rpc_ok' : 'lbquoter_rpc_checked'} | Fluxion public quote failures are followed by direct Merchant Moe LBQuoter eth_call checks on Mantle RPC. |`);
  lines.push(`| Mantle quote preflight | mantle-readonly-debugger | ${mantleQuoteFailures.length ? `partial/fail: ${mantleQuoteFailures.join(', ')}` : 'no_failure_or_not_checked'} | Size-specific failures remain visible instead of becoming a generic no-data result. |`);
  lines.push(`| Liquidity/slippage preflight | mantle-risk-evaluator | ${hasHighCostOrPartial ? 'warn/block style caveats emitted' : 'pass-style for executable rows'} | Order-book round trips at ${analysis.sizes?.join('/')} USD and confidence caps. |`);
  lines.push(`| Historical Mantle analytics | mantle-data-indexer | pool telemetry proxy only | Merchant Moe/DexScreener pool liquidity and volume are labeled separately from LBQuoter executable slippage. |`);
  lines.push(`| Synthetic exposure separation | mantle-risk-evaluator | ${hasPerps ? 'warn' : 'not_applicable'} | Perps include time-windowed funding and are excluded from long-hold spot recommendations. |`);
  lines.push('');
  lines.push('Submission-safe claim: this tool is an Agent Skill that explicitly chains Mantle official skills, then adds a missing execution-readiness layer for public quote fallback, size-specific LBQuoter checks, and route-quality caveats.');
  lines.push('Non-claim: this run did not sign, broadcast, or execute a Mantle transaction.');
  return lines.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli().catch((error) => {
    console.error(error?.stack || String(error));
    process.exitCode = 1;
  });
}
