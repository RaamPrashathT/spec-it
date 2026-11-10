// spec-it hosted web app: GitHub sign-in, the React UI (static assets), the API, and WebSocket relays.
// Runs execute either on the user's computer (`spec-it connect`, their own agent logins) or, with an API key,
// in a Modal cloud sandbox. Both talk to the run's Durable Object with the same runner protocol.
import type { Env, User } from "./env"
import { callback, currentUser, login, logout, signSession } from "./auth"
import { AGENTS, CLAUDE_MODELS, PROVIDERS, providerModels } from "./catalog"
import type { RunSummary } from "./run"
import { err, json, randomId, randomToken, readJson } from "./util"

export { Run } from "./run"
export { UserHub, Pairing } from "./user-hub"

const hub = (env: Env, uid: string) => env.USER_HUB.get(env.USER_HUB.idFromName(uid)) as any
const run = (env: Env, id: string) => env.RUN.get(env.RUN.idFromName(id)) as any
const pairing = (env: Env) => env.PAIRING.get(env.PAIRING.idFromName("global")) as any
const validRunId = (id: string) => /^[a-f0-9]{8,24}$/.test(id)

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    const p = url.pathname
    try {
      // ---------- sign-in ----------
      if (p === "/auth/login") return login(req, env)
      if (p === "/auth/callback") return callback(req, env)
      if (p === "/auth/logout") return logout()
      // Local testing without a GitHub OAuth app: only with DEV_LOGIN=1 in .dev.vars AND a localhost host.
      if (p === "/auth/dev-login" && env.DEV_LOGIN === "1" && ["localhost", "127.0.0.1"].includes(url.hostname)) {
        const sid = await signSession(env, { uid: "1", login: "dev", name: "Local dev", avatar: "data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E" })
        return new Response(null, { status: 302, headers: { location: "/", "set-cookie": `sid=${encodeURIComponent(sid)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400` } })
      }

      // ---------- runner and connector endpoints (token auth, no cookie) ----------
      if (p === "/api/connector/claim" && req.method === "POST") {
        const b = await readJson<{ code?: string; name?: string; platform?: string; version?: string }>(req)
        const who = await pairing(env).claim(String(b.code ?? "").toUpperCase())
        if (!who) return err("That pairing code is wrong or expired. Make a new one in the web app.", 400)
        const { token } = await hub(env, who.uid).addConnector(who.uid, b)
        return json({ token, login: who.login })
      }
      if (p === "/ws/connector") {
        const uid = (url.searchParams.get("token") ?? "").split(".")[0]
        if (!/^\d+$/.test(uid)) return new Response("forbidden", { status: 403 })
        const inner = new URL(req.url)
        inner.pathname = "/connector"
        return hub(env, uid).fetch(new Request(inner, req))
      }
      let m = /^\/ws\/runner\/([a-f0-9]+)$/.exec(p)
      if (m && validRunId(m[1])) {
        const inner = new URL(req.url)
        inner.pathname = "/runner"
        return run(env, m[1]).fetch(new Request(inner, req))
      }
      m = /^\/api\/runner\/([a-f0-9]+)\/body$/.exec(p)
      if (m && validRunId(m[1])) {
        const body = await run(env, m[1]).body(url.searchParams.get("token") ?? "")
        return body ? json(body) : err("forbidden", 403)
      }

      // ---------- everything below needs a signed-in user ----------
      const needsUser = p.startsWith("/api/") || p === "/ws" || p.startsWith("/files/")
      if (!needsUser) return env.ASSETS.fetch(req)
      const user = await currentUser(req, env)
      if (!user) return err("unauthorized", 401)
      return await authed(req, env, user, url)
    } catch (e: any) {
      return err(e?.message ?? "Server error", 500)
    }
  },
} satisfies ExportedHandler<Env>

