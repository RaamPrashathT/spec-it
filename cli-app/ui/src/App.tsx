import * as React from "react"
import { Spinner } from "@/components/ui/spinner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { api } from "@/lib/api"
import type { Config, Pending } from "@/lib/types"
import { Setup } from "@/views/setup"
import { DraftView, RunView } from "@/views/run"

function useHash() {
  const [hash, setHash] = React.useState(() => location.hash.slice(1))
  React.useEffect(() => {
    const on = () => setHash(location.hash.slice(1))
    window.addEventListener("hashchange", on)
    return () => window.removeEventListener("hashchange", on)
  }, [])
  return hash
}

/** Routes: "" setup · "#new" type the idea · "#<runId>" a live run. */
export function App() {
  const hash = useHash()
  const [config, setConfig] = React.useState<Config | null>(null)
  const [error, setError] = React.useState("")
  // The setup choices (may include an API key) live in memory only; reloading #new returns to setup.
  const [pending, setPending] = React.useState<Pending | null>(null)

  React.useEffect(() => { api<Config>("/api/config").then(setConfig).catch((e) => setError(e.message)) }, [])
  React.useEffect(() => { if (hash === "new" && !pending) location.hash = "" }, [hash, pending])

  const home = () => { location.hash = "" }

  let body: React.ReactNode
  if (error) body = <p className="m-auto max-w-md p-6 text-center text-sm text-muted-foreground">{error === "unauthorized" ? "Open the link printed in the terminal (it carries the access token)." : error}</p>
  else if (!config) body = <Spinner className="m-auto size-6" />
  else if (hash === "new" && pending) body = <DraftView config={config} pending={pending} onHome={home} onStarted={(id) => { setPending(null); location.hash = id }} />
  else if (hash && hash !== "new") body = <RunView key={hash} runId={hash} onHome={home} />
  else body = <Setup config={config} onContinue={(p) => { setPending(p); location.hash = "new" }} />

  return (
    <TooltipProvider>
      <div className="flex h-dvh flex-col bg-background text-foreground">{body}</div>
    </TooltipProvider>
  )
}

export default App
