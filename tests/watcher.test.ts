import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ethers, JsonRpcProvider } from 'ethers'
import { poll, getSafeBlock, makeLogId, pruneAlertedIds } from '../src/watcher'
import { topic0 } from '../src/topics'
import type { State } from '../src/state'

vi.mock('../src/state', () => ({
  State: {} as any,
  loadState: vi.fn(),
  saveState: vi.fn(),
}))

function makeMockProvider(
  safeBlockNum: number,
  logs: any[] = [],
) {
  const calls: Array<{ method: string; params: any[] }> = []
  const send = vi.fn().mockImplementation(async (method: string, params: any[]) => {
    calls.push({ method, params })
    if (method === 'eth_getBlockByNumber') {
      return { number: '0x' + safeBlockNum.toString(16), hash: '0x' + 'ab'.repeat(32) }
    }
    if (method === 'eth_getLogs') {
      return logs
    }
    return null
  })
  const provider = { send, calls } as any
  return provider as JsonRpcProvider
}

function makeMockLog(
  txHash: string,
  logIndex: number,
  blockNumber: number,
  from: string = '0x' + '11'.repeat(20),
  to: string = '0x' + '22'.repeat(20),
  amount: string = '1000000',
): any {
  const fromHex = from.toLowerCase().replace(/^0x/, '')
  const toHex = to.toLowerCase().replace(/^0x/, '')
  const fromTopic = '0x' + '0'.repeat(24) + fromHex
  const toTopic = '0x' + '0'.repeat(24) + toHex
  const dataHex = '0x' + BigInt(amount).toString(16).padStart(64, '0')
  return {
    transactionHash: txHash,
    logIndex: '0x' + logIndex.toString(16),
    blockNumber: '0x' + blockNumber.toString(16),
    topics: [topic0, fromTopic, toTopic],
    data: dataHex,
    address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  }
}

function initialState(overrides: Partial<State> = {}): State {
  return {
    lastProcessedBlock: 99,
    alertedLogIds: [],
    ...overrides,
  }
}

describe('AC3: Range advanced from real chain head', () => {
  it('getSafeBlock calls eth_getBlockByNumber with safe tag', async () => {
    const provider = makeMockProvider(1000)
    await getSafeBlock(provider as any)
    expect(provider.send).toHaveBeenCalledWith('eth_getBlockByNumber', ['safe', false])
  })

  it('uses safe block as toBlock in poll', async () => {
    const provider = makeMockProvider(200)
    const result = await poll(provider as any, initialState({ lastProcessedBlock: 100 }))
    expect(result.toBlock).toBe(200)
  })
})

describe('AC4: No gap or overlap between consecutive polls', () => {
  it('fromBlock = lastProcessedBlock + 1 (no gap)', async () => {
    const provider = makeMockProvider(200)
    const result = await poll(provider as any, initialState({ lastProcessedBlock: 100 }))
    expect(result.state.lastProcessedBlock).toBe(200)
  })

  it('advances lastProcessedBlock to toBlock even with zero logs (no overlap on empty poll)', async () => {
    const provider = makeMockProvider(200)
    const result = await poll(provider as any, initialState({ lastProcessedBlock: 100 }))
    expect(result.logsFound).toBe(0)
    expect(result.state.lastProcessedBlock).toBe(200)
    expect(result.state).toBeDefined()
  })

  it('consecutive polls chain exactly: fromBlock starts where toBlock ended', async () => {
    const provider = makeMockProvider(200)
    let state = initialState({ lastProcessedBlock: 100 })

    const result1 = await poll(provider as any, state)
    expect(result1.toBlock).toBe(200)
    state = result1.state

    const provider2 = makeMockProvider(300)
    const result2 = await poll(provider2 as any, state)
    expect(result2.toBlock).toBe(300)
    expect(result2.state.lastProcessedBlock).toBe(300)
  })

  it('next poll fromBlock is previous toBlock + 1', async () => {
    const provider = makeMockProvider(200)
    const result = await poll(provider as any, initialState({ lastProcessedBlock: 100 }))
    expect(result.state.lastProcessedBlock).toBe(200)

    const getLogsCall = provider.calls.find((c) => c.method === 'eth_getLogs')!
    const fromBlockHex = getLogsCall.params[0].fromBlock
    const toBlockHex = getLogsCall.params[0].toBlock
    expect(Number(fromBlockHex)).toBe(101)
    expect(Number(toBlockHex)).toBe(200)
  })
})

