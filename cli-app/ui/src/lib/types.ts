// Shapes shared with the Node server (src/server.mjs, src/session.mjs).

export type AgentInfo = {
  id: string
  name: string
  kind: "claude-sdk" | "acp"
  apiKeyEnv: string | null
  loginHint: string
  command: string | null
  installed: boolean
}

export type Provider = {
  id: string
  name: string
  models: string
  envVar: string
  keyPrefix: string
  keyUrl: string
  agentId: string
  engine: string
}

export type Config = {
  skillDir: string
  defaultProject: string
  agents: AgentInfo[]
  providers: Provider[]
  claudeModels: { value: string; name: string; description: string }[]
}

export type ModelOption = { value: string; name: string; description?: string; efforts?: string[] | null }

export type Limit = { label: string; percent: number; resetsAt: string | null }

export type ProbeInfo = {
  source?: string
  models: ModelOption[]
  currentModel?: string | null
  efforts?: string[] | null
  account?: { plan: string | null; organization: string | null; provider: string | null } | null
  agent?: { name?: string; title?: string; version?: string } | null
  limits: Limit[]
  error?: string
}

export type SessionSummary = {
  id: string
  agent: string
  agentName: string
  authMode: "cli" | "apiKey"
  projectDir: string
  idea: string
  model: string
  budgetUsd: number | null
  state: string
  createdAt: string
}

export type Question = {
  question: string
  header?: string
  multiSelect?: boolean
  options: { label: string; description?: string; preview?: string }[]
}

export type Output = {
  name: string
  requirements: { mtime: number } | null
  mockupEntry: string | null
  screens: string[]
}

/** Everything needed to start a run, chosen on the setup page. Held in memory only (may hold an API key). */
export type Pending = {
  authMode: "cli" | "apiKey"
  agentId?: string
  providerId?: string
  apiKey?: string
  projectDir: string
  customCommand?: string
}

// Raw events from the server's WebSocket.
export type ServerEvent = { seq?: number; at?: number; type: string; [k: string]: any }
