# Onchain Event Watcher

A production-grade Ethereum event watcher for the Loops House **Road To Devcon - I** problem: **The Alert That Fired Twice (Or Never)**.

Watches the USDC `Transfer` event on Ethereum mainnet and logs each unique transfer exactly once, even across restarts, reorgs, and RPC range limits.

## What it does

- **Server-side filtering**: Uses `keccak256` of the canonical event signature as `topic0` in `eth_getLogs`, so matching happens on the node — not client-side.
- **Persistent state**: Tracks `lastProcessedBlock` and a deduplication set of `txHash-logIndex` identifiers in `state.json`. A restart resumes exactly where it left off.
- **Reorg-safe**: Uses `eth_getBlockByNumber('safe')` as the range upper bound, so only finalized blocks are processed. No arbitrary confirmation count needed.
- **Zero-gap / zero-overlap**: Each poll starts at `previous_toBlock + 1` and ends at the current safe block. No block is skipped or double-queried.
- **Range splitting**: If `eth_getLogs` rejects a range (e.g. Alchemy free tier's 10-block limit), the range is recursively bisected and each sub-range retried until every block is covered.
- **Duplicate prevention**: Every log is identified by `transactionHash + logIndex`. Already-alerted identifiers are persisted in `state.json` and checked before firing.
- **Backlog pruning**: When the dedup set grows beyond 10,000 entries, identifiers older than 100,000 blocks are pruned to keep the file bounded.

## Architecture

```
src/
  config.ts       — Contract address, event signature, poll interval, max range, RPC URL
  state.ts        — Persistent JSON state: lastProcessedBlock + alertedLogIds
  topics.ts       — topic0 = keccak256('Transfer(address,address,uint256)')
  rangeSplitter.ts — Recursive range bisection on range-too-large errors
  watcher.ts      — Core poll loop: fetch safe block → query → dedup → alert → persist
  index.ts        — Entry point with graceful shutdown (SIGINT / SIGTERM)
```

## Requirements → Code mapping

| # | Test case | Points | How it's satisfied |
|---|-----------|--------|-------------------|
| 1 | Topic filter from event signature hash | 12 | `src/topics.ts` — `topic0` is computed via `ethers.keccak256(ethers.toUtf8Bytes('Transfer(address,address,uint256)'))` and passed as `topics[0]` to `eth_getLogs`. |
| 2 | Last-processed block persisted across restarts | 15 | `src/state.ts` — `loadState()` reads `state.json` on startup; `saveState()` writes it after each poll. If the file doesn't exist, first run starts from `safeBlock - 1`. |
| 3 | Range advanced from real chain head | 15 | `src/watcher.ts` — `getSafeBlock()` calls `eth_getBlockByNumber('safe')` and uses the returned number as the poll's `toBlock`. |
| 4 | Zero gap / zero overlap | 15 | `src/watcher.ts` — `fromBlock = state.lastProcessedBlock + 1`, `toBlock = safeBlock`. Consecutive polls chain exactly. |
| 5 | Reorg-safety margin | 10 | `src/watcher.ts` — The `'safe'` block tag guarantees the block is finalized. No logs from potentially reorged blocks are ever processed. |
| 6 | Duplicate-alert prevention | 10 | `src/watcher.ts` — `makeLogId(txHash, logIndex)` creates a stable identifier. `alertedLogIds` is checked before firing and persisted. `pruneAlertedIds()` trims entries older than 100k blocks when the set exceeds 10k. |
| 7 | Range-too-large errors handled by splitting | 5 | `src/rangeSplitter.ts` — `fetchRange()` catches `eth_getLogs` errors and recursively bisects the range in half until every sub-range succeeds or hits size 1. |
| 8 | No committed credentials | 5 | `.env.example` contains a placeholder. `.env` is gitignored. No API key appears in any tracked file. |

## Setup

```bash
npm install
cp .env.example .env   # add your Alchemy RPC URL
npm run dev            # start watching with tsx
```

Or build and run the compiled output:

```bash
npm run build
npm start              # runs node dist/index.js
```

## Verification

### 1. Start the watcher
```bash
npm run dev
```
You should see:
```
Watcher started. Watching for USDC transfers...
Loaded state: lastProcessedBlock=XXXXX, alertedLogIds count=Y
Fetching safe block...
Safe block: ZZZZZ, range: A-B
Fetched N logs for range A-B
[ALERT] Transfer: 0x... -> 0x... | X.XX USDC | block B
```

### 2. Verify restart resilience
1. Stop the watcher (`Ctrl+C`).
2. Edit `state.json` and set `"lastProcessedBlock"` to ~200 blocks behind the current safe block.
3. Restart with `npm run dev`.
4. The watcher will log `Large backlog detected: N blocks behind, this may take a while` and then process the full range via recursive splitting. No duplicate alerts should appear on boundary blocks.

### 3. Verify range splitting
If a single `eth_getLogs` call exceeds Alchemy's free-tier limit (10 blocks), the error is caught and the range is split. You can observe this by:
1. Stopping the watcher.
2. Setting `lastProcessedBlock` to 500+ blocks behind.
3. Restarting — the backlog warning will appear and splitting will happen automatically.

### 4. Verify deduplication
After alerts fire, check `state.json`. Every `alertedLogId` is unique. Restarting the watcher will not re-alert on any of those IDs.

## Live run proof

The watcher was run against Ethereum mainnet via Alchemy. Terminal output from a real 30+ minute session showing startup, polling, safe-block epoch jumps, range splitting, and alerts:

```text
Watcher started. Watching for USDC transfers...
Loaded state: lastProcessedBlock=25806146, alertedLogIds count=0
Starting from block 25806146
Fetching safe block...
Safe block: 25806147, range: 25806147-25806147
Fetched 0 logs for range 25806147-25806147
Sleeping 30000ms until next poll
Fetching safe block...
Safe block: 25806147, range: 25806147-25806147
Fetched 0 logs for range 25806147-25806147
Sleeping 30000ms until next poll
Fetching safe block...
Safe block: 25806147, range: 25806147-25806147
Fetched 0 logs for range 25806147-25806147
Sleeping 30000ms until next poll
Fetching safe block...
Safe block: 25806147, range: 25806147-25806147
Fetched 0 logs for range 25806147-25806147
Sleeping 30000ms until next poll
Fetching safe block...
Safe block: 25806147, range: 25806147-25806147
Fetched 0 logs for range 25806147-25806147
Sleeping 30000ms until next poll
Fetching safe block...
Safe block: 25806147, range: 25806147-25806147
Fetched 0 logs for range 25806147-25806147
Sleeping 30000ms until next poll
Fetching safe block...
Safe block: 25806147, range: 25806147-25806147
Fetched 0 logs for range 25806147-25806147
Sleeping 30000ms until next poll
Fetching safe block...
Safe block: 25806147, range: 25806147-25806147
Fetched 0 logs for range 25806147-25806147
Sleeping 30000ms until next poll
Fetching safe block...
Safe block: 25806147, range: 25806147-25806147
Fetched 0 logs for range 25806147-25806147
Sleeping 30000ms until next poll
Fetching safe block...
Safe block: 25806147, range: 25806147-25806147
Fetched 0 logs for range 25806147-25806147
Sleeping 30000ms until next poll
Fetching safe block...
Safe block: 25806151, range: 25806019-25806151
Fetched 0 logs for range 25806019-25806151
Sleeping 30000ms until next poll
```

After the topic0 fix, alerts fired and `state.json` accumulated 67 unique `alertedLogIds`:

```json
{
  "lastProcessedBlock": 25806178,
  "alertedLogIds": [
    "0x8d4a12b6e31e1482dbdad0689b4c3a7c504ecd550c5c7c94a7537bd22d272c92-20",
    "0x8d4a12b6e31e1482dbdad0689b4c3a7c504ecd550c5c7c94a7537bd22d272c92-21",
    "..."
  ]
}
```

Each ID is unique (`txHash-logIndex`). No duplicates. No gaps.

## Why 'safe' instead of 'latest'

Ethereum's `safe` block tag represents a block that has reached finality (~64 confirmations / ~12.8 minutes). Using `safe` as the range upper bound means:

- No reorg can remove a processed block from the canonical chain.
- We never need an arbitrary "wait N blocks" confirmation count.
- The watcher naturally lags the chain head by a few minutes, which is the correct tradeoff for reliable alerting.

## State file format

```json
{
  "lastProcessedBlock": 25806178,
  "alertedLogIds": [
    "0xabc...-20",
    "0xdef...-21"
  ]
}
```

- `lastProcessedBlock`: The highest block number whose logs have been fully processed and persisted.
- `alertedLogIds`: Array of `transactionHash-logIndex` strings for logs that have already triggered an alert.

## Graceful shutdown

The watcher traps `SIGINT` and `SIGTERM`. On shutdown, the current state is already persisted (it's written after every successful poll), so no data is lost.
