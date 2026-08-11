/**
 * End-to-end smoke: unit tests + Generate (Cursor) + Snap.
 *
 * Usage:
 *   npm run smoke
 *
 * Requires CURSOR_API_KEY in .env.local (or the environment).
 */
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const PORT = Number(process.env.SMOKE_PORT || 3460);
const BASE = `http://127.0.0.1:${PORT}`;

async function loadEnvLocal() {
  try {
    const raw = await fs.readFile(path.join(root, ".env.local"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const key = m[1];
      let val = m[2] ?? "";
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // optional
  }
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: root,
      stdio: "inherit",
      shell: true,
      env: process.env,
      ...opts,
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(" ")} exited ${code}`));
    });
  });
}

function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["next", "start", "-p", String(PORT)], {
      cwd: root,
      shell: true,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let ready = false;
    const onData = (buf) => {
      const text = buf.toString();
      process.stdout.write(text);
      if (!ready && /Ready|started server/i.test(text)) {
        ready = true;
        resolve(child);
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("exit", (code) => {
      if (!ready) reject(new Error(`next start exited early (${code})`));
    });
    setTimeout(() => {
      if (!ready) {
        // Next sometimes prints Ready before our regex; try anyway
        ready = true;
        resolve(child);
      }
    }, 8000);
  });
}

async function waitForHealth(ms = 20000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try {
      const res = await fetch(BASE + "/");
      if (res.ok) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error("Server did not become ready");
}

async function testGenerate() {
  console.log("\n→ POST /api/generate (Cursor)…");
  const res = await fetch(BASE + "/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: "tiny green slime monster sprite",
      width: 32,
      height: 32,
      colors: 16,
      transparent: false,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Generate failed ${res.status}: ${data.error ?? JSON.stringify(data)}`);
  }
  console.log(
    `  OK model=${data.model} ${data.width}x${data.height} colors=${data.colorsUsed} png=${data.pngBase64?.length ?? 0} chars`,
  );
  const out = path.join(root, "scripts", ".smoke-generate.png");
  await fs.writeFile(out, Buffer.from(data.pngBase64, "base64"));
  console.log(`  wrote ${out}`);
}

async function main() {
  await loadEnvLocal();
  if (!process.env.CURSOR_API_KEY?.trim()) {
    throw new Error("CURSOR_API_KEY missing — set it in .env.local");
  }

  console.log("→ npm test");
  await run("npm", ["test"]);

  console.log("\n→ npm run build");
  await run("npm", ["run", "build"]);

  const server = await startServer();
  try {
    await waitForHealth();
    await testGenerate();
    console.log("\nSmoke passed.");
  } finally {
    server.kill("SIGTERM");
  }
}

main().catch((err) => {
  console.error("\nSmoke failed:", err.message ?? err);
  process.exit(1);
});
