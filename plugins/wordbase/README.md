# WordBase plugin

Connects Claude Code to the [WordBase](https://norvyn.com) platform over a remote MCP server, plus publishing workflow skills.

The MCP server runs inside the WordBase API process on the host and is reached at `https://norvyn.com/api/mcp` (Streamable HTTP). It exposes 38 tools across blog, podcast, apps, and pages — see the `wordbase-tools` skill for the full catalog.

## Requirements

- A WordBase API key with the scopes you need (`*` for full access). Tools are scope-gated; an under-scoped key gets a permission-denied result per call.
- The key available to Claude Code as the `WORDBASE_API_KEY` environment variable.

## Install

```
/plugin marketplace add n0rvyn/wordbase
/plugin install wordbase@n0rvyn-wordbase
```

The plugin ships `defaultEnabled: false` (it connects to an external service), so enable it after install:

```
/plugin enable wordbase@n0rvyn-wordbase
```

## Provide the API key

The plugin's MCP config authenticates with `Authorization: Bearer ${WORDBASE_API_KEY}`. Claude Code substitutes `${WORDBASE_API_KEY}` from its environment at connection time, so export it where you launch Claude Code:

```sh
# ~/.zshrc / ~/.bashrc
export WORDBASE_API_KEY=wb_xxxxxxxx...
```

Verify the connection:

```
/mcp           # the `wordbase` server should show connected
```

### Fallback: configure the server directly

If you prefer not to rely on environment substitution, add the server yourself with the key inline (stored in your local Claude config, not committed):

```
claude mcp add --transport http wordbase https://norvyn.com/api/mcp --header "Authorization: Bearer wb_xxxxxxxx..."
```

## Skills

- `wb-status` — build status + content stats
- `wb-rebuild` — trigger a site rebuild and report the result
- `wb-publish` — publish a draft post, then rebuild
- `wb-apps-sync` — sync app entries from App Store Connect
- `wordbase-tools` — reference catalog of all 38 MCP tools

## Notes

- The MCP server is single-host: it talks directly to the WordBase SQLite database on the server, so it only works against the deployed `https://norvyn.com` instance (or a local instance you point the URL at).
- Content changes do not appear on the live site until a rebuild runs (`wb-rebuild`).
