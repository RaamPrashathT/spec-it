// Local stand-in for web-app/modal/runner.py, for testing API-key runs with `wrangler dev` without Modal.
// Same contract: POST {secret, server, run_id, run_token, api_key, env_name} → runs `spec-it run-remote` locally.
// Usage: LAUNCH_SECRET=... node web-app/modal/local-launcher.mjs   (then MODAL_LAUNCH_URL=http://127.0.0.1:8791 in .dev.vars)
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const BIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../cli-app/bin/spec-it-app.mjs");
const SECRET = process.env.LAUNCH_SECRET;
if (!SECRET) throw new Error("Set LAUNCH_SECRET");

http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const p = JSON.parse(body || "{}");
    if (p.secret !== SECRET) { res.writeHead(401).end("unauthorized"); return; }
    const work = fs.mkdtempSync(path.join(os.tmpdir(), "spec-it-run-"));
    const child = spawn(process.execPath, [BIN, "run-remote", "--server", p.server, "--run", p.run_id, "--token", p.run_token], {
      cwd: work, env: { ...process.env, SPECIT_API_KEY: p.api_key, [p.env_name]: p.api_key }, stdio: "inherit",
    });
    console.log(`run ${p.run_id} → pid ${child.pid} in ${work}`);
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ok: true }));
  });
}).listen(8791, "127.0.0.1", () => console.log("local launcher on http://127.0.0.1:8791"));
