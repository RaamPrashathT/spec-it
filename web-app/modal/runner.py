"""
spec-it cloud runner on Modal: the only Python in the project, and it's glue.

The Cloudflare Worker calls `launch` (an HTTPS endpoint) when someone starts an API-key run. `launch` spawns `run`
in a fresh container (one container per run, never reused) that executes the same Node runner the CLI uses:
    node bin/spec-it-app.mjs run-remote --server <worker> --run <id> --token <run token>
The runner connects back to the run's Durable Object over WebSocket and streams the whole run.

Deployed by .github/workflows/deploy-modal.yml on every push to main (no local Python needed).
"""
import os
import subprocess
from pathlib import Path

import modal

ROOT = Path(__file__).resolve().parents[2]  # repo root
CLI = ROOT / "cli-app"
SKILL = ROOT / ".claude" / "skills" / "spec-it"

app = modal.App("spec-it-runner")

# Node 22 + the spec-it engine (cli-app without its UI) + the skill. Agent CLIs that aren't bundled
# (codex-acp, gemini-cli) are fetched with npx at run time.
runner_image = (
    modal.Image.from_registry("node:22-bookworm-slim", add_python="3.12")
    .apt_install("git", "ca-certificates")
    .add_local_dir(str(CLI / "bin"), "/opt/spec-it/bin", copy=True)
    .add_local_dir(str(CLI / "src"), "/opt/spec-it/src", copy=True)
    .add_local_file(str(CLI / "package.json"), "/opt/spec-it/package.json", copy=True)
    .add_local_file(str(CLI / "package-lock.json"), "/opt/spec-it/package-lock.json", copy=True)
    .add_local_dir(str(SKILL), "/opt/spec-it/skill", copy=True, ignore=["evals", "evals/**"])
    .run_commands("cd /opt/spec-it && npm ci --omit=dev --no-audit --no-fund", "mkdir -p /work")
)

web_image = modal.Image.debian_slim().pip_install("fastapi[standard]")

# LAUNCH_SECRET: shared with the Worker. SERVER_ORIGIN: the only Worker allowed to start runs.
launcher_secret = modal.Secret.from_name("spec-it-launcher")


@app.function(image=runner_image, timeout=2 * 60 * 60, cpu=1.0, memory=2048, max_inputs=1)
def run(server: str, run_id: str, run_token: str, api_key: str, env_name: str) -> int:
    """One API-key run, in its own container. The key lives only in this process's environment."""
    env = {**os.environ, "SPECIT_API_KEY": api_key, env_name: api_key, "CI": "1"}
    proc = subprocess.run(
        ["node", "/opt/spec-it/bin/spec-it-app.mjs", "run-remote", "--server", server, "--run", run_id, "--token", run_token],
        cwd="/work",
        env=env,
    )
    return proc.returncode


@app.function(image=web_image, secrets=[launcher_secret])
@modal.fastapi_endpoint(method="POST", docs=False)
def launch(payload: dict):
    import hmac

    from fastapi import HTTPException  # only the web image has FastAPI

    secret = os.environ.get("LAUNCH_SECRET", "")
    # The shared secret travels in the HTTPS body (keeps this module importable in the runner image too).
    if not secret or not hmac.compare_digest(str(payload.get("secret", "")), secret):
        raise HTTPException(status_code=401, detail="unauthorized")
    server = str(payload.get("server", ""))
    allowed = os.environ.get("SERVER_ORIGIN", "")
    if not allowed or server.rstrip("/") != allowed.rstrip("/"):
        raise HTTPException(status_code=403, detail="server not allowed")
    run_id, run_token = str(payload.get("run_id", "")), str(payload.get("run_token", ""))
    api_key, env_name = str(payload.get("api_key", "")), str(payload.get("env_name", ""))
    if not (run_id and run_token and api_key and env_name.isidentifier()):
        raise HTTPException(status_code=400, detail="bad request")
    call = run.spawn(server, run_id, run_token, api_key, env_name)
    return {"ok": True, "call": call.object_id}
