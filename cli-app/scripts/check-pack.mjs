// Fails `npm pack` / `npm publish` unless the tarball holds only what should ship:
// the server, the built UI (ui/dist), and the skill without its evals. No React source, no node_modules.
import { execSync } from "node:child_process";

const out = execSync("npm pack --dry-run --json --ignore-scripts", { encoding: "utf8" });
const [info] = JSON.parse(out);
const files = info.files.map((f) => f.path.replaceAll("\\", "/"));

const banned = [
  [/^ui\/(?!dist\/)/, "UI source (only ui/dist may ship)"],
  [/\.(tsx|ts)$/, "TypeScript/React source"],
  [/(^|\/)node_modules\//, "node_modules"],
  [/^skill\/evals\//, "skill evals (hidden test requirements)"],
  [/^test\//, "tests"],
  [/(^|\/)\.env/, "env files"],
];
const problems = files.flatMap((f) => banned.filter(([re]) => re.test(f)).map(([, why]) => `${f}  (${why})`));
const required = ["ui/dist/index.html", "skill/SKILL.md", "bin/spec-it-app.mjs", "src/server.mjs"];
const missing = required.filter((r) => !files.includes(r));

// npm rejects unscoped names that match an existing package once punctuation is stripped
// ("spec-it" vs the existing "specit"). Catch that here instead of after the upload starts.
if (!info.name.startsWith("@")) {
  const squashed = info.name.replace(/[^a-z0-9]/gi, "").toLowerCase();
  for (const other of new Set([squashed, info.name.replace(/[-_.]/g, "-")])) {
    if (other === info.name) continue;
    try {
      const owner = execSync(`npm view ${other} name`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
      if (owner) problems.push(`package name "${info.name}" is too close to existing "${owner}" (npm will refuse it)`);
    } catch { /* 404: free */ }
  }
}

if (problems.length || missing.length) {
  if (problems.length) console.error("Should not ship:\n  " + problems.join("\n  "));
  if (missing.length) console.error("Missing from the package:\n  " + missing.join("\n  "));
  process.exit(1);
}
console.log(`check-pack: ok, ${files.length} files, ${(info.size / 1024).toFixed(0)} kB packed (UI ships as ui/dist only).`);
