# spec-it

Turn an idea into a `REQUIREMENTS.md` a coding agent can build from, plus clickable mockups. spec-it researches your codebase and how established products solve the problem, then asks only the questions that change what gets built.

It comes in three forms:

| | What | Get it |
|---|---|---|
| **Skill** | A Claude Code skill: `/spec-it "<idea>"` in your terminal | [`.claude/skills/spec-it`](.claude/skills/spec-it): copy into your project's `.claude/skills/` |
| **Web app** | Hosted: sign in with GitHub, run on your computer (no key) or in the cloud with your key | https://spec-it.klhrms.workers.dev ([web-app](web-app)) |
| **App** | A local web app that runs the skill through the agent you already use (Claude Code, Codex, Gemini CLI, Copilot, OpenCode, any ACP agent), or an API key | `npm install -g spec-it-app`, then run `spec-it` in your project ([cli-app](cli-app)) |

## Repository

```
.claude/skills/spec-it/   the skill: SKILL.md, references, templates, check/render scripts, evals
cli-app/                  the npm package `spec-it-app`: Node server + React/shadcn UI (ui/), plus `spec-it connect`
web-app/                  the hosted app: Cloudflare Worker + Durable Objects, React UI, Modal runner
docs/                     research behind the interview, UI generation and skill design
test-projects/            how the eval fixtures are set up (the fixture repos are local only)
REQUIREMENTS.md           requirements for spec-it itself
```

## Develop

```bash
cd cli-app
npm run setup     # server + UI dependencies, builds ui/dist
npm start
```

See [cli-app/README.md](cli-app/README.md) for the agent connections, packaging and publishing.

## License

MIT
