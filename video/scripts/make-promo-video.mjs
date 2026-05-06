import { spawn } from "node:child_process";

const args = new Set(process.argv.slice(2));
const skipCapture = args.has("--skip-capture");
const skipInspect = args.has("--skip-inspect");
const skipRender = args.has("--skip-render");
const port = process.env.JUICE_PROMO_PORT ?? "4178";
const gameUrl = process.env.JUICE_GAME_URL ?? `http://127.0.0.1:${port}/juice-chain-drop/`;

let server = null;

function run(command, commandArgs, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      stdio: "inherit",
      shell: false,
      ...options,
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${commandArgs.join(" ")} exited with ${code}`));
    });
    child.on("error", reject);
  });
}

async function waitForServer(url, timeoutMs = 30_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Keep polling until the dev server is ready.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function startGameServer() {
  server = spawn("bun", ["run", "dev", "--", "--host", "127.0.0.1", "--port", port], {
    cwd: "..",
    stdio: "inherit",
    shell: false,
  });
  server.on("error", (error) => {
    throw error;
  });
  await waitForServer(gameUrl);
}

function stopGameServer() {
  if (server && !server.killed) {
    server.kill("SIGTERM");
  }
}

try {
  console.log(`Promo pipeline target: ${gameUrl}`);

  if (!skipCapture) {
    await startGameServer();
    await run("bun", ["run", "capture"], {
      env: { ...process.env, JUICE_GAME_URL: gameUrl },
    });
  }

  await run("bun", ["run", "lint"]);

  if (!skipInspect) {
    await run("bun", ["run", "inspect"]);
  }

  if (!skipRender) {
    await run("bun", ["run", "render"]);
    await run("bun", ["run", "gif"]);
  }

  console.log("Promo video pipeline completed.");
} finally {
  stopGameServer();
}
