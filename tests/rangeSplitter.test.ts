import { describe, it, expect, vi } from 'vitest'
import { fetchRange } from '../src/rangeSplitter'

describe('AC7: Range-too-large errors handled by splitting', () => {
  it('returns results directly when fetch succeeds', async () => {
    const fetchFn = vi.fn().mockResolvedValue([{ logIndex: 0 }])
    const result = await fetchRange(fetchFn, 100, 110)
    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(result).toHaveLength(1)
  })

  it('splits range and retries when fetch throws', async () => {
    const fetchFn = vi.fn()
      .mockRejectedValueOnce(new Error('range too large'))
      .mockResolvedValue([])

    const result = await fetchRange(fetchFn, 100, 110)
    expect(fetchFn).toHaveBeenCalledTimes(3)
    expect(result).toEqual([])
  })

  it('covers full range with no gaps or overlaps across all successful sub-calls', async () => {
    const fetchFn = vi.fn().mockImplementation(({ fromBlock, toBlock }) => {
      if (toBlock - fromBlock + 1 > 5) {
        throw new Error('range too large')
      }
      return Promise.resolve([])
    })

    await fetchRange(fetchFn, 100, 120)

    const allBlocks = new Set<number>()
    for (const call of fetchFn.mock.calls) {
      const { fromBlock, toBlock } = call[0] as { fromBlock: number; toBlock: number }
      if (toBlock - fromBlock + 1 <= 5) {
        for (let b = fromBlock; b <= toBlock; b++) {
          expect(allBlocks.has(b)).toBe(false)
          allBlocks.add(b)
        }
      }
    }
    for (let b = 100; b <= 120; b++) {
      expect(allBlocks.has(b)).toBe(true)
    }
  })

  it('preserves no-overlap invariant: each block covered exactly once', async () => {
    const fetchFn = vi.fn().mockImplementation(({ fromBlock, toBlock }) => {
      if (toBlock - fromBlock + 1 > 3) {
        throw new Error('too large')
      }
      return Promise.resolve(
        Array.from({ length: toBlock - fromBlock + 1 }, (_, i) => ({
          blockNumber: fromBlock + i,
          logIndex: 0,
        })),
      )
    })

    const result = await fetchRange(fetchFn, 10, 20)
    const blockNums = result.map((r) => Number((r as any).blockNumber))
    const uniqueBlocks = new Set(blockNums)
    expect(uniqueBlocks.size).toBe(blockNums.length)
    expect(blockNums).toContain(10)
    expect(blockNums).toContain(20)
  })

  it('re-throws error when range is 1 and fetch fails', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('persistent error'))
    await expect(fetchRange(fetchFn, 100, 100)).rejects.toThrow('persistent error')
  })

  it('returns empty array when fromBlock > toBlock', async () => {
    const fetchFn = vi.fn()
    const result = await fetchRange(fetchFn, 200, 100)
    expect(fetchFn).not.toHaveBeenCalled()
    expect(result).toEqual([])
  })
})
