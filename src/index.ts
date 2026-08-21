// Entry point: start watcher with graceful shutdown on SIGINT/SIGTERM.

import { startWatcher } from './watcher'

process.on('SIGINT', () => {
  console.log('\nShutting down gracefully...')
  process.exit(0)
})

process.on('SIGTERM', () => {
  console.log('\nShutting down gracefully...')
  process.exit(0)
})

startWatcher().catch((err: Error) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
