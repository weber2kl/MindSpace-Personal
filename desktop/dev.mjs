import electron from 'electron';
import { createServer } from 'vite';
import { spawn } from 'node:child_process';

const server = await createServer();
await server.listen();
server.printUrls();

const child = spawn(electron, [...process.argv.slice(2), '.', '--development'], { stdio: 'inherit' });
function stop() {
  child.kill();
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

try {
  process.exitCode = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', (code) => resolve(code ?? 0));
  });
} finally {
  process.off('SIGINT', stop);
  process.off('SIGTERM', stop);
  await server.close();
}
