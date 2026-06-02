import '../env.js'; // load repo-root .env first
import { generateKey, regenerateKey } from './keys.js';

const args = process.argv.slice(2);
const command = args[0];

async function main() {
  switch (command) {
    case 'key:create': {
      const name = args[1];
      if (!name) {
        console.error('Usage: key:create <name> [scopes...]');
        console.error('Scopes are enforced per route and per MCP tool, in domain:action form');
        console.error('(e.g. posts:write, media:read, build:trigger). Omit scopes for a full-admin key.');
        console.error('Examples:');
        console.error('  key:create admin                          # full access (*)');
        console.error('  key:create ci posts:write build:trigger   # least-privilege key');
        process.exit(1);
      }
      const permissions = args.slice(2);
      if (permissions.length === 0) {
        // No scopes given → full-admin key. Scopes ARE enforced (requireScope /
        // hasScope), so pass explicit domain:action scopes to mint a limited key.
        permissions.push('*');
      }
      await generateKey(name, permissions);
      break;
    }
    case 'key:regenerate': {
      const name = args[1];
      if (!name) {
        console.error('Usage: key:regenerate <name>');
        process.exit(1);
      }
      await regenerateKey(name);
      break;
    }
    default:
      console.error('Available commands: key:create, key:regenerate');
      process.exit(1);
  }
}

main().catch((error) => {
  console.error('CLI error:', error);
  process.exit(1);
});
