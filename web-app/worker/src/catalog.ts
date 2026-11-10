// Mirrors cli-app/src/agents.mjs. For CLI-login runs the user's computer reports which agents are installed;
// this list is the fallback and what API-key mode uses.
export const AGENTS = [
  { id: "claude", name: "Claude Code", kind: "claude-sdk", apiKeyEnv: "ANTHROPIC_API_KEY", loginHint: "Run `claude` once in a terminal and log in." },
  { id: "codex", name: "Codex CLI", kind: "acp", apiKeyEnv: "OPENAI_API_KEY", loginHint: "Run `codex login` in a terminal." },
  { id: "gemini", name: "Gemini CLI", kind: "acp", apiKeyEnv: "GEMINI_API_KEY", loginHint: "Run `gemini` once in a terminal and sign in." },
  { id: "copilot", name: "GitHub Copilot CLI", kind: "acp", apiKeyEnv: null, loginHint: "Run `copilot` in a terminal and use /login." },
  { id: "opencode", name: "OpenCode", kind: "acp", apiKeyEnv: null, loginHint: "Run `opencode auth login`." },
  { id: "cursor", name: "Cursor Agent", kind: "acp", apiKeyEnv: "CURSOR_API_KEY", loginHint: "Run `cursor-agent login`." },
  { id: "qwen", name: "Qwen Code", kind: "acp", apiKeyEnv: "OPENAI_API_KEY", loginHint: "Run `qwen` once and sign in." },
  { id: "goose", name: "Goose", kind: "acp", apiKeyEnv: null, loginHint: "Run `goose configure`." },
  { id: "custom", name: "Custom ACP agent", kind: "acp", apiKeyEnv: null, loginHint: "Any agent from agentclientprotocol.com/overview/agents. Enter its ACP launch command." },
].map((a) => ({ ...a, command: null, installed: false }))

export const PROVIDERS = [
  { id: "anthropic", name: "Anthropic", models: "Claude", envVar: "ANTHROPIC_API_KEY", keyPrefix: "sk-ant-", keyUrl: "https://console.anthropic.com/settings/keys", agentId: "claude", engine: "Claude Code in a cloud sandbox" },
  { id: "openai", name: "OpenAI", models: "GPT / Codex", envVar: "OPENAI_API_KEY", keyPrefix: "sk-", keyUrl: "https://platform.openai.com/api-keys", agentId: "codex", engine: "Codex in a cloud sandbox" },
  { id: "google", name: "Google", models: "Gemini", envVar: "GEMINI_API_KEY", keyPrefix: "", keyUrl: "https://aistudio.google.com/apikey", agentId: "gemini", engine: "Gemini CLI in a cloud sandbox" },
]

export const CLAUDE_EFFORTS = ["low", "medium", "high", "xhigh", "max"]

export const CLAUDE_MODELS = [
  { value: "opus", name: "Opus (latest)", description: "Best questions and specs" },
  { value: "sonnet", name: "Sonnet (latest)", description: "Faster and cheaper" },
  { value: "haiku", name: "Haiku (latest)", description: "Fastest" },
]

type Model = { value: string; name: string; description?: string; efforts?: string[] | null }

/** Real model list for an API key, straight from the provider. The key is used for this call only. */
export async function providerModels(providerId: string, apiKey: string): Promise<{ models: Model[]; error?: string }> {
  try {
    if (providerId === "anthropic") {
      const r = await fetch("https://api.anthropic.com/v1/models?limit=50", { headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" } })
      if (!r.ok) return { models: [], error: r.status === 401 ? "That Anthropic key was rejected." : `Anthropic answered ${r.status}.` }
      const d = (await r.json()) as { data: { id: string; display_name?: string }[] }
      return { models: d.data.map((m) => ({ value: m.id, name: m.display_name ?? m.id, efforts: /opus|sonnet|fable/.test(m.id) ? CLAUDE_EFFORTS : null })) }
    }
    if (providerId === "openai") {
      const r = await fetch("https://api.openai.com/v1/models", { headers: { authorization: `Bearer ${apiKey}` } })
      if (!r.ok) return { models: [], error: r.status === 401 ? "That OpenAI key was rejected." : `OpenAI answered ${r.status}.` }
      const d = (await r.json()) as { data: { id: string }[] }
      const ids = d.data.map((m) => m.id).filter((id) => /^(gpt-5|o\d|codex)/.test(id) && !/audio|realtime|transcribe|tts|image|search/.test(id)).sort().reverse()
      return { models: ids.map((id) => ({ value: id, name: id })) }
    }
    if (providerId === "google") {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=100`, { headers: { "x-goog-api-key": apiKey } })
      if (!r.ok) return { models: [], error: r.status === 400 || r.status === 403 ? "That Google key was rejected." : `Google answered ${r.status}.` }
      const d = (await r.json()) as { models: { name: string; displayName?: string; supportedGenerationMethods?: string[] }[] }
      return {
        models: d.models
          .filter((m) => m.name.includes("gemini") && m.supportedGenerationMethods?.includes("generateContent"))
          .map((m) => ({ value: m.name.replace(/^models\//, ""), name: m.displayName ?? m.name })),
      }
    }
  } catch (e: any) {
    return { models: [], error: e.message }
  }
  return { models: [], error: "Unknown provider." }
}
