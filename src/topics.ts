// Compute topic0 (keccak256 of canonical event signature) for server-side log filtering.

import { ethers } from 'ethers'
import { CONFIG } from './config'

export const eventSignature = CONFIG.eventSignature

export const topic0 = ethers.keccak256(ethers.toUtf8Bytes(eventSignature))

export const filter = {
  address: CONFIG.contractAddress,
  topics: [topic0],
}
