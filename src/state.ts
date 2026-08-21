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

export function loadState(): State {
  try {
    if (existsSync(CONFIG.stateFilePath)) {
      const raw = readFileSync(CONFIG.stateFilePath, 'utf-8')
      return JSON.parse(raw)
    }
  } catch {
    // ignore corrupt file and return defaults
  }
  return { ...defaultState }
}

export function saveState(state: State): void {
  writeFileSync(CONFIG.stateFilePath, JSON.stringify(state, null, 2))
}
