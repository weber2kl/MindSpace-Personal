import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { basename, join } from 'node:path';
import { stat } from 'node:fs/promises';

const execute = promisify(execFile);
const versionParts = value => /^\d+\.\d+\.\d+$/.test(value) ? value.split('.').map(Number) : null;

export function checkUpdateMetadata(filename, metadata, currentVersion) {
  const match = /^MindSpace-Personal-Setup-(\d+\.\d+\.\d+)-x64\.exe$/i.exec(basename(filename));
  if (!match || metadata.product !== 'MindSpace Personal') throw new Error('Это не установщик MindSpace Personal для Windows x64.');
  const next = versionParts(metadata.version);
  const current = versionParts(currentVersion);
  if (!next || !current || match[1] !== metadata.version) throw new Error('Версия в имени файла не совпадает с версией программы.');
  if (next[0] !== current[0]) throw new Error('Для этой основной версии совместимость данных ещё не подтверждена.');
  const difference = next.map((v,i) => v-current[i]).find(v => v !== 0) ?? 0;
  if (difference <= 0) throw new Error('Выберите более новую версию. Повторная установка и откат через эту кнопку запрещены.');
  if (metadata.signature !== 'Valid') throw new Error('Установщик не имеет действительной цифровой подписи. Приложение не будет его запускать. Для своей сборки создайте копию базы и запустите проверенный установщик вручную.');
  // No signing identity has been provisioned. A valid signature from an arbitrary
  // publisher is insufficient; keep this fail-closed until a publisher is pinned.
  throw new Error('Подпись файла действительна, но доверенный издатель MindSpace Personal пока не настроен. Автоматическая установка недоступна. Нужна подписанная цепочка выпусков и настройка NSIS / electron-updater.');
}

export async function inspectLocalUpdate(filename, currentVersion) {
  if (process.platform !== 'win32') throw new Error('Проверка установщика доступна только в Windows.');
  if (!/^MindSpace-Personal-Setup-\d+\.\d+\.\d+-x64\.exe$/i.test(basename(filename))) throw new Error('Выберите установщик MindSpace-Personal-Setup-ВЕРСИЯ-x64.exe.');
  const info = await stat(filename);
  if (!info.isFile() || info.size > 1024 * 1024 * 1024) throw new Error('Неверный тип или размер файла установщика.');
  const script = `$ErrorActionPreference='Stop'; $f=Get-Item -LiteralPath $env:MINDSPACE_UPDATE_CANDIDATE; $s=Get-AuthenticodeSignature -LiteralPath $f.FullName; @{product=$f.VersionInfo.ProductName;version=$f.VersionInfo.ProductVersion;signature=[string]$s.Status} | ConvertTo-Json -Compress`;
  const powershell = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const { stdout } = await execute(powershell, ['-NoProfile', '-NonInteractive', '-Command', script], {
    windowsHide: true, timeout: 30000, maxBuffer: 65536, env: { ...process.env, MINDSPACE_UPDATE_CANDIDATE: filename },
  });
  return checkUpdateMetadata(filename, JSON.parse(stdout.replace(/^\uFEFF/, '')), currentVersion);
}
