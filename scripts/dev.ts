import path from 'node:path';

const rootDir = path.resolve(import.meta.dir, '..');
const bunExec = process.execPath;
const backendUrl = 'http://127.0.0.1:3001/';
const frontendUrl = 'http://127.0.0.1:3002/';

const readHttpResponse = async (url: string) => {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(1000),
    });

    return {
      ok: response.ok,
      body: await response.text(),
    };
  } catch {
    return null;
  }
};

const spawnDevProcess = (cmd: string[], env: Record<string, string | undefined>) =>
  Bun.spawn({
    cmd,
    cwd: rootDir,
    env,
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  });

const isBackendReady = async () => {
  const response = await readHttpResponse(backendUrl);
  return !!response?.ok && response.body.includes('Hono API Server is running!');
};

const waitForBackend = async (backendProcess: Bun.Subprocess, timeoutMs: number) => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (backendProcess.exitCode !== null) {
      return false;
    }

    if (await isBackendReady()) {
      return true;
    }

    await Bun.sleep(250);
  }

  return false;
};

const stopProcess = (processToStop: Bun.Subprocess | null | undefined) => {
  if (!processToStop || processToStop.exitCode !== null) {
    return;
  }

  try {
    processToStop.kill();
  } catch {
    // Ignore shutdown errors from already-exiting processes.
  }
};

let backendProcess: Bun.Subprocess | null = null;
let frontendProcess: Bun.Subprocess | null = null;
let shuttingDown = false;

const shutdown = () => {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  stopProcess(frontendProcess);
  stopProcess(backendProcess);
};

process.on('SIGINT', () => {
  shutdown();
  process.exit(0);
});

process.on('SIGTERM', () => {
  shutdown();
  process.exit(0);
});

const main = async () => {
  const existingBackend = await readHttpResponse(backendUrl);
  if (existingBackend) {
    if (existingBackend.body.includes('Hono API Server is running!')) {
      throw new Error('Port 3001 already has a backend instance running. Stop it before starting `bun run dev` again.');
    }

    throw new Error('Port 3001 is already serving another HTTP app. A stale Bun frontend is likely still running there.');
  }

  const existingFrontend = await readHttpResponse(frontendUrl);
  if (existingFrontend) {
    throw new Error('Port 3002 is already serving another HTTP app. Stop the existing frontend process before starting `bun run dev` again.');
  }

  backendProcess = spawnDevProcess(
    [bunExec, 'run', 'server/index.ts'],
    {
      ...process.env,
      NODE_ENV: 'development',
      PORT: '3001',
    }
  );

  const backendReady = await waitForBackend(backendProcess, 15000);
  if (!backendReady) {
    shutdown();
    const exitCode = await backendProcess.exited;
    process.exit(exitCode === 0 ? 1 : exitCode);
  }

  console.log('Backend ready on http://localhost:3001');

  frontendProcess = spawnDevProcess(
    [bunExec, '--port', '3002', '--hot', 'public/index.html'],
    {
      ...process.env,
      NODE_ENV: 'development',
    }
  );

  console.log('Frontend starting on http://localhost:3002');

  const exitedProcess = await Promise.race([
    backendProcess.exited.then((code) => ({ name: 'backend', code })),
    frontendProcess.exited.then((code) => ({ name: 'frontend', code })),
  ]);

  if (!shuttingDown) {
    console.error(`${exitedProcess.name} exited with code ${exitedProcess.code}. Stopping dev processes.`);
  }

  shutdown();
  process.exit(exitedProcess.code);
};

main().catch((error) => {
  console.error('Failed to start dev processes:', error);
  shutdown();
  process.exit(1);
});
