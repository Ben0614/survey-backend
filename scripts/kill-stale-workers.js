// ============================================================
// kill-stale-workers.js —— 清掉上一輪殘留的 jest 行程
//
// 用途：e2e 測試被中斷（Ctrl+C、逾時、終端機關掉）之後，
// **外層的 pnpm 被殺掉了，裡面的 jest 還活著** —— Windows 沒有 process group，
// 殺父行程不會連坐子行程。每個殘留的 jest 都握著一組資料庫連線，
// 累積幾個之後下一輪測試就會卡住或大量 ECONNRESET。
//
// 怎麼被執行：
//   1. 自動 —— package.json 的 pretest:e2e，pnpm 會在 test:e2e 之前跑它
//   2. 手動 —— pnpm kill:jest
//
// 為什麼是 pre 而不是 post：**post 在被中斷時根本不會執行**，
// 而「被中斷」正是產生殘留行程的那個情況。pre 的保證是
// 「每次開跑都從乾淨狀態開始」，不管上一次是怎麼死的。
//
// 為什麼安全：pre 執行的當下還沒有任何合法的 jest 行程存在，所以不會誤殺。
//
// 檔名刻意不叫 kill-stale-jest.js —— 那個檔名裡含有 `jest.js` 這個子字串，
// 而下面正是用「命令列含 jest.js」來找目標，它會把自己殺掉。
//
// 背景見 docs/專案速查.md 的「e2e 測試連線問題怎麼查」。
// ============================================================

const { execSync } = require('child_process');

// 比對條件刻意只用 `jest.js`，不用 `jest` 也不用 `test:e2e`：
//   `jest`     —— 太寬，這支腳本的路徑若含 jest 就會匹配到自己
//   `test:e2e` —— 會匹配到**正在呼叫這支腳本的那個 pnpm 父行程**，等於自殺
// `jest.js` 只會出現在 `node .../jest/bin/jest.js` 這種真正的 jest 行程上。
const PATTERN = 'jest.js';

// Windows 的 Get-CimInstance 全部用單引號，外層才能安全地用雙引號包起來。
// 樣板字串裡的 $_ 不是 ${，所以 JS 不會把它當成內插。
const PS_LIST = `powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' } | ForEach-Object { $_.ProcessId.ToString() + '|' + $_.CommandLine }"`;

function listNodeProcesses() {
  const isWindows = process.platform === 'win32';
  const cmd = isWindows ? PS_LIST : 'ps -eo pid=,args=';

  let raw;
  try {
    raw = execSync(cmd, { encoding: 'utf8', windowsHide: true });
  } catch {
    // 列不出行程不該讓測試跑不起來 —— 清理是輔助，不是前提。
    return [];
  }

  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      // Windows 是 "1234|node ...", POSIX 是 "1234 node ..."
      const separator = isWindows ? line.indexOf('|') : line.indexOf(' ');
      if (separator === -1) return null;
      return {
        pid: Number(line.slice(0, separator)),
        cmd: line.slice(separator + 1).trim(),
      };
    })
    .filter((p) => p && Number.isInteger(p.pid));
}

const stale = listNodeProcesses().filter(
  // 排除自己：這支腳本的命令列不含 jest.js，但多一道防線不花錢。
  (p) => p.pid !== process.pid && p.cmd.includes(PATTERN),
);

if (stale.length === 0) {
  // 沒東西要清就完全安靜 —— 它每次跑測試都會執行，不該製造雜訊。
  process.exit(0);
}

// 有清就要出聲。清理如果是無聲的，你永遠不會知道自己一直在留下殘骸。
console.log(`[kill-stale-workers] 發現 ${stale.length} 個殘留的 jest 行程：`);
for (const p of stale) {
  try {
    process.kill(p.pid, 'SIGKILL');
    console.log(`  已清除 pid=${p.pid}`);
  } catch (err) {
    // 行程可能在列舉之後、殺掉之前自己結束了，那不是錯誤。
    console.log(`  pid=${p.pid} 清除失敗（可能已自行結束）：${err.code ?? err.message}`);
  }
}
