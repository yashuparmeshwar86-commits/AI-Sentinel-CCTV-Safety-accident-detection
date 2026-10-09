import app from "./app";
import { logger } from "./lib/logger";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const workspaceRoot = resolve(process.cwd(), "../..");
const pythonPath = resolve(workspaceRoot, ".pythonlibs/bin/python");
const workerDir = resolve(workspaceRoot, "artifacts/ai-sentinel/backend");
const dataDir = resolve(process.cwd(), ".data/ai-sentinel");
const worker = spawn(
  existsSync(pythonPath) ? pythonPath : "python3",
  [
    "-m",
    "uvicorn",
    "main:app",
    "--host",
    "127.0.0.1",
    "--port",
    "8765",
    "--app-dir",
    workerDir,
  ],
  {
    cwd: workerDir,
    env: {
      ...process.env,
      AI_SENTINEL_DATA_DIR: dataDir,
      PYTHONUNBUFFERED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);

worker.on("error", (err) => {
  logger.warn({ err }, "Could not start the Python analysis worker");
});
worker.stderr.on("data", (chunk: Buffer) => {
  const line = chunk.toString().trim();
  if (line) logger.info({ worker: "fastapi", line }, "Python analysis worker");
});
worker.on("exit", (code, signal) => {
  logger.warn({ code, signal }, "Python analysis worker exited");
});

process.on("SIGTERM", () => worker.kill("SIGTERM"));
process.on("SIGINT", () => worker.kill("SIGINT"));
process.on("exit", () => worker.kill());

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
