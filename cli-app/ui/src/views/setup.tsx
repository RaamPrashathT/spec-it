import * as React from "react"
import { ArrowRightIcon, FolderOpenIcon, KeyRoundIcon, TerminalIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet, FieldTitle,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Badge } from "@/components/ui/badge"
import { Spinner } from "@/components/ui/spinner"
import { api, loadForm, saveForm } from "@/lib/api"
import type { Config, Pending, SessionSummary } from "@/lib/types"

function Choice({ value, title, description, badge, disabled }: { value: string; title: string; description: string; badge?: React.ReactNode; disabled?: boolean }) {
  return (
    <FieldLabel htmlFor={`opt-${value}`} className={disabled ? "opacity-55" : undefined}>
      <Field orientation="horizontal">
        <FieldContent>
          <FieldTitle>{title} {badge}</FieldTitle>
          <FieldDescription>{description}</FieldDescription>
        </FieldContent>
        <RadioGroupItem value={value} id={`opt-${value}`} />
      </Field>
    </FieldLabel>
  )
}

/** Step 1–3: how to connect, which agent (or provider + key), and the project folder. The idea is typed in the chat. */
export function Setup({ config, onContinue }: { config: Config; onContinue: (p: Pending) => void }) {
  const saved = React.useMemo(loadForm, [])
  const agents = React.useMemo(() => config.agents
    .filter((a) => a.id !== "claude-acp" || a.installed)
    .sort((a, b) => Number(b.installed) - Number(a.installed) || Number(a.id === "custom") - Number(b.id === "custom")), [config])

  const [authMode, setAuthMode] = React.useState<"cli" | "apiKey">(saved.authMode === "apiKey" ? "apiKey" : "cli")
  const [agentId, setAgentId] = React.useState<string>(saved.agentId ?? agents.find((a) => a.installed && a.id !== "custom")?.id ?? "claude")
  const [providerId, setProviderId] = React.useState<string>(saved.providerId ?? config.providers[0].id)
  const [apiKey, setApiKey] = React.useState("")
  const [customCommand, setCustomCommand] = React.useState<string>(saved.customCommand ?? "")
  const [projectDir, setProjectDir] = React.useState<string>(saved.projectDir ?? config.defaultProject)
  const [error, setError] = React.useState("")
  const [browsing, setBrowsing] = React.useState(false)
  const [runs, setRuns] = React.useState<SessionSummary[]>([])

  React.useEffect(() => { api<SessionSummary[]>("/api/sessions").then(setRuns).catch(() => {}) }, [])

  const agent = config.agents.find((a) => a.id === agentId)
  const provider = config.providers.find((p) => p.id === providerId)

  async function browse() {
    setBrowsing(true)
    setError("")
    try {
      const r = await api<{ path?: string }>("/api/pick-folder", { start: projectDir })
      if (r.path) setProjectDir(r.path)
    } catch (err: any) { setError(err.message) }
    finally { setBrowsing(false) }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!projectDir.trim()) return setError("Choose a project folder.")
    if (authMode === "apiKey" && !apiKey.trim()) return setError("Paste an API key, or use your CLI login.")
    if (authMode === "cli" && !agent?.installed) return setError("That agent isn't installed. Pick an installed one.")
    if (agentId === "custom" && authMode === "cli" && !customCommand.trim()) return setError("Enter the agent's ACP launch command.")
    saveForm({ authMode, agentId, providerId, projectDir: projectDir.trim(), customCommand })
    // Ask once, from this click, so the app can ping you when the agent needs an answer.
    try { if ("Notification" in window && Notification.permission === "default") Notification.requestPermission() } catch { /* ignore */ }
    onContinue({
      authMode,
      agentId: authMode === "cli" ? agentId : undefined,
      providerId: authMode === "apiKey" ? providerId : undefined,
      apiKey: authMode === "apiKey" ? apiKey.trim() : undefined,
      projectDir: projectDir.trim(),
      customCommand: customCommand.trim(),
    })
  }

  return (
    <main className="min-h-0 flex-1 overflow-y-auto">
      <form onSubmit={submit} className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-10">
        <div className="grid gap-1.5">
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-balance">Turn an idea into a spec</h1>
          <p className="text-sm text-muted-foreground">
            Runs the spec-it skill with a coding agent you already have. It asks questions in the chat and writes
            <code className="mx-1 rounded bg-muted px-1 font-mono text-xs">REQUIREMENTS.md</code>and mockups into your project.
          </p>
        </div>

        <FieldSet>
          <FieldLegend>1. How do you want to connect?</FieldLegend>
          <RadioGroup value={authMode} onValueChange={(v) => setAuthMode(v as "cli" | "apiKey")} className="grid gap-3 sm:grid-cols-2">
            <Choice value="cli" title="Use my CLI login" description="No API key. Runs an agent you're already signed into, like Claude Code or Codex." badge={<TerminalIcon className="size-3.5 text-muted-foreground" />} />
            <Choice value="apiKey" title="API key" description="Pay per use with a key from Anthropic, OpenAI or Google." badge={<KeyRoundIcon className="size-3.5 text-muted-foreground" />} />
          </RadioGroup>
        </FieldSet>

        {authMode === "cli" ? (
          <FieldSet>
            <FieldLegend>2. Which agent?</FieldLegend>
            <RadioGroup value={agentId} onValueChange={(v) => setAgentId(String(v))} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {agents.map((a) => (
                <Choice
                  key={a.id} value={a.id} title={a.name} disabled={!a.installed}
                  description={a.id === "custom" ? "Any ACP agent" : a.installed ? "Installed" : "Not installed"}
                />
              ))}
            </RadioGroup>
            <FieldDescription>
              {agent?.installed ? `Uses your existing ${agent.name} sign-in. ${agent.loginHint}` : `${agent?.name ?? "This agent"} isn't on your PATH. Install it first, or pick another.`}
            </FieldDescription>
            {agentId === "custom" && (
              <Field>
                <FieldLabel htmlFor="custom-cmd">ACP launch command</FieldLabel>
                <Input id="custom-cmd" value={customCommand} onChange={(e) => setCustomCommand(e.target.value)} placeholder="e.g. kiro-cli acp" autoComplete="off" />
              </Field>
            )}
          </FieldSet>
        ) : (
          <FieldSet>
            <FieldLegend>2. Which provider?</FieldLegend>
            <RadioGroup value={providerId} onValueChange={(v) => setProviderId(String(v))} className="grid gap-2 sm:grid-cols-3">
              {config.providers.map((p) => <Choice key={p.id} value={p.id} title={p.name} description={p.models} />)}
            </RadioGroup>
            <Field>
              <FieldLabel htmlFor="api-key">{provider?.name} API key</FieldLabel>
              <Input id="api-key" type="password" autoComplete="off" spellCheck={false} value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={provider?.keyPrefix ? `${provider.keyPrefix}…` : ""} />
              <FieldDescription>
                Runs on {provider?.engine}. Kept in memory for this run only, never written to disk.{" "}
                <a href={provider?.keyUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2">Get a key</a>
              </FieldDescription>
            </Field>
          </FieldSet>
        )}

        <FieldSet>
          <FieldLegend>3. Project folder</FieldLegend>
          <FieldGroup className="flex-row gap-2">
            <Input value={projectDir} onChange={(e) => setProjectDir(e.target.value)} aria-label="Project folder path" placeholder="Choose a folder…" spellCheck={false} className="font-mono text-xs" />
            <Button type="button" variant="outline" onClick={browse} disabled={browsing}>
              {browsing ? <Spinner /> : <FolderOpenIcon />} Browse…
            </Button>
          </FieldGroup>
        </FieldSet>

        {error && <FieldError>{error}</FieldError>}
        <div><Button type="submit" size="lg">Continue <ArrowRightIcon /></Button></div>

        {runs.length > 0 && (
          <section className="grid gap-2">
            <h2 className="text-sm font-medium">Runs in this session</h2>
            <ul className="grid gap-1">
              {runs.map((r) => (
                <li key={r.id}>
                  <a href={`#${r.id}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted">
                    <span className="truncate">{r.agentName} · {r.idea.slice(0, 70)}</span>
                    <Badge variant="outline" className="ms-auto">{r.state}</Badge>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
      </form>
    </main>
  )
}
