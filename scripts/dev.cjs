const { spawn } = require('node:child_process');
const path = require('node:path');
const vite = spawn(
  process.execPath,
  [path.join(__dirname, '../node_modules/vite/bin/vite.js'), '--host', '127.0.0.1'],
  { stdio: 'inherit', windowsHide: true },
);
let electron;
async function start() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch('http://127.0.0.1:5173');
      if (r.ok) {
        electron = spawn(require('electron'), ['.', '--dev'], {
          stdio: 'inherit',
          windowsHide: true,
        });
        electron.on('exit', () => {
          vite.kill();
          process.exit();
        });
        return;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  vite.kill();
  process.exitCode = 1;
}
process.on('SIGINT', () => {
  electron?.kill();
  vite.kill();
  process.exit();
});
start();
