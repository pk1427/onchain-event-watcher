import { ethers } from 'ethers'
import { CONFIG } from './config'

export interface FetchFn {
  (params: { fromBlock: number; toBlock: number }): Promise<ethers.Log[]>
}

export async function fetchRange(
  fetchFn: FetchFn,
  fromBlock: number,
  toBlock: number,
  maxRange: number = CONFIG.maxBlockRange,
): Promise<ethers.Log[]> {
  if (fromBlock > toBlock) return []

  try {
    return await fetchFn({ fromBlock, toBlock })
  } catch (err) {
    const range = toBlock - fromBlock + 1
    if (range <= 1 || maxRange <= 1) throw err

    const mid = Math.floor((fromBlock + toBlock) / 2)
    const left = await fetchRange(fetchFn, fromBlock, mid, maxRange)
    const right = await fetchRange(fetchFn, mid + 1, toBlock, maxRange)
    return [...left, ...right]
  }
}
