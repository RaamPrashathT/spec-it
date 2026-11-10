// Local HTTP + WebSocket server. Binds to 127.0.0.1 only; every API call needs the launch token.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { WebSocketServer } from "ws";
import { listAgents, getAgent, splitCommand, PROVIDERS, getProvider, which, CLAUDE_MODELS } from "./agents.mjs";
import { pickFolder } from "./folder-picker.mjs";
import { claudeInfo, acpInfo } from "./agent-info.mjs";
import { Session } from "./session.mjs";
import { ClaudeSdkAdapter } from "./adapters/claude-sdk.mjs";
import { AcpAdapter } from "./adapters/acp.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, "..");
// The web UI is the production build of ui/ (React + shadcn). Only ui/dist ships; build it with `npm run build`.
const WEB = path.join(ROOT, "ui", "dist");

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".md": "text/markdown; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".yaml": "text/yaml; charset=utf-8", ".yml": "text/yaml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8", ".woff2": "font/woff2", ".woff": "font/woff", ".ico": "image/x-icon", ".webp": "image/webp",
};

export function resolveSkillDir(explicit) {
  const candidates = [
    explicit,
    process.env.SPEC_IT_SKILL_DIR,
    path.join(ROOT, "skill"),                                 // bundled copy (npm run sync-skill)
    path.join(ROOT, "..", ".claude", "skills", "spec-it"),    // dev checkout of this repo
  ].filter(Boolean);
  return candidates.find((d) => fs.existsSync(path.join(d, "SKILL.md"))) ?? null;
}

