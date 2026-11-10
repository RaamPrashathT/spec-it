# spec-it web app (hosted)

The hosted version of spec-it, on Cloudflare. Live at **https://spec-it.klhrms.workers.dev**.

Sign in with GitHub, then run spec-it either way:

| Method | Where the agent runs | What the user needs |
|---|---|---|
| **My computer, my CLI login** | On the user's computer, through `spec-it connect` (outbound WebSocket, no open ports) | Node 20+, an agent CLI they're signed into (Claude Code, Codex, Gemini…). No API key. |
| **In the cloud, with an API key** | A fresh, isolated Modal container per run, deleted afterwards | Their own Anthropic, OpenAI or Google key. Used for that run only, never stored. |

```
Browser ──► Cloudflare Worker  (React UI from ui/dist, GitHub OAuth, API)
              ├─ UserHub DO   one per GitHub user: paired computers, runs list, requests to computers
              ├─ Run DO       one per run: event log, spec + mockup files, browser and runner WebSockets
              └─ Pairing DO   one-time pairing codes
                   ▲ same runner protocol for both methods
   ┌───────────────┴───────────────────┐
`spec-it connect` (user's computer)   Modal container: `spec-it run-remote`
                                      started by modal/runner.py
```

Both runners are the `spec-it-app` npm engine (`cli-app/src`) started headlessly, with its events relayed to the Run DO (`cli-app/src/remote.mjs`). Everything runs on the Cloudflare **Free** plan (SQLite Durable Objects) plus Modal's free monthly credit.

## One-time setup

### 1. Cloudflare secrets

```bash
cd web-app
npx wrangler secret put SESSION_SECRET     # any long random string; signs login cookies
npx wrangler secret put LAUNCH_SECRET      # another long random string; shared with Modal (step 3)
```

To generate a random value: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`

### 2. GitHub sign-in

Go to github.com → Settings → Developer settings → OAuth Apps → **New OAuth App**:

- Homepage URL: `https://spec-it.klhrms.workers.dev`
- Authorization callback URL: `https://spec-it.klhrms.workers.dev/auth/callback`

Then:
- Put the **Client ID** in `wrangler.jsonc` → `vars.GITHUB_CLIENT_ID`.
- Run `npx wrangler secret put GITHUB_CLIENT_SECRET` and paste a newly generated client secret.
- Redeploy with `npm run deploy`.

### 3. API-key mode (Modal)

1. Create a token at modal.com → Settings → API Tokens.
2. Add these repo secrets at GitHub → this repo → Settings → Secrets and variables → Actions:
   - `MODAL_TOKEN_ID` and `MODAL_TOKEN_SECRET`: the Modal token.
   - `LAUNCH_SECRET`: the **same** value as the Cloudflare `LAUNCH_SECRET`.
   - `SERVER_ORIGIN`: `https://spec-it.klhrms.workers.dev`
3. Run the **Deploy Modal runner** workflow (Actions tab → Run workflow), or push to `main`.
4. Copy the endpoint URL it prints (`https://<workspace>--spec-it-runner-launch.modal.run`) into `wrangler.jsonc` → `vars.MODAL_LAUNCH_URL`, then run `npm run deploy`.

Until then, the app shows API-key mode as "Coming soon".

### 4. Publish the connector

`spec-it connect` ships in `spec-it-app` 0.2.0. Run `cd cli-app && npm publish` once, so the pairing command `npx -y spec-it-app@0.2 connect …` works for everyone.

## Develop locally

```bash
cd web-app
npm install && npm --prefix ui install
npm run dev                       # builds ui/dist, then wrangler dev
```

Create `web-app/.dev.vars` (gitignored):

```
DEV_LOGIN=1                       # enables /auth/dev-login, on localhost only
SESSION_SECRET=anything-local
GITHUB_CLIENT_SECRET=unused
```

Open `/auth/dev-login`, choose **Add a computer**, and run the shown command with the local engine: `node ../cli-app/bin/spec-it-app.mjs connect <CODE> --server http://localhost:8790`.

To test API-key runs without Modal, add `MODAL_LAUNCH_URL=http://127.0.0.1:8791` and a `LAUNCH_SECRET` to `.dev.vars`, then run `LAUNCH_SECRET=... node modal/local-launcher.mjs`. It runs `spec-it run-remote` locally with the same contract as `modal/runner.py`.

| Path | |
|---|---|
| `worker/src/index.ts` | routes: auth, API, WebSocket and file relays, run creation |
| `worker/src/auth.ts` | GitHub OAuth, HMAC-signed session cookie |
| `worker/src/run.ts` | Run Durable Object |
| `worker/src/user-hub.ts` | UserHub and Pairing Durable Objects |
| `worker/src/catalog.ts` | agents, providers, live model lists for API keys |
| `ui/` | React + shadcn UI (shared design with cli-app/ui) |
| `modal/runner.py` | Modal app: `launch` endpoint and per-run `run` container |
| `../.github/workflows/deploy-modal.yml` | deploys the Modal app on push to main |

## Security notes

- Session cookies are HMAC-signed, `HttpOnly`, `Secure`, `SameSite=Lax`. The GitHub token is used once to read the profile and then dropped.
- Computers authenticate with a random token, stored only as a SHA-256 hash. Removing a computer revokes it immediately.
- Each run has its own random runner token. Only the owner's session can read a run, its WebSocket or its files.
- Mockup files are served with a CSP that blocks network access (`connect-src 'none'`).
- API keys go Worker → Modal in one HTTPS call, and live only in that run's container environment. They're never stored or logged by spec-it.
