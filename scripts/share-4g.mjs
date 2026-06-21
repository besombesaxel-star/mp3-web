import { spawn } from "node:child_process";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import localtunnel from "localtunnel";

const args = new Set(process.argv.slice(2));
const useProd = args.has("--prod");
const port = Number(process.env.PORT || "3000");
const host = process.env.HOST || "127.0.0.1";
const subdomain = process.env.TUNNEL_SUBDOMAIN || undefined;
const exitAfterReady = process.env.SHARE_4G_EXIT_AFTER_READY === "1";
const targetUrl = `http://${host}:${port}`;

const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";

let tunnel = null;
let appProcess = null;
let startedLocally = false;
let shuttingDown = false;

function prefixPipe(stream, prefix) {
  if (!stream) return;

  let buffer = "";
  stream.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim().length > 0) {
        console.log(`${prefix} ${line}`);
      }
    }
  });

  stream.on("end", () => {
    if (buffer.trim().length > 0) {
      console.log(`${prefix} ${buffer}`);
    }
  });
}

async function isReachable(url) {
  try {
    const response = await fetch(url, { cache: "no-store" });
    return response.ok || response.status < 500;
  } catch {
    return false;
  }
}

async function getPublicIp() {
  try {
    const response = await fetch("https://api.ipify.org?format=json", { cache: "no-store" });
    if (!response.ok) return null;
    const data = await response.json();
    return typeof data?.ip === "string" && data.ip.trim().length > 0 ? data.ip.trim() : null;
  } catch {
    return null;
  }
}

async function waitForServer(url, timeoutMs = 60_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await isReachable(url)) return true;
    await delay(800);
  }

  return false;
}

function runCommand(command, commandArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      cwd: process.cwd(),
      stdio: "inherit",
      shell: process.platform === "win32",
      env: process.env,
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`La commande ${command} ${commandArgs.join(" ")} a echoue avec le code ${code ?? "null"}.`));
    });
  });
}

function startAppServer() {
  const commandArgs = useProd
    ? ["run", "start", "--", "--hostname", host, "--port", String(port)]
    : ["run", "dev", "--", "--hostname", host, "--port", String(port)];

  const child = spawn(npmCmd, commandArgs, {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
    env: process.env,
  });

  prefixPipe(child.stdout, "[app]");
  prefixPipe(child.stderr, "[app]");

  child.on("exit", (code) => {
    if (!shuttingDown) {
      console.error(`[app] Le serveur s'est arrete (code ${code ?? "null"}).`);
    }
  });

  return child;
}

async function cleanup(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  const closeTasks = [];

  if (tunnel) {
    try {
      const closeResult = tunnel.close();
      if (closeResult && typeof closeResult.then === "function") {
        closeTasks.push(closeResult.catch(() => {}));
      }
    } catch {
      // ignore close errors during shutdown
    }
  }

  if (appProcess && startedLocally && !appProcess.killed) {
    appProcess.kill("SIGINT");
  }

  await Promise.all(closeTasks);
  process.exit(exitCode);
}

process.on("SIGINT", () => {
  cleanup(0);
});

process.on("SIGTERM", () => {
  cleanup(0);
});

process.on("uncaughtException", async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await cleanup(1);
});

process.on("unhandledRejection", async (reason) => {
  console.error(reason instanceof Error ? reason.message : reason);
  await cleanup(1);
});

async function main() {
  const alreadyRunning = await isReachable(targetUrl);

  if (!alreadyRunning) {
    startedLocally = true;

    if (useProd) {
      console.log("Build de production en cours...");
      await runCommand(npmCmd, ["run", "build"]);
    }

    console.log(`Demarrage de l'app sur ${targetUrl}...`);
    appProcess = startAppServer();

    const ready = await waitForServer(targetUrl);
    if (!ready) {
      throw new Error(`Le serveur local n'a pas repondu sur ${targetUrl} a temps.`);
    }
  } else {
    console.log(`Serveur detecte sur ${targetUrl}, reutilisation en cours...`);
  }

  console.log("Creation du tunnel public...");
  tunnel = await localtunnel({
    port,
    local_host: host,
    subdomain,
  });
  const publicIp = await getPublicIp();

  tunnel.on("close", () => {
    if (!shuttingDown) {
      console.log("Le tunnel 4G a ete ferme.");
      cleanup(0);
    }
  });

  tunnel.on("error", (error) => {
    if (!shuttingDown) {
      console.error(error instanceof Error ? error.message : error);
      cleanup(1);
    }
  });

  console.log("");
  console.log(`URL 4G : ${tunnel.url}`);
  if (publicIp) {
    console.log(`IP de verification : ${publicIp}`);
  }
  console.log("Laisse cette fenetre ouverte pour garder le site accessible en 4G.");
  if (subdomain) {
    console.log(`Sous-domaine demande : ${subdomain}`);
  }
  console.log("");

  if (exitAfterReady) {
    await cleanup(0);
  }
}

await main();
