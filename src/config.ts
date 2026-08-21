import dotenv from 'dotenv'

dotenv.config()

export const CONFIG = {
  contractAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  eventSignature: 'Transfer(address,address,uint256)',
  pollIntervalMs: 30_000,
  maxBlockRange: 10,
  rpcUrl: process.env.RPC_URL || '',
  stateFilePath: './state.json',
}
