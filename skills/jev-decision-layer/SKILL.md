---
name: jev-decision-layer
description: >-
  Use when you need a typed judgment fork — who acts next, whether research is
  credible, whether work is done, or whether a proposed action is safe. Call the
  jev_* MCP tools instead of inventing decisions. Tools return judgment only;
  they never execute side effects.
---

# Jev Decision Layer

**Motto**

> Grok Bot works; Jev picks the fork; code/tools execute; humans guard dangerous edges.

## Hard rules

- **Never invent API answers.** Always call the MCP tools (`jev_route_worker`, `jev_check_research`, `jev_review_completion`, `jev_guard_action`). Do not fabricate `decision`, `confidence`, or `probabilities`.
- **Judgment only.** A tool result is a verdict, not an action. Do not treat `allow` / `complete` / `accept` as having executed or finished anything — you still must perform (or refuse) the work yourself based on the judgment.
- Domain shape: `JevVerdict = { decision, confidence, probabilities?, model?, usage? }`.

## When to use each tool

### `jev_route_worker`
Call before the next substantive step when it is unclear who should act. Returns `grok_bot` | `code_or_tool` | `human`. Use after a plan fork, before dangerous edges, or when choosing between conversation, automation, and escalation.

### `jev_check_research`
Call after gathering research or external claims. Returns `accept` | `reverify` | `reject`. Use before treating findings as ground truth or citing them in a decision.

### `jev_review_completion`
Call when deciding whether a task or milestone is done. Returns `complete` | `reverify` | `incomplete`. Use against stated done criteria; if `reverify`, run a verification pass before closing.

### `jev_guard_action`
Call before any proposed side effect (send, delete, purchase, credential use, irreversible change). Returns `allow` | `confirm` | `human` | `reject`. The tool does **not** perform the action — honor the gate yourself.

## Inputs (brief)

- Route / research / completion: `state` (string or object), optional `goal`.
- Guard: required `action` description; optional `goal`, `context`.
