const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const prettier = require('prettier');
(async () => {
  const files = [
    'src/data.ts',
    'src/VrmAvatar.tsx',
    'electron/main.cjs',
    'scripts/electron-smoke.cjs',
    'scripts/fetch-vrm-fixture.cjs',
    'tests/app.spec.ts',
    'src/styles.css',
    'examples/question-bank.json',
  ];
  const out = [];
  for (const p of files) {
    const source = await fs.readFile(p, 'utf8');
    const formatted = await prettier.format(source, {
      filepath: p,
      singleQuote: true,
      printWidth: 100,
      trailingComma: 'all',
    });
    if (source === formatted) continue;
    const target = '.tools/final-format/' + p;
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, formatted);
    out.push({ path: p, hash: crypto.createHash('sha256').update(source).digest('hex'), target });
  }
  await fs.writeFile('.tools/final-format-manifest.json', JSON.stringify(out));
  console.log('Formatting prepared for ' + out.length + ' changed files');
})();
