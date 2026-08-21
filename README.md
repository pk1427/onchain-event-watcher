# Onchain Event Watcher

USDC Transfer event watcher for the Loops House "Road To Devcon - I" problem: **The Alert That Fired Twice (Or Never)**.

## How it works

A long-running Node.js process that polls Ethereum mainnet for USDC `Transfer` events, deduplicates alerts by `transactionHash-logIndex`, and persists state to a local JSON file so it can resume after restarts without gaps, overlaps, or duplicate alerts.

## Requirements coverage

| Requirement | Points | File / Function |
|-------------|--------|-----------------|
| Topic filter from keccak256(eventSignature) as topic0 via eth_getLogs | 12pt | `src/topics.ts` — `topic0`, `filter` |
| Persist last-processed block to local JSON, reload on startup | 15pt | `src/state.ts` — `loadState()`, `saveState()` |
| Advance upper bound from real chain-head via eth_getBlockByNumber('safe') | 15pt | `src/watcher.ts` — `getSafeBlock()` |
| Zero gap / zero overlap: fromBlock = previous toBlock + 1 | 15pt | `src/watcher.ts` — `poll()` sets `fromBlock = state.lastProcessedBlock + 1` |
| Reorg-safety via 'safe' block tag | 10pt | `src/watcher.ts` — `getSafeBlock()` uses `'safe'` |
| Deduplicate via txHash + logIndex, persisted set, prune periodically | 10pt | `src/watcher.ts` — `makeLogId()`, `alertedLogIds`, `pruneAlertedIds()` |
| Range-too-large error bisection / recursive split | 5pt | `src/rangeSplitter.ts` — `fetchRange()` recursively bisects |
| No API key in tracked files; .env + .gitignore | 5pt | `.env.example`, `.gitignore` |

## Setup

1. Copy `.env.example` to `.env` and set your RPC URL.
2. Install deps: `npm install`
3. Start watcher: `npm start`

## Test restart / gap-splitting

1. Start the watcher and let it process a few blocks.
2. Stop it (`Ctrl+C`).
3. Edit `state.json` and set `"lastProcessedBlock"` to ~200 blocks behind the current safe block.
4. Restart — the watcher will use recursive range-splitting to process the full backlog without crashing, without gaps, and without duplicate alerts on boundary blocks.
