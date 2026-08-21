// Persistent state management: load/save lastProcessedBlock and alertedLogIds to JSON.

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { CONFIG } from './config'

export interface State {
  lastProcessedBlock: number
  alertedLogIds: string[]
}

const defaultState: State = {
  lastProcessedBlock: 0,
  alertedLogIds: [],
}

export function loadState(safeBlockNumber?: number): State {
  try {
    if (existsSync(CONFIG.stateFilePath)) {
      const raw = readFileSync(CONFIG.stateFilePath, 'utf-8')
      return JSON.parse(raw)
    }
  } catch {
    // ignore corrupt file and return defaults
  }
  const lastProcessedBlock = safeBlockNumber !== undefined ? safeBlockNumber - 1 : 0
  return { ...defaultState, lastProcessedBlock }
}

export function saveState(state: State): void {
  writeFileSync(CONFIG.stateFilePath, JSON.stringify(state, null, 2))
}
