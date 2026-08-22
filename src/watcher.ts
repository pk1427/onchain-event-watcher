// Core poll loop: fetch safe block, query logs, dedup, alert, persist state.

import { ethers, JsonRpcProvider } from 'ethers'
import { CONFIG } from './config'
import { State, loadState, saveState } from './state'
import { fetchRange } from './rangeSplitter'
import { topic0 } from './topics'

export async function getSafeBlock(provider: JsonRpcProvider): Promise<number> {
  const block = await provider.send('eth_getBlockByNumber', ['safe', false])
  return Number(block.number)
}

export function makeLogId(txHash: string, logIndex: number, blockNumber: number): string {
  return `${txHash}-${logIndex}-${blockNumber}`
}

export function pruneAlertedIds(state: State, currentBlock: number, window: number = 100_000): State {
  if (state.alertedLogIds.length <= 10_000) return state
  const cutoff = currentBlock - window
  const kept = state.alertedLogIds.filter((id) => {
    const parts = id.split('-')
    const blockNum = Number(parts[parts.length - 1])
    return blockNum >= cutoff
  })
  return { ...state, alertedLogIds: kept }
}

export interface PollResult {
  logsFound: number
  alertsFired: number
  toBlock: number
  state: State
}

export async function poll(provider: JsonRpcProvider, currentState: State): Promise<PollResult> {
  const safeBlock = await getSafeBlock(provider)
  let state = currentState

  if (safeBlock <= state.lastProcessedBlock) {
    return { logsFound: 0, alertsFired: 0, toBlock: state.lastProcessedBlock, state }
  }

  const fromBlock = state.lastProcessedBlock + 1
  const toBlock = safeBlock
  console.log(`Safe block: ${safeBlock}, range: ${fromBlock}-${toBlock}`)

  const logs = await fetchRange(
    async ({ fromBlock: fb, toBlock: tb }) => {
      const result = await provider.send('eth_getLogs', [
        {
          address: CONFIG.contractAddress,
          topics: [topic0],
          fromBlock: '0x' + fb.toString(16),
          toBlock: '0x' + tb.toString(16),
        },
      ])
      return result.map((log: any) => ({
        blockNumber: BigInt(log.blockNumber),
        logIndex: Number(log.logIndex),
        transactionHash: log.transactionHash,
        topics: log.topics,
        data: log.data,
      }))
    },
    fromBlock,
    toBlock,
  )

  console.log(`Fetched ${logs.length} logs for range ${fromBlock}-${toBlock}`)

  let alertsFired = 0
  for (const log of logs) {
    const logBlockNum = Number(log.blockNumber)
    const logId = makeLogId(log.transactionHash, Number((log as any).logIndex), logBlockNum)
    if (state.alertedLogIds.includes(logId)) continue

    const fromAddr = '0x' + log.topics[1].slice(26)
    const toAddr = '0x' + log.topics[2].slice(26)
    const value = ethers.formatUnits(log.data, 6)

    console.log(`[ALERT] Transfer: ${fromAddr} -> ${toAddr} | ${value} USDC | block ${logBlockNum}`)
    alertsFired++

    state = {
      ...state,
      alertedLogIds: [...state.alertedLogIds, logId],
    }
  }

  state = {
    ...state,
    lastProcessedBlock: toBlock,
  }
  state = pruneAlertedIds(state, safeBlock)
  saveState(state)

  return { logsFound: logs.length, alertsFired, toBlock, state }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export async function startWatcher(): Promise<void> {
  const provider = new JsonRpcProvider(CONFIG.rpcUrl)

  console.log('Watcher started. Watching for USDC transfers...')
  const safeBlock = await getSafeBlock(provider)
  let state = loadState(safeBlock)
  console.log(`Loaded state: lastProcessedBlock=${state.lastProcessedBlock}, alertedLogIds count=${state.alertedLogIds.length}`)
  console.log(`Starting from block ${state.lastProcessedBlock}`)

  while (true) {
    try {
      const result = await poll(provider, state)
      state = result.state
      await sleep(CONFIG.pollIntervalMs)
    } catch (err) {
      console.error('Poll error:', err)
      console.error('Stack:', (err as Error).stack)
      console.log(`Sleeping 5000ms before retry`)
      await sleep(5000)
    }
  }
}
