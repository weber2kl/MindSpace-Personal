import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const packageVersion = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const [nextVersion = packageVersion, previousVersion = '1.5.1'] = process.argv.slice(2);
const archiveTool = join(root, 'node_modules', 'electron-winstaller', 'vendor', '7z.exe');
const runtime = join(root, '.runtime');

function execute(executable, args) {
  const result = spawnSync(executable, args, { windowsHide: true, encoding: 'utf8' });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${executable}\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

function digests(directory) {
  const files = new Map();
  for (const entry of readdirSync(directory, { withFileTypes: true, recursive: true })) {
    if (entry.isDirectory()) continue;
    assert.ok(entry.isFile(), `Unexpected installer payload object: ${entry.name}`);
    const filename = join(entry.parentPath, entry.name);
    const key = filename.slice(directory.length + 1);
    const hash = createHash('sha256').update(readFileSync(filename)).digest('hex');
    files.set(key, hash);
  }
  return files;
}

mkdirSync(runtime, { recursive: true });
const checkedRoot = realpathSync(runtime);
const directory = mkdtempSync(join(checkedRoot, 'installer-qa-'));

function extract(version, label) {
  assert.match(version, /^\d+\.\d+\.\d+$/);
  const release = join(root, 'release', version);
  const installer = join(release, `MindSpace-Personal-Setup-${version}-x64.exe`);
  const outer = join(directory, label, 'outer');
  const inner = join(directory, label, 'app');
  execute(archiveTool, ['t', installer]);
  execute(archiveTool, ['e', installer, '$PLUGINSDIR\\app-64.7z', `-o${outer}`, '-y']);
  execute(archiveTool, ['x', join(outer, 'app-64.7z'), `-o${inner}`, '-y']);
  const expected = digests(join(release, 'win-unpacked'));
  const actual = digests(inner);
  assert.deepEqual(actual, expected, `Installer ${version} differs from its unpacked build`);
  console.log(`NSIS ${version}: verified ${actual.size} extracted application files.`);
  return join(inner, 'MindSpace Personal.exe');
}

try {
  const previous = extract(previousVersion, 'previous');
  const next = extract(nextVersion, 'next');
  const smoke = fileURLToPath(new URL('./smoke.mjs', import.meta.url));
  console.log(execute(process.execPath, [smoke, next, previous]).trim());
  console.log('Installer archive and packaged binary upgrade verified. Windows installer wizard and registry writes were not run.');
} finally {
  const target = realpathSync(resolve(directory));
  if (dirname(target) === checkedRoot) rmSync(target, { recursive: true, maxRetries: 12, retryDelay: 100 });
}
