const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const prettier = require('prettier');
(async () => {
  const files = [
    'package.json',
    'tsconfig.json',
    'vite.config.ts',
    'vitest.config.ts',
    'playwright.config.ts',
    'index.html',
    'README.md',
  ];
  for (const dir of ['src', 'electron', 'scripts', 'tests', 'docs'])
    for (const entry of await fs.readdir(dir))
      if (/\.(tsx?|cjs|css|md)$/.test(entry)) files.push(dir + '/' + entry);
  const result = [];
  for (const file of files) {
    const original = await fs.readFile(file, 'utf8');
    const formatted = await prettier.format(original, {
      filepath: file,
      singleQuote: true,
      printWidth: 100,
      trailingComma: 'all',
    });
    const out = '.tools/formatted/' + file;
    await fs.mkdir(path.dirname(out), { recursive: true });
    await fs.writeFile(out, formatted);
    result.push({
      path: file,
      hash: crypto.createHash('sha256').update(original).digest('hex'),
      formattedPath: out,
    });
  }
  await fs.writeFile('.tools/format-manifest.json', JSON.stringify(result));
  console.log('Prepared ' + result.length + ' formatted files without changing source');
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