export function startServer({ port = 4317, skillDir, defaultProject = process.cwd(), token: fixedToken } = {}) {
  // fixedToken: the headless runner (src/remote.mjs) drives this server with its own token. SPEC_IT_TOKEN: dev only.
  const token = fixedToken || process.env.SPEC_IT_TOKEN || randomBytes(18).toString("base64url");
  const sessions = new Map();

  const tokenOk = (t) => {
    if (!t) return false;
    const a = Buffer.from(String(t)), b = Buffer.from(token);
    return a.length === b.length && timingSafeEqual(a, b);
  };
  const cookieToken = (req) => /(?:^|;\s*)sit=([^;]+)/.exec(req.headers.cookie ?? "")?.[1];
  const authed = (req) => tokenOk(req.headers["x-specit-token"]) || tokenOk(cookieToken(req));

  const send = (res, code, body, type = "application/json") => {
    res.writeHead(code, { "content-type": type, "cache-control": "no-store" });
    res.end(type === "application/json" ? JSON.stringify(body) : body);
  };
  const readJson = (req) => new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => { data += c; if (data.length > 2e6) req.destroy(); });
    req.on("end", () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
  });
  const serveFile = (res, file) => {
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) return send(res, 404, { error: "not found" });
      res.writeHead(200, { "content-type": MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream", "cache-control": "no-store" });
      fs.createReadStream(file).pipe(res);
    });
  };
  const inside = (base, rel) => {
    const full = path.resolve(base, rel);
    return full === base || full.startsWith(base + path.sep) ? full : null;
  };

  /** Which agent, folder and launch command a request means. Shared by run start and the info probe. */
  function resolveTarget(body) {
    const authMode = body.authMode === "apiKey" ? "apiKey" : "cli";
    // API-key mode picks a provider; the provider decides which engine runs.
    const provider = authMode === "apiKey" ? getProvider(body.providerId) : null;
    if (authMode === "apiKey" && !provider) throw new Error("Choose a provider.");
    const agent = getAgent(provider ? provider.agentId : body.agentId);
    if (!agent) throw new Error("Choose an agent.");
    const projectDir = path.resolve(String(body.projectDir || defaultProject));
    if (!fs.existsSync(projectDir) || !fs.statSync(projectDir).isDirectory()) throw new Error(`Folder not found: ${projectDir}`);
    let command = agent.command, args = agent.args;
    if (provider?.fallback && !which(agent.detect)) ({ command, args } = provider.fallback);
    if (agent.id === "custom") {
      const parts = splitCommand(String(body.customCommand ?? ""));
      if (!parts.length) throw new Error("Enter the agent's ACP launch command.");
      [command, ...args] = parts;
    }
    return { authMode, provider, agent, projectDir, command, args };
  }

  function createSession(body) {
    const { authMode, agent, projectDir, command, args } = resolveTarget(body);
    const idea = String(body.idea ?? "").trim();
    if (!idea) throw new Error("Describe the idea first.");
    if (authMode === "apiKey" && !body.apiKey) throw new Error("Paste an API key, or switch to CLI login.");

    const s = new Session({ agent, authMode, projectDir, idea, model: String(body.model ?? ""), effort: String(body.effort ?? ""), budgetUsd: Number(body.budgetUsd) || 0 });
    const appUrl = `http://127.0.0.1:${server.address().port}`;
    if (agent.kind === "claude-sdk") {
      s.adapter = new ClaudeSdkAdapter(s, { skillDir, apiKey: body.apiKey });
    } else {
      s.adapter = new AcpAdapter(s, { skillDir, apiKey: body.apiKey, command, args, appUrl, token });
    }
    sessions.set(s.id, s);
    s.adapter.start().catch((err) => { s.emitEvent({ type: "error", message: err.message }); s.setState("error", err.message); });
    return s;
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    const p = url.pathname;
    try {
      // Entry: exchange ?t= for an HttpOnly cookie, then serve the UI.
      if (p === "/" || p === "/index.html") {
        if (tokenOk(url.searchParams.get("t"))) {
          res.writeHead(302, { "set-cookie": `sit=${token}; HttpOnly; SameSite=Strict; Path=/`, location: "/" });
          return res.end();
        }
        if (!authed(req)) return send(res, 401, "<p>Open the link printed in the terminal (it carries the access token).</p>", "text/html");
        if (!fs.existsSync(path.join(WEB, "index.html"))) {
          return send(res, 500, "<p>The web UI isn't built. Run <code>npm run build</code> in cli-app.</p>", "text/html");
        }
        return serveFile(res, path.join(WEB, "index.html"));
      }
      // Hashed build assets (JS, CSS, fonts): safe to cache forever.
      if (p.startsWith("/assets/")) {
        const f = inside(path.join(WEB, "assets"), decodeURIComponent(p.slice("/assets/".length)));
        if (!f || !fs.existsSync(f)) return send(res, 404, {});
        res.writeHead(200, { "content-type": MIME[path.extname(f).toLowerCase()] ?? "application/octet-stream", "cache-control": "public, max-age=31536000, immutable" });
        return fs.createReadStream(f).pipe(res);
      }

      // Bridge from the injected MCP server.
      if (p === "/internal/ask" && req.method === "POST") {
        if (!tokenOk(req.headers["x-specit-token"])) return send(res, 401, { error: "token" });
        const body = await readJson(req);
        const s = sessions.get(body.session);
        if (!s || !s.adapter?.askFromAgent) return send(res, 404, { error: "session" });
        s.adapter.askFromAgent(body.questions);
        return send(res, 200, { ok: true });
      }

      if (!authed(req)) return send(res, 401, { error: "unauthorized" });

      if (p === "/api/config") return send(res, 200, { skillDir, defaultProject, agents: listAgents(), providers: PROVIDERS, claudeModels: CLAUDE_MODELS });
      if (p === "/api/agent-info" && req.method === "POST") {
        const body = await readJson(req);
        try {
          const t = resolveTarget(body);
          if (t.authMode === "apiKey" && !body.apiKey) throw new Error("No API key.");
          if (t.agent.kind === "claude-sdk") return send(res, 200, await claudeInfo({ authMode: t.authMode, apiKey: body.apiKey, cwd: t.projectDir }));
          const env = { ...process.env };
          if (t.authMode === "apiKey" && t.agent.apiKeyEnv) { env[t.agent.apiKeyEnv] = body.apiKey; env.__API_KEY_MODE = "1"; }
          return send(res, 200, await acpInfo({ command: t.command, args: t.args, cwd: t.projectDir, env }));
        } catch (err) { return send(res, 200, { error: err.message, models: [], limits: [] }); }
      }
      if (p === "/api/pick-folder" && req.method === "POST") {
        const body = await readJson(req);
        try { return send(res, 200, await pickFolder(String(body.start ?? ""))); }
        catch (err) { return send(res, 500, { error: err.message }); }
      }
      if (p === "/api/sessions" && req.method === "GET") return send(res, 200, [...sessions.values()].map((s) => s.summary()).reverse());
      if (p === "/api/sessions" && req.method === "POST") {
        const body = await readJson(req);
        try { return send(res, 200, createSession(body).summary()); }
        catch (err) { return send(res, 400, { error: err.message }); }
      }

      // Spec files for the preview pane: /files/<session>/<spec-name>/...
      const fm = /^\/files\/([^/]+)\/(.+)$/.exec(p);
      if (fm) {
        const s = sessions.get(fm[1]);
        if (!s) return send(res, 404, {});
        const f = inside(path.resolve(s.specRoot), decodeURIComponent(fm[2]));
        return f ? serveFile(res, f) : send(res, 404, {});
      }

      const sm = /^\/api\/sessions\/([^/]+)\/(stop|message|answer|model)$/.exec(p);
      if (sm && req.method === "POST") {
        const s = sessions.get(sm[1]);
        if (!s) return send(res, 404, { error: "session" });
        const body = await readJson(req);
        if (sm[2] === "stop") { s.dispose(); s.setState("stopped"); }
        if (sm[2] === "model") { try { await s.adapter.setModel(String(body.value ?? "")); } catch (err) { return send(res, 400, { error: err.message }); } }
        if (sm[2] === "message") s.adapter.sendUser(String(body.text ?? ""));
        if (sm[2] === "answer" && !s.resolvePending(body.id, body.value)) return send(res, 409, { error: "already answered" });
        return send(res, 200, { ok: true });
      }

      send(res, 404, { error: "not found" });
    } catch (err) {
      send(res, 500, { error: err.message });
    }
  });

  // Live event stream: /ws?session=<id>. Replays history, then streams.
  const wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url, "http://x");
    const origin = req.headers.origin ?? "";
    const s = sessions.get(url.searchParams.get("session"));
    if (url.pathname !== "/ws" || !authed(req) || !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin) || !s) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.send(JSON.stringify({ type: "hello", session: s.summary(), events: s.events }));
      const onEvent = (e) => ws.readyState === 1 && ws.send(JSON.stringify(e));
      s.on("event", onEvent);
      ws.on("close", () => s.off("event", onEvent));
    });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      const actual = server.address().port;
      resolve({ server, url: `http://127.0.0.1:${actual}/?t=${token}`, port: actual, close: () => { for (const s of sessions.values()) s.dispose(); server.close(); } });
    });
  });
}
