#!/usr/bin/env node
/** Jev Decision Layer — judgment-only stdio MCP (Content-Length framing). */
const PROTOCOL_VERSION = "2024-11-05";
const SERVER_INFO = { name: "jev-decision-layer", version: "0.1.0" };
const log = (...a) => console.error("[jev]", ...a);

function endpoint(key) {
  const override = (process.env.JEV_BASE_URL || process.env.TYPESAFE_BASE_URL || "").replace(/\/$/, "");
  if (override) {
    // Full decide/systemone URL
    if (/\/(decide|systemone)$/.test(override)) return override;
    // …/api/v1 or …/v1 → append /systemone
    if (/\/v1$/.test(override)) return `${override}/systemone`;
    // OpenRouter-style SDK base https://openrouter.ai/api → /api/v1/systemone
    if (/\/api$/.test(override)) return `${override}/v1/systemone`;
    return `${override}/systemone`;
  }
  return key.startsWith("jv_live_")
    ? "https://jevtypesafeai.com/api/v1/decide"
    : "https://api.typesafe.ai/v1/systemone";
}

function getKey() {
  // Prefer OpenRouter key when routing through OpenRouter base
  const base = process.env.JEV_BASE_URL || process.env.TYPESAFE_BASE_URL || "";
  if (/openrouter\.ai/i.test(base)) {
    return (
      process.env.OPENROUTER_API_KEY ||
      process.env.JEV_API_KEY ||
      process.env.TYPESAFE_API_KEY ||
      process.env.JEV_KEY ||
      ""
    );
  }
  return process.env.JEV_API_KEY || process.env.TYPESAFE_API_KEY || process.env.JEV_KEY || "";
}

/** Pass object through; JSON-parseable string → object; else wrap as { text }. */
function normalizeState(state, extra = {}) {
  let base;
  if (state == null) base = {};
  else if (typeof state === "object") base = state;
  else if (typeof state === "string") {
    try {
      const p = JSON.parse(state);
      base = typeof p === "object" && p !== null ? p : { text: state };
    } catch {
      base = { text: state };
    }
  } else base = { value: state };
  return { ...base, ...extra };
}

/**
 * POST decide; map choice → JevVerdict { decision, confidence, probabilities?, model?, usage? }.
 * On HTTP/network errors return { ok:false, error } — never throw uncaught from tools.
 */
