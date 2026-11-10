#!/usr/bin/env node
// spec-it [--port 4317] [--project <dir>] [--skill <dir>] [--no-open]
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startServer, resolveSkillDir } from "../src/server.mjs";

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const pkg = JSON.parse(readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "package.json"), "utf8"));

if (argv.includes("--version") || argv.includes("-v")) {
  console.log(pkg.version);
  process.exit(0);
}
if (argv.includes("--help") || argv.includes("-h")) {
  console.log(`spec-it ${pkg.version}: turn an idea into REQUIREMENTS.md and mockups with the coding agent you already use.

Usage: run it inside your project folder.
  spec-it [options]

  spec-it connect <CODE> --server <url>   link this computer to the hosted web app
  spec-it connect                         reconnect a computer that's already linked

Options:
  --project <dir>   project to write spec-it/ into (default: current folder)
  --port <n>        port on 127.0.0.1 (default: 4317, or a free one if taken)
  --no-open         don't open the browser
  --skill <dir>     use another copy of the spec-it skill (folder with SKILL.md)
  -v, --version     print the version
  -h, --help        show this help

Agents: Claude Code, Codex, Gemini CLI, Copilot CLI, OpenCode, Cursor, Qwen, Goose,
or any ACP agent. Uses their existing login, or an API key you paste in the app.`);
  process.exit(0);
}

// Hosted web app: `spec-it connect [CODE] --server URL` pairs this computer; `run-remote` runs inside a cloud sandbox.
if (argv[0] === "connect" || argv[0] === "run-remote") {
  const { connect, runRemote } = await import("../src/remote.mjs");
  try {
    if (argv[0] === "connect") {
      const code = argv[1] && !argv[1].startsWith("--") ? argv[1] : undefined;
      await connect({ code, server: flag("server", process.env.SPEC_IT_SERVER), project: flag("project") });
    } else {
      await runRemote({ server: flag("server"), runId: flag("run"), token: flag("token") });
    }
  } catch (err) {
    console.error(`\n  ${err.message}\n`);
    process.exit(1);
  }
  await new Promise(() => {}); // connect runs until Ctrl+C
}

const skillDir = resolveSkillDir(flag("skill"));
if (!skillDir) {
  console.error("spec-it skill not found. Pass --skill <dir> (the folder with SKILL.md).");
  process.exit(1);
}

const wanted = Number(flag("port", process.env.PORT ?? 4317));
const opts = { skillDir, defaultProject: path.resolve(flag("project", process.cwd())) };
let started;
try {
  started = await startServer({ ...opts, port: wanted });
} catch (err) {
  if (err.code !== "EADDRINUSE" || argv.includes("--port")) throw err;
  started = await startServer({ ...opts, port: 0 }); // 4317 busy (maybe another spec-it): take any free port
}
const { url } = started;

console.log(`\n  spec-it ${pkg.version}  →  ${url}\n  project: ${opts.defaultProject}\n  Ctrl+C to stop.\n`);

if (!argv.includes("--no-open")) {
  const cmd = process.platform === "win32" ? ["cmd", ["/c", "start", "", url]]
    : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
  spawn(cmd[0], cmd[1], { stdio: "ignore", detached: true }).on("error", () => {}).unref();
}
