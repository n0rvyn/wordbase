import '../env.js'; // load repo-root .env first
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { initializeDatabase, db } from '../db/index.js';
import { apiKeys } from '../db/schema.js';
import { registerTools } from './tools.js';

// Read the version from package.json so the MCP reports whatever the release
// pipeline last bumped it to — resolves to packages/api/package.json from both
// src/mcp/ (dev, tsx) and dist/mcp/ (built).
const pkgPath = join(dirname(fileURLToPath(import.meta.url)), '../../package.json');
const { version: pkgVersion } = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version: string };

async function validateApiKey(token: string): Promise<boolean> {
  if (token.length < 8) return false;
  const prefix = token.slice(0, 8);
  const [key] = await db.select().from(apiKeys).where(eq(apiKeys.keyPrefix, prefix)).limit(1);
  if (!key) return false;
  return bcrypt.compare(token, key.keyHash);
}

async function main() {
  // Validate API key from environment
  const apiKey = process.env.WORDBASE_API_KEY;
  if (!apiKey) {
    console.error('Error: WORDBASE_API_KEY environment variable is required');
    process.exit(1);
  }

  // Initialize database
  initializeDatabase();

  // Validate key against database
  const valid = await validateApiKey(apiKey);
  if (!valid) {
    console.error('Error: WORDBASE_API_KEY is not a valid API key in the database');
    process.exit(1);
  }

  // Create MCP server
  const server = new McpServer({
    name: 'wordbase-blog',
    version: pkgVersion,
  });

  // Register tools
  registerTools(server);

  // Connect transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('MCP server error:', error);
  process.exit(1);
});