async function decide(state, qid, instructions, criteria) {
  const key = getKey();
  if (!key) {
    return { ok: false, error: "Missing API key. Set JEV_API_KEY (or TYPESAFE_API_KEY / JEV_KEY)." };
  }
  const body = {
    model: process.env.JEV_MODEL || "jev-latest",
    state,
    questions: { [qid]: { type: "choice", instructions, criteria } },
  };
  let res, text;
  try {
    res = await fetch(endpoint(key), {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    text = await res.text();
  } catch (e) {
    return { ok: false, error: `Network error: ${e?.message || e}` };
  }
  if (!res.ok) return { ok: false, error: `Jev API HTTP ${res.status}: ${text.slice(0, 500)}` };
  let data;
  try { data = JSON.parse(text); } catch {
    return { ok: false, error: `Non-JSON response: ${text.slice(0, 300)}` };
  }
  const answers = data.answers || data.questions || data;
  const ans = answers?.[qid] || data?.[qid] || (typeof answers === "object" ? Object.values(answers)[0] : null);
  const choice = ans?.choice ?? ans?.decision ?? ans?.answer ?? (typeof ans === "string" ? ans : null);
  if (choice == null) {
    return { ok: false, error: `No choice for "${qid}": ${text.slice(0, 400)}` };
  }
  const verdict = { decision: choice, confidence: ans?.confidence ?? data?.confidence };
  if (ans?.probabilities != null) verdict.probabilities = ans.probabilities;
  else if (data?.probabilities != null) verdict.probabilities = data.probabilities;
  if (ans?.model != null || data?.model != null) verdict.model = ans?.model ?? data.model;
  if (data?.usage != null) verdict.usage = data.usage;
  return { ok: true, verdict };
}

const CRITERIA = {
  route_worker: {
    grok_bot: "Grok Bot / conversational agent should do the next substantive work",
    code_or_tool: "Code, shell, MCP tools, or automated executors should run the next step",
    human: "A human must take the next step (danger edge, credentials, irreversible choice)",
  },
  check_research: {
    accept: "research findings are sufficient and credible",
    reverify: "need another pass or more sources",
    reject: "findings are wrong, insufficient, or unsafe to trust",
  },
  review_completion: {
    complete: "work meets the stated done criteria",
    reverify: "looks done but needs a verification pass",
    incomplete: "not done yet",
  },
  guard_action: {
    allow: "safe to proceed without extra confirmation",
    confirm: "proceed only after explicit user confirmation",
    human: "stop and hand to a human (dangerous edge)",
    reject: "do not perform the action",
  },
};

const INSTR = {
  route_worker:
    "Who should do the next step? Motto: Grok Bot works; Jev picks the fork; code/tools execute; humans guard dangerous edges.",
  check_research: "Should we accept this research, re-verify, or reject it?",
  review_completion: "Is this work complete, needs re-verification, or incomplete?",
  guard_action: "Gate this proposed action. Tools return judgment only — never execute the action.",
};

const stateProp = { description: "Situation / findings (string or object)." };
const goalProp = { type: "string", description: "Optional goal." };

const TOOLS = [
  {
    name: "jev_route_worker",
    description: "Who next: grok_bot | code_or_tool | human. Judgment only.",
    inputSchema: { type: "object", properties: { state: stateProp, goal: goalProp }, required: ["state"] },
    run: (a) => decide(normalizeState(a.state, a.goal ? { goal: a.goal } : {}), "route_worker", INSTR.route_worker, CRITERIA.route_worker),
  },
  {
    name: "jev_check_research",
    description: "accept | reverify | reject research. Judgment only.",
    inputSchema: { type: "object", properties: { state: stateProp, goal: goalProp }, required: ["state"] },
    run: (a) => decide(normalizeState(a.state, a.goal ? { goal: a.goal } : {}), "check_research", INSTR.check_research, CRITERIA.check_research),
  },
  {
    name: "jev_review_completion",
    description: "complete | reverify | incomplete. Judgment only.",
    inputSchema: { type: "object", properties: { state: stateProp, goal: goalProp }, required: ["state"] },
    run: (a) => decide(normalizeState(a.state, a.goal ? { goal: a.goal } : {}), "review_completion", INSTR.review_completion, CRITERIA.review_completion),
  },
  {
    name: "jev_guard_action",
    description: "allow | confirm | human | reject a proposed action. Judgment only — never executes.",
    inputSchema: {
      type: "object",
      properties: {
        goal: goalProp,
        action: { type: "string", description: "Required description of the proposed action." },
        context: { description: "Optional extra context (string or object)." },
      },
      required: ["action"],
    },
    run: (a) => {
      const state = { action: a.action };
      if (a.goal) state.goal = a.goal;
      if (a.context != null) state.context = a.context;
      return decide(state, "guard_action", INSTR.guard_action, CRITERIA.guard_action);
    },
  },
];
const TOOL_MAP = Object.fromEntries(TOOLS.map((t) => [t.name, t]));

function send(msg) {
  const json = JSON.stringify(msg);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(json, "utf8")}\r\n\r\n${json}`);
}

function asToolResult(r) {
  if (!r.ok) return { content: [{ type: "text", text: r.error }], isError: true };
  return { content: [{ type: "text", text: JSON.stringify(r.verdict, null, 2) }] };
}

async function handle(msg) {
  const { id, method, params } = msg;
  if (method === "initialize") {
    return { jsonrpc: "2.0", id, result: { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: SERVER_INFO } };
  }
  if (method === "ping") return { jsonrpc: "2.0", id, result: {} };
  if (method === "tools/list") {
    return {
      jsonrpc: "2.0",
      id,
      result: { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) },
    };
  }
  if (method === "tools/call") {
    const tool = TOOL_MAP[params?.name];
    if (!tool) {
      return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: `Unknown tool: ${params?.name}` }], isError: true } };
    }
    try {
      return { jsonrpc: "2.0", id, result: asToolResult(await tool.run(params?.arguments ?? {})) };
    } catch (e) {
      return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: `Tool error: ${e?.message || e}` }], isError: true } };
    }
  }
  if (id !== undefined) return { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } };
  return null;
}

let buf = Buffer.alloc(0);
process.stdin.on("data", (chunk) => {
  buf = Buffer.concat([buf, chunk]);
  for (;;) {
    const i = buf.indexOf("\r\n\r\n");
    if (i === -1) break;
    const m = /Content-Length:\s*(\d+)/i.exec(buf.slice(0, i).toString("utf8"));
    if (!m) { buf = Buffer.alloc(0); break; }
    const len = +m[1], start = i + 4;
    if (buf.length < start + len) break;
    const raw = buf.slice(start, start + len).toString("utf8");
    buf = buf.slice(start + len);
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { log("parse error", e?.message); continue; }
    if (msg.method && msg.id === undefined) {
      if (msg.method === "notifications/initialized") log("initialized");
      continue;
    }
    if (msg.method) {
      handle(msg).then((r) => r && send(r)).catch((e) => {
        log("handler", e);
        if (msg.id !== undefined) send({ jsonrpc: "2.0", id: msg.id, error: { code: -32603, message: String(e?.message || e) } });
      });
    }
  }
});
process.stdin.on("end", () => process.exit(0));
process.stdin.resume();
log("stdio MCP ready");