async function authed(req: Request, env: Env, user: User, url: URL): Promise<Response> {
  const p = url.pathname
  const h = hub(env, user.uid)

  if (p === "/api/me") return json(user)
  if (p === "/api/config") {
    return json({
      hosted: true,
      server: url.origin,
      apiKeyEnabled: Boolean(env.MODAL_LAUNCH_URL && env.LAUNCH_SECRET),
      skillDir: "",
      defaultProject: "",
      agents: AGENTS,
      providers: PROVIDERS,
      claudeModels: CLAUDE_MODELS,
    })
  }

  // ---------- computers (connectors) ----------
  if (p === "/api/connectors" && req.method === "GET") return json(await h.listConnectors())
  if (p === "/api/connectors/pair" && req.method === "POST") {
    const { code, expires } = await pairing(env).create(user.uid, user.login)
    return json({ code, expires, command: `npx spec-it-app connect ${code} --server ${url.origin}` })
  }
  let m = /^\/api\/connectors\/([a-f0-9]+)\/(remove|config|pick-folder)$/.exec(p)
  if (m && req.method === "POST") {
    const [, id, action] = m
    if (action === "remove") { await h.removeConnector(id); return json({ ok: true }) }
    try {
      const body = await readJson(req)
      return json(await h.rpc(id, action, body, action === "pick-folder" ? 180_000 : 30_000))
    } catch (e: any) { return err(e.message, 409) }
  }

  // ---------- models, account and usage for the draft screen ----------
  if (p === "/api/agent-info" && req.method === "POST") {
    const b = await readJson<any>(req)
    if (b.authMode === "apiKey") {
      if (!b.apiKey) return json({ models: [], limits: [], error: "No API key." })
      const r = await providerModels(b.providerId, b.apiKey)
      return json({ ...r, limits: [], account: { plan: "API key", organization: null, provider: b.providerId } })
    }
    try {
      return json(await h.rpc(b.connectorId, "agent-info", { ...b, connectorId: undefined }, 160_000))
    } catch (e: any) {
      return json({ models: [], limits: [], error: e.message })
    }
  }

  // ---------- runs ----------
  if (p === "/api/sessions" && req.method === "GET") {
    const runs: RunSummary[] = await h.listRuns()
    // Refresh state from each run (cheap; the list is short).
    const fresh = await Promise.all(runs.map(async (r) => ({ ...r, ...((await run(env, r.id).summary()) ?? {}) })))
    return json(fresh)
  }
  if (p === "/api/sessions" && req.method === "POST") return createRun(req, env, user, url)

  m = /^\/api\/sessions\/([a-f0-9]+)\/(stop|message|answer|model)$/.exec(p)
  if (m && req.method === "POST") {
    const r = await run(env, m[1]).command(user.uid, m[2], await readJson(req))
    return r.ok ? json({ ok: true }) : err(r.error ?? "failed", r.error === "not found" ? 404 : 409)
  }

  if (p === "/ws") {
    const id = url.searchParams.get("session") ?? ""
    if (!validRunId(id)) return err("not found", 404)
    const inner = new URL(req.url)
    inner.pathname = "/browser"
    inner.search = `?uid=${encodeURIComponent(user.uid)}`
    return run(env, id).fetch(new Request(inner, req))
  }

  m = /^\/files\/([a-f0-9]+)\/(.+)$/.exec(p)
  if (m && validRunId(m[1])) {
    const f = await run(env, m[1]).file(user.uid, decodeURIComponent(m[2]))
    if (!f) return new Response("not found", { status: 404 })
    return new Response(f.data, {
      headers: {
        "content-type": f.type,
        "cache-control": "no-store",
        // Mockups are agent-written HTML: keep them off the network and away from the app's cookies and API.
        "content-security-policy": "default-src 'self' 'unsafe-inline' data: blob:; connect-src 'none'; frame-ancestors 'self'",
      },
    })
  }

  return err("not found", 404)
}

async function createRun(req: Request, env: Env, user: User, url: URL) {
  const b = await readJson<any>(req)
  const idea = String(b.idea ?? "").trim()
  if (!idea) return err("Describe the idea first.")
  const authMode: "cli" | "apiKey" = b.authMode === "apiKey" ? "apiKey" : "cli"
  const id = randomId(6)
  const token = randomToken(24)
  const h = hub(env, user.uid)

  let agentId = String(b.agentId ?? "")
  let where = "Cloud sandbox"
  if (authMode === "apiKey") {
    if (!env.MODAL_LAUNCH_URL || !env.LAUNCH_SECRET) return err("API-key runs aren't enabled on this server yet.", 503)
    const provider = PROVIDERS.find((x) => x.id === b.providerId)
    if (!provider) return err("Choose a provider.")
    if (!b.apiKey) return err("Paste an API key.")
    agentId = provider.agentId
  } else {
    const comps = await h.listConnectors()
    const comp = comps.find((c: any) => c.id === b.connectorId)
    if (!comp) return err("Choose one of your computers.")
    if (!comp.online) return err(`${comp.name} is offline. Run \`spec-it connect\` on it.`, 409)
    where = `Your computer: ${comp.name}`
  }
  const agent = AGENTS.find((a) => a.id === agentId)
  if (!agent) return err("Choose an agent.")

  // What the runner needs to start the local engine. Never includes the API key.
  const body = {
    authMode, agentId, providerId: b.providerId, customCommand: b.customCommand, projectDir: authMode === "apiKey" ? "" : String(b.projectDir ?? ""),
    idea, model: String(b.model ?? ""), effort: String(b.effort ?? ""), budgetUsd: Number(b.budgetUsd) || undefined,
  }
  const summary: RunSummary = {
    id, agent: agentId, agentName: agent.name, authMode, projectDir: body.projectDir || "/work", idea, model: body.model,
    budgetUsd: Number(b.budgetUsd) || null, state: "starting", createdAt: new Date().toISOString(), where,
  }
  await run(env, id).init({ owner: user.uid, token, summary, body })
  await h.addRun(summary)

  if (authMode === "cli") {
    try { await h.startRun(b.connectorId, { runId: id, runToken: token, body }) }
    catch (e: any) { return err(e.message, 409) }
  } else {
    const provider = PROVIDERS.find((x) => x.id === b.providerId)!
    const res = await fetch(env.MODAL_LAUNCH_URL!, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ secret: env.LAUNCH_SECRET, server: url.origin, run_id: id, run_token: token, api_key: b.apiKey, env_name: provider.envVar }),
    })
    if (!res.ok) return err(`Couldn't start the cloud sandbox (${res.status}).`, 502)
  }
  return json(summary)
}
