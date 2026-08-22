import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { writeFileSync, unlinkSync, existsSync } from 'fs'

const mockConfig = vi.hoisted(() => {
  const stateFilePath = './test-state.json'
  return {
    CONFIG: { stateFilePath },
    stateFilePath,
  }
})

const TEST_STATE_FILE = mockConfig.stateFilePath

vi.mock('../src/config', () => mockConfig)

import { loadState, saveState, State } from '../src/state'

beforeEach(() => {
  if (existsSync(TEST_STATE_FILE)) {
    unlinkSync(TEST_STATE_FILE)
  }
})

afterEach(() => {
  if (existsSync(TEST_STATE_FILE)) {
    unlinkSync(TEST_STATE_FILE)
  }
})

describe('AC2: Last-processed block persisted across restarts', () => {
  it('saves state to file', () => {
    const state: State = {
      lastProcessedBlock: 12345,
      alertedLogIds: ['0xtx-0-12345'],
    }
    saveState(state)
    expect(existsSync(TEST_STATE_FILE)).toBe(true)
  })

  it('loads state from file on restart', () => {
    const state: State = {
      lastProcessedBlock: 99999,
      alertedLogIds: ['0xtx-0-99999'],
    }
    saveState(state)
    const loaded = loadState()
    expect(loaded.lastProcessedBlock).toBe(99999)
    expect(loaded.alertedLogIds).toEqual(['0xtx-0-99999'])
  })

  it('returns default state when file does not exist', () => {
    const state = loadState()
    expect(state.lastProcessedBlock).toBe(0)
    expect(state.alertedLogIds).toEqual([])
  })

  it('uses safeBlockNumber - 1 as default on first run', () => {
    const state = loadState(1000)
    expect(state.lastProcessedBlock).toBe(999)
  })

  it('falls back to defaults on corrupt file', () => {
    writeFileSync(TEST_STATE_FILE, '{ invalid json')
    const state = loadState()
    expect(state.lastProcessedBlock).toBe(0)
    expect(state.alertedLogIds).toEqual([])
  })

  it('round-trips large alertedLogIds arrays', () => {
    const ids = Array.from({ length: 100 }, (_, i) => `0xtx${i}-${i}-${1000 + i}`)
    const state: State = { lastProcessedBlock: 1099, alertedLogIds: ids }
    saveState(state)
    const loaded = loadState()
    expect(loaded.lastProcessedBlock).toBe(1099)
    expect(loaded.alertedLogIds).toEqual(ids)
  })
})