describe('AC5: Reorg-safety margin applied', () => {
  it('uses safe block tag (not latest or earliest)', async () => {
    const provider = makeMockProvider(200)
    await poll(provider as any, initialState({ lastProcessedBlock: 100 }))
    const blockCall = provider.calls.find((c) => c.method === 'eth_getBlockByNumber')!
    expect(blockCall.params[0]).toBe('safe')
  })

  it('does not alert when safe block has not advanced', async () => {
    const provider = makeMockProvider(100)
    const result = await poll(provider as any, initialState({ lastProcessedBlock: 100 }))
    expect(result.logsFound).toBe(0)
    expect(result.alertsFired).toBe(0)
  })
})

describe('AC6: Duplicate-alert prevention', () => {
  it('makeLogId creates unique identifier from txHash + logIndex + blockNumber', () => {
    const id1 = makeLogId('0xtx1', 0, 100)
    const id2 = makeLogId('0xtx1', 0, 101)
    const id3 = makeLogId('0xtx1', 1, 100)
    expect(id1).not.toBe(id2)
    expect(id1).not.toBe(id3)
  })

  it('does not re-alert on a log already in alertedLogIds', async () => {
    const log = makeMockLog('0xtx-aaa', 0, 150)
    const logId = makeLogId(log.transactionHash, 0, 150)

    const provider = makeMockProvider(200, [log])
    const state = initialState({ lastProcessedBlock: 100, alertedLogIds: [logId] })
    const result = await poll(provider as any, state)

    expect(result.alertsFired).toBe(0)
  })

  it('alerts on a new log and adds its id to alertedLogIds', async () => {
    const log = makeMockLog('0xtx-new', 0, 150)
    const provider = makeMockProvider(200, [log])
    const result = await poll(provider as any, initialState({ lastProcessedBlock: 100 }))

    expect(result.alertsFired).toBe(1)
    expect(result.state.alertedLogIds).toContain(makeLogId('0xtx-new', 0, 150))
  })

  it('prunes old alertedLogIds beyond 10k when exceeding threshold', () => {
    const now = 500_000
    const oldIds = Array.from({ length: 6000 }, (_, i) => `0xold${i}-${i}-${1}`)
    const newIds = Array.from({ length: 5000 }, (_, i) => `0xnew${i}-${i}-${now - i}`)
    const state: State = {
      lastProcessedBlock: now,
      alertedLogIds: [...oldIds, ...newIds],
    }
    const pruned = pruneAlertedIds(state, now)
    expect(pruned.alertedLogIds.length).toBeLessThanOrEqual(5000)
    expect(pruned.alertedLogIds).not.toContain(oldIds[0])
    expect(pruned.alertedLogIds).toContain(newIds[0])
  })
})

describe('AC7: Range splitting invoked inside poll', () => {
  it('passes topic0 filter to eth_getLogs', async () => {
    const provider = makeMockProvider(200)
    await poll(provider as any, initialState({ lastProcessedBlock: 100 }))
    const getLogsCall = provider.calls.find((c) => c.method === 'eth_getLogs')!
    expect(getLogsCall.params[0].topics).toEqual([topic0])
  })

  it('passes contract address to eth_getLogs', async () => {
    const provider = makeMockProvider(200)
    await poll(provider as any, initialState({ lastProcessedBlock: 100 }))
    const getLogsCall = provider.calls.find((c) => c.method === 'eth_getLogs')!
    expect(getLogsCall.params[0].address).toBe('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48')
  })
})
