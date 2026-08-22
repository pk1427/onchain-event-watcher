import { describe, it, expect } from 'vitest'
import { ethers } from 'ethers'
import { topic0, eventSignature, filter } from '../src/topics'
import { CONFIG } from '../src/config'

describe('AC1: Topic filter built from event signature hash', () => {
  it('computes topic0 as keccak256 of the canonical event signature', () => {
    const expected = ethers.keccak256(ethers.toUtf8Bytes('Transfer(address,address,uint256)'))
    expect(topic0).toBe(expected)
  })

  it('uses the configured event signature string', () => {
    expect(eventSignature).toBe(CONFIG.eventSignature)
  })

  it('filter includes topic0 as the server-side topic filter', () => {
    expect(filter.topics).toEqual([topic0])
    expect(filter.address).toBe(CONFIG.contractAddress)
  })

  it('topic0 is a valid 32-byte keccak hash', () => {
    expect(topic0).toMatch(/^0x[0-9a-fA-F]{64}$/)
  })
})
