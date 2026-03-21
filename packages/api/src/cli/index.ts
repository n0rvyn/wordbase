import { generateKey, regenerateKey } from './keys.js';

const args = process.argv.slice(2);
const command = args[0];

async function main() {
  switch (command) {
    case 'key:create': {
      const name = args[1];
      if (!name) {
        console.error('Usage: key:create <name> [permissions...]');
        console.error('Example: key:create admin posts:read posts:write comments:manage');
        process.exit(1);
      }
      const permissions = args.slice(2);
      if (permissions.length === 0) {
        permissions.push('posts:read', 'posts:write', 'categories:write', 'tags:write', 'pages:write');
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
