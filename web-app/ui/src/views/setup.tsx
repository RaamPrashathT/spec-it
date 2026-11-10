import * as React from "react"
import {
  ArrowRightIcon, CheckIcon, CloudIcon, CopyIcon, FolderOpenIcon, LaptopIcon, LogOutIcon, PlusIcon, RefreshCwIcon, Trash2Icon,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet, FieldTitle,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Spinner } from "@/components/ui/spinner"
import { api, loadForm, saveForm } from "@/lib/api"
import type { AgentInfo, Config, Connector, Me, Pending, SessionSummary } from "@/lib/types"

function Choice({ value, title, description, badge, disabled }: { value: string; title: React.ReactNode; description: React.ReactNode; badge?: React.ReactNode; disabled?: boolean }) {
  return (
    <FieldLabel htmlFor={`opt-${value}`} className={disabled ? "opacity-55" : undefined}>
      <Field orientation="horizontal">
        <FieldContent>
          <FieldTitle>{title} {badge}</FieldTitle>
          <FieldDescription>{description}</FieldDescription>
        </FieldContent>
        <RadioGroupItem value={value} id={`opt-${value}`} disabled={disabled} />
      </Field>
    </FieldLabel>
  )
}

function CopyLine({ text }: { text: string }) {
  const [done, setDone] = React.useState(false)
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-muted/50 p-2 ps-3">
      <code className="min-w-0 flex-1 truncate font-mono text-xs" title={text}>{text}</code>
      <Button type="button" size="sm" variant="ghost" onClick={() => { navigator.clipboard?.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500) }}>
        {done ? <CheckIcon /> : <CopyIcon />} {done ? "Copied" : "Copy"}
      </Button>
    </div>
  )
}

/** Pair a computer: show the one-time command, wait until the computer checks in. */
function AddComputer({ known, onPaired, onCancel }: { known: Set<string>; onPaired: (c: Connector) => void; onCancel: () => void }) {
  const [pair, setPair] = React.useState<{ code: string; command: string; expires: number } | null>(null)
  const [error, setError] = React.useState("")
  React.useEffect(() => { api("/api/connectors/pair", {}).then(setPair).catch((e) => setError(e.message)) }, [])
  React.useEffect(() => {
    if (!pair) return
    const t = setInterval(async () => {
      const list = await api<Connector[]>("/api/connectors").catch(() => [])
      const fresh = list.find((c) => !known.has(c.id) && c.online)
      if (fresh) onPaired(fresh)
    }, 2500)
    return () => clearInterval(t)
  }, [pair, known, onPaired])

  return (
    <Card size="sm" className="border-primary/40">
      <CardHeader>
        <CardTitle>Add a computer</CardTitle>
        <CardDescription>Runs use the agent CLIs already installed and signed in on that computer. Nothing is stored here but the pairing.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        {error && <FieldError>{error}</FieldError>}
        {!pair && !error && <Spinner />}
        {pair && (
          <>
            <ol className="grid list-decimal gap-3 ps-5">
              <li className="grid gap-1.5">Open a terminal in the project you want to spec, and run:<CopyLine text={pair.command} /></li>
              <li>Keep that window open. This page continues as soon as it connects.</li>
            </ol>
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Spinner className="size-3" /> Waiting for the computer… The code works once and expires in 15 minutes. Needs Node.js 20+.
            </p>
          </>
        )}
        <div><Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button></div>
      </CardContent>
    </Card>
  )
}

