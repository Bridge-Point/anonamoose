import 'dotenv/config';
import { ProxyServer } from './proxy/server.js';
import type { ProxyConfig } from './core/types.js';

const config: ProxyConfig = {
  port: parseInt(process.env.PORT || '3000', 10),
  managementPort: parseInt(process.env.MGMT_PORT || '3001', 10),
  openaiKey: process.env.OPENAI_API_KEY,
  anthropicKey: process.env.ANTHROPIC_API_KEY,
  dbPath: process.env.ANONAMOOSE_DB_PATH
};

const server = new ProxyServer(config);

server.start().catch(console.error);
