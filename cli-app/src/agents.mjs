// Registry of agent CLIs the app can drive. One line per agent; commands change often.
import { spawnSync } from "node:child_process";

export const isWin = process.platform === "win32";

/**
 * kind: "claude-sdk" uses the Claude Agent SDK; "acp" speaks Agent Client Protocol over stdio.
 * detect: binary that must be on PATH for the agent to count as installed.
 * apiKeyEnv: env var set in API-key mode.
 */
export const AGENTS = [
  { id: "claude", name: "Claude Code", kind: "claude-sdk", detect: "claude", apiKeyEnv: "ANTHROPIC_API_KEY",
    loginHint: "Run `claude` once in a terminal and log in." },
  { id: "codex", name: "Codex CLI", kind: "acp", detect: "codex", command: "npx", args: ["-y", "@zed-industries/codex-acp"],
    apiKeyEnv: "OPENAI_API_KEY", loginHint: "Run `codex login` in a terminal." },
  { id: "gemini", name: "Gemini CLI", kind: "acp", detect: "gemini", command: "gemini", args: ["--acp"],
    apiKeyEnv: "GEMINI_API_KEY", loginHint: "Run `gemini` once in a terminal and sign in." },
  { id: "copilot", name: "GitHub Copilot CLI", kind: "acp", detect: "copilot", command: "copilot", args: ["--acp", "--stdio"],
    apiKeyEnv: null, loginHint: "Run `copilot` in a terminal and use /login." },
  { id: "opencode", name: "OpenCode", kind: "acp", detect: "opencode", command: "opencode", args: ["acp"],
    apiKeyEnv: null, loginHint: "Run `opencode auth login`." },
  { id: "cursor", name: "Cursor Agent", kind: "acp", detect: "cursor-agent", command: "cursor-agent", args: ["acp"],
    apiKeyEnv: "CURSOR_API_KEY", loginHint: "Run `cursor-agent login`." },
  { id: "qwen", name: "Qwen Code", kind: "acp", detect: "qwen", command: "qwen", args: ["--acp"],
    apiKeyEnv: "OPENAI_API_KEY", loginHint: "Run `qwen` once and sign in." },
  { id: "goose", name: "Goose", kind: "acp", detect: "goose", command: "goose", args: ["acp"],
    apiKeyEnv: null, loginHint: "Run `goose configure`." },
  { id: "claude-acp", name: "Claude Code (via ACP adapter)", kind: "acp", detect: "claude",
    command: "npx", args: ["-y", "@zed-industries/claude-agent-acp"], apiKeyEnv: "ANTHROPIC_API_KEY",
    loginHint: "Run `claude` once in a terminal and log in." },
  { id: "custom", name: "Custom ACP agent", kind: "acp", detect: null, command: null, args: [], apiKeyEnv: null,
    loginHint: "Any agent from agentclientprotocol.com/overview/agents. Enter its ACP launch command." },
];

/**
 * API-key mode is chosen by provider, not by agent. Each provider runs on an engine that needs no login:
 * the bundled Claude Agent SDK, or an ACP agent fetched with npx when it is not installed.
 */
export const PROVIDERS = [
  { id: "anthropic", name: "Anthropic", models: "Claude", envVar: "ANTHROPIC_API_KEY", keyPrefix: "sk-ant-",
    keyUrl: "https://console.anthropic.com/settings/keys", agentId: "claude", engine: "Claude Agent SDK (bundled)" },
  { id: "openai", name: "OpenAI", models: "GPT / Codex", envVar: "OPENAI_API_KEY", keyPrefix: "sk-",
    keyUrl: "https://platform.openai.com/api-keys", agentId: "codex", engine: "Codex via codex-acp (npx, first run downloads it)" },
  { id: "google", name: "Google", models: "Gemini", envVar: "GEMINI_API_KEY", keyPrefix: "",
    keyUrl: "https://aistudio.google.com/apikey", agentId: "gemini", engine: "Gemini CLI (npx if not installed)",
    fallback: { command: "npx", args: ["-y", "@google/gemini-cli", "--acp"] } },
];

/** Fallback only, when the live probe (agent-info.mjs) fails. The real list comes from the SDK. */
export const CLAUDE_MODELS = [
  { value: "claude-opus-5-5", name: "Opus 5.5", description: "Best questions and specs (recommended)" },
  { value: "claude-sonnet-5-5", name: "Sonnet 5.5", description: "Faster and cheaper, still strong" },
  { value: "claude-fable-5-1", name: "Fable 5.1", description: "Most capable, slowest and priciest" },
  { value: "claude-haiku-5-5", name: "Haiku 5.5", description: "Fastest; weak at deep questions" },
  { value: "", name: "My Claude Code default", description: "Whatever your settings.json says" },
];

export function getProvider(id) {
  return PROVIDERS.find((p) => p.id === id) ?? null;
}

const cache = new Map();

export function which(bin) {
  if (!bin) return null;
  if (cache.has(bin)) return cache.get(bin);
  const r = spawnSync(isWin ? "where" : "which", [bin], { encoding: "utf8" });
  const path = r.status === 0 ? r.stdout.split(/\r?\n/).find(Boolean)?.trim() ?? null : null;
  cache.set(bin, path);
  return path;
}

export function listAgents() {
  return AGENTS.map((a) => ({
    id: a.id, name: a.name, kind: a.kind, apiKeyEnv: a.apiKeyEnv, loginHint: a.loginHint,
    command: a.command ? [a.command, ...a.args].join(" ") : null,
    installed: a.id === "custom" ? true : Boolean(which(a.detect)),
  }));
}

export function getAgent(id) {
  return AGENTS.find((a) => a.id === id) ?? null;
}

/** Split "cmd arg1 'arg two'" into [cmd, ...args]. */
export function splitCommand(line) {
  const parts = line.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
  return parts.map((p) => p.replace(/^["']|["']$/g, ""));
}