export function Setup({ config, me, onContinue }: { config: Config; me: Me; onContinue: (p: Pending) => void }) {
  const saved = React.useMemo(loadForm, [])
  const [authMode, setAuthMode] = React.useState<"cli" | "apiKey">(saved.authMode === "apiKey" && config.apiKeyEnabled ? "apiKey" : "cli")
  const [computers, setComputers] = React.useState<Connector[] | null>(null)
  const [connectorId, setConnectorId] = React.useState<string>(saved.connectorId ?? "")
  const [adding, setAdding] = React.useState(false)
  const [agents, setAgents] = React.useState<AgentInfo[] | null>(null)
  const [agentsError, setAgentsError] = React.useState("")
  const [agentId, setAgentId] = React.useState<string>(saved.agentId ?? "claude")
  const [customCommand, setCustomCommand] = React.useState<string>(saved.customCommand ?? "")
  const [projectDir, setProjectDir] = React.useState<string>("")
  const [providerId, setProviderId] = React.useState<string>(saved.providerId ?? config.providers[0].id)
  const [apiKey, setApiKey] = React.useState("")
  const [error, setError] = React.useState("")
  const [browsing, setBrowsing] = React.useState(false)
  const [runs, setRuns] = React.useState<SessionSummary[]>([])

  const loadComputers = React.useCallback(async () => {
    const list = await api<Connector[]>("/api/connectors").catch(() => [] as Connector[])
    setComputers(list)
    setConnectorId((cur) => (list.some((c) => c.id === cur) ? cur : list.find((c) => c.online)?.id ?? list[0]?.id ?? ""))
    return list
  }, [])

  React.useEffect(() => { loadComputers(); api<SessionSummary[]>("/api/sessions").then(setRuns).catch(() => {}) }, [loadComputers])
  React.useEffect(() => {
    if (authMode !== "cli") return
    const t = setInterval(loadComputers, 10_000)
    return () => clearInterval(t)
  }, [authMode, loadComputers])

  const computer = computers?.find((c) => c.id === connectorId)

  // Which agents are installed on the chosen computer (asked live).
  React.useEffect(() => {
    setAgents(null)
    setAgentsError("")
    if (!computer?.online) return
    setProjectDir((d) => d || saved.projectDirs?.[computer.id] || computer.cwd)
    api<Config>(`/api/connectors/${computer.id}/config`, {})
      .then((c) => {
        const list = [...c.agents].filter((a) => a.id !== "claude-acp" || a.installed)
          .sort((a, b) => Number(b.installed) - Number(a.installed) || Number(a.id === "custom") - Number(b.id === "custom"))
        setAgents(list)
        setAgentId((cur) => (list.find((a) => a.id === cur && a.installed) ? cur : list.find((a) => a.installed && a.id !== "custom")?.id ?? "custom"))
      })
      .catch((e) => setAgentsError(e.message))
  }, [computer?.id, computer?.online]) // eslint-disable-line react-hooks/exhaustive-deps

  const agent = agents?.find((a) => a.id === agentId)
  const provider = config.providers.find((p) => p.id === providerId)

  async function browse() {
    if (!computer) return
    setBrowsing(true)
    setError("")
    try {
      const r = await api<{ path?: string }>(`/api/connectors/${computer.id}/pick-folder`, { start: projectDir })
      if (r.path) setProjectDir(r.path)
    } catch (e: any) { setError(e.message) }
    finally { setBrowsing(false) }
  }

  async function remove(c: Connector) {
    await api(`/api/connectors/${c.id}/remove`, {}).catch(() => {})
    loadComputers()
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    if (authMode === "cli") {
      if (!computer) return setError("Add a computer first.")
      if (!computer.online) return setError(`${computer.name} is offline. Run \`spec-it connect\` on it.`)
      if (!agent?.installed) return setError("Pick an agent that's installed on that computer.")
      if (agentId === "custom" && !customCommand.trim()) return setError("Enter the agent's ACP launch command.")
      if (!projectDir.trim()) return setError("Choose the project folder on that computer.")
      saveForm({ authMode, agentId, connectorId, customCommand, projectDirs: { ...(saved.projectDirs ?? {}), [computer.id]: projectDir.trim() } })
    } else {
      if (!apiKey.trim()) return setError("Paste an API key.")
      saveForm({ authMode, providerId })
    }
    try { if ("Notification" in window && Notification.permission === "default") Notification.requestPermission() } catch { /* ignore */ }
    onContinue(authMode === "cli"
      ? { authMode, agentId, customCommand: customCommand.trim(), projectDir: projectDir.trim(), connectorId: computer!.id, connectorName: computer!.name }
      : { authMode, providerId, apiKey: apiKey.trim(), projectDir: "" })
  }

  const known = React.useMemo(() => new Set((computers ?? []).map((c) => c.id)), [computers])

  return (
    <main className="min-h-0 flex-1 overflow-y-auto">
      <header className="flex h-12 items-center gap-3 border-b px-4">
        <span className="font-heading text-sm font-semibold tracking-tight">spec-it</span>
        <span className="flex-1" />
        <img src={me.avatar} alt="" className="size-6 rounded-full" />
        <span className="text-xs text-muted-foreground">{me.login}</span>
        <Button size="sm" variant="ghost" render={<a href="/auth/logout" />}><LogOutIcon /> Sign out</Button>
      </header>
      <form onSubmit={submit} className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-10">
        <div className="grid gap-1.5">
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-balance">Turn an idea into a spec</h1>
          <p className="text-sm text-muted-foreground">
            spec-it asks only the questions that change what gets built, then writes
            <code className="mx-1 rounded bg-muted px-1 font-mono text-xs">REQUIREMENTS.md</code>and clickable mockups.
          </p>
        </div>

        <FieldSet>
          <FieldLegend>1. Where should it run?</FieldLegend>
          <RadioGroup value={authMode} onValueChange={(v) => setAuthMode(v as "cli" | "apiKey")} className="grid gap-3 sm:grid-cols-2">
            <Choice value="cli" title="My computer, my CLI login" badge={<LaptopIcon className="size-3.5 text-muted-foreground" />}
              description="No API key. Uses Claude Code, Codex or another agent you're signed into, through `spec-it connect`." />
            <Choice value="apiKey" title="In the cloud, with an API key" badge={config.apiKeyEnabled ? <CloudIcon className="size-3.5 text-muted-foreground" /> : <Badge variant="outline">Coming soon</Badge>}
              disabled={!config.apiKeyEnabled}
              description="Nothing to install. Runs in a private cloud sandbox with your Anthropic, OpenAI or Google key." />
          </RadioGroup>
        </FieldSet>

        {authMode === "cli" ? (
          <>
            <FieldSet>
              <FieldLegend>2. Which computer?</FieldLegend>
              {computers === null && <Spinner />}
              {computers && computers.length > 0 && (
                <RadioGroup value={connectorId} onValueChange={(v) => setConnectorId(String(v))} className="grid gap-2">
                  {computers.map((c) => (
                    <div key={c.id} className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <Choice value={c.id} title={c.name}
                          badge={c.online ? <Badge>Online</Badge> : <Badge variant="outline">Offline</Badge>}
                          description={c.online ? `${c.platform} · spec-it ${c.version}` : "Run `spec-it connect` on it to bring it online."} />
                      </div>
                      <Button type="button" size="icon-sm" variant="ghost" aria-label={`Remove ${c.name}`} onClick={() => remove(c)}><Trash2Icon /></Button>
                    </div>
                  ))}
                </RadioGroup>
              )}
              {adding
                ? <AddComputer known={known} onCancel={() => setAdding(false)} onPaired={(c) => { setAdding(false); loadComputers().then(() => setConnectorId(c.id)) }} />
                : (
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => setAdding(true)}><PlusIcon /> Add a computer</Button>
                    {computers && computers.length > 0 && <Button type="button" variant="ghost" size="sm" onClick={loadComputers}><RefreshCwIcon /> Refresh</Button>}
                  </div>
                )}
            </FieldSet>

            {computer?.online && (
              <FieldSet>
                <FieldLegend>3. Which agent on {computer.name}?</FieldLegend>
                {agentsError && <FieldError>{agentsError}</FieldError>}
                {!agents && !agentsError && <p className="flex items-center gap-2 text-xs text-muted-foreground"><Spinner className="size-3" /> Checking which agents are installed…</p>}
                {agents && (
                  <RadioGroup value={agentId} onValueChange={(v) => setAgentId(String(v))} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {agents.map((a) => (
                      <Choice key={a.id} value={a.id} title={a.name} disabled={!a.installed}
                        description={a.id === "custom" ? "Any ACP agent" : a.installed ? "Installed" : "Not installed"} />
                    ))}
                  </RadioGroup>
                )}
                {agent && <FieldDescription>{agent.installed ? `Uses your existing ${agent.name} sign-in on that computer. ${agent.loginHint}` : ""}</FieldDescription>}
                {agentId === "custom" && (
                  <Field>
                    <FieldLabel htmlFor="custom-cmd">ACP launch command</FieldLabel>
                    <Input id="custom-cmd" value={customCommand} onChange={(e) => setCustomCommand(e.target.value)} placeholder="e.g. kiro-cli acp" autoComplete="off" />
                  </Field>
                )}
              </FieldSet>
            )}

            {computer?.online && (
              <FieldSet>
                <FieldLegend>4. Project folder on {computer.name}</FieldLegend>
                <FieldGroup className="flex-row gap-2">
                  <Input value={projectDir} onChange={(e) => setProjectDir(e.target.value)} aria-label="Project folder path" placeholder="Choose a folder…" spellCheck={false} className="font-mono text-xs" />
                  <Button type="button" variant="outline" onClick={browse} disabled={browsing} title="Opens a folder dialog on that computer">
                    {browsing ? <Spinner /> : <FolderOpenIcon />} Browse…
                  </Button>
                </FieldGroup>
                <FieldDescription>The spec is written into <code className="font-mono">spec-it/</code> in this folder, and shown here as it's written.</FieldDescription>
              </FieldSet>
            )}
          </>
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
                Runs on {provider?.engine}, in a fresh workspace that's deleted afterwards. The key is used for this run only and never stored.{" "}
                <a href={provider?.keyUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2">Get a key</a>
              </FieldDescription>
            </Field>
          </FieldSet>
        )}

        {error && <FieldError>{error}</FieldError>}
        <div><Button type="submit" size="lg">Continue <ArrowRightIcon /></Button></div>

        {runs.length > 0 && (
          <section className="grid gap-2">
            <h2 className="text-sm font-medium">Your runs</h2>
            <ul className="grid gap-1">
              {runs.map((r) => (
                <li key={r.id}>
                  <a href={`#${r.id}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted">
                    <span className="truncate">{r.agentName} · {r.idea.slice(0, 70)}</span>
                    <span className="truncate text-xs text-muted-foreground">{r.where}</span>
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
