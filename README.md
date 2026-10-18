# jev-decision-layer

Minimal Cursor / Agent plugin that wraps the TypeSafe / Jev Decision API as **judgment-only** MCP tools. Tools return a `JevVerdict`; they never execute side effects.

**Motto:** Grok Bot works; Jev picks the fork; code/tools execute; humans guard dangerous edges.

## Install (Cursor)

1. Add this folder as a Cursor plugin (or symlink under your plugins root).
2. Set plugin variable `JEV_API_KEY` (required). Optional `JEV_MODEL` (default `jev-latest`).
3. Reload MCP — server starts via `mcp.json` → `node ${CURSOR_PLUGIN_ROOT}/server.mjs`.

Dual-format: `.cursor-plugin/plugin.json` carries `variables` for Cursor; root `plugin.json` is the Agent Plugins manifest (no variables).

## Env

| Variable | Required | Notes |
|----------|----------|--------|
| `JEV_API_KEY` | yes* | Bearer key. Also accepts `TYPESAFE_API_KEY` or `JEV_KEY`. |
| `JEV_BASE_URL` | optional API URL override (gateway / geo workaround) |
| `JEV_MODEL` | no | Default `jev-latest`. |

\*Keys starting with `jv_live_` call `https://jevtypesafeai.com/api/v1/decide`; otherwise `https://api.typesafe.ai/v1/systemone`.

## Local run

```bash
JEV_API_KEY=your_key node server.mjs
```

Stdout is MCP only (Content-Length framing). Logs go to stderr.

## Tools

| Tool | Criteria (decision values) |
|------|----------------------------|
| `jev_route_worker` | `grok_bot` \| `code_or_tool` \| `human` |
| `jev_check_research` | `accept` \| `reverify` \| `reject` |
| `jev_review_completion` | `complete` \| `reverify` \| `incomplete` |
| `jev_guard_action` | `allow` \| `confirm` \| `human` \| `reject` |

Return shape: `{ decision, confidence, probabilities?, model?, usage? }`.

## Skill

See `skills/jev-decision-layer/SKILL.md` for when to call each tool. Do not invent sample verdicts.


## OpenRouter (geo workaround)

```bash
export JEV_BASE_URL=https://openrouter.ai/api
export OPENROUTER_API_KEY=sk-or-...
export JEV_MODEL=jev-latest   # mapped to typesafe/jev-latest
node server.mjs
```

Or set `JEV_BASE_URL=https://openrouter.ai/api/v1/systemone`. Calls bill to OpenRouter, not TypeSafe console.
