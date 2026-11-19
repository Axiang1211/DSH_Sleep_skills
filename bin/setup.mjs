// The clickable installers use this wizard. bin/install.mjs remains scriptable.
import { createInterface } from 'node:readline/promises';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { install } from './install.mjs';
import { editConfig } from '../src/config-editor.mjs';
import { loadConfig } from '../src/config.mjs';
import { scopeName } from '../src/text.mjs';
import { verifyInstallation } from '../src/verify.mjs';

function register(profile, app) {
  const args = ['plugin', '--profile', profile, 'add', 'link:' + app];
  if (process.platform !== 'win32') return spawnSync('dsh', args, { stdio: 'inherit' });
  // npm on Windows installs a .cmd shim next to the package. Call its JS
  // entry directly so user paths are passed as arguments without a shell.
  for (const dir of (process.env.PATH ?? '').split(delimiter).filter(Boolean)) {
    const exe = join(dir, 'dsh.exe');
    if (existsSync(exe)) return spawnSync(exe, args, { stdio: 'inherit' });
    const js = join(dir, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');
    if (existsSync(js)) return spawnSync(process.execPath, [js, ...args], { stdio: 'inherit' });
  }
  return { status: null };
}

async function setup() {
  const result = install();
  await verifyInstallation();
  console.log('安裝與離線記憶檢查完成。\n程式位置 ' + result.app + '\nSkill 位置 ' + result.skill);
  console.log('手動接入範例（將 desktop 換成你使用的 profile）\n' + result.dshPlugin);
  if (!process.stdin.isTTY || !process.stdout.isTTY) return;
  const ui = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const profile = (await ui.question('要接入哪個 DSH profile？直接按 Enter 結束安裝：')).trim();
    if (!profile) return;
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(profile)) throw new Error('請使用有效的 DSH profile 名稱');
    const added = register(profile, result.app);
    if (added.status !== 0) throw new Error('程式已安裝。DSH 註冊未完成，請用上方命令手動接入實際 profile。');
    const session = (await ui.question('私人 session ID（按 Enter 稍後設定）：')).trim();
    if (!session) return;
    scopeName(session);
    const scope = (await ui.question('記憶範圍名稱 [owner-personal]：')).trim() || 'owner-personal';
    scopeName(scope);
    const mappings = { ...loadConfig().sessionScopes, [session]: scope };
    console.log('重新載入後，以下 session 會開始記錄。共用範圍的 session 可讀取彼此的記憶。');
    console.log(JSON.stringify(mappings, null, 2));
    if ((await ui.question('輸入 YES 啟用這些映射：')).trim() !== 'YES') return;
    editConfig('activate', [session, scope]);
    console.log('設定完成。重新載入 profile 後，在該 session 呼叫 sleep_status 查看狀態。');
  } finally {
    ui.close();
  }
}
setup().catch(error => { console.error(error.message); process.exitCode = 1; });
