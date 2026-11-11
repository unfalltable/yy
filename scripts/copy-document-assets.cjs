const fs = require('node:fs');
const path = require('node:path');
for (const name of ['cmaps', 'standard_fonts', 'wasm']) {
  const source = path.join('node_modules/pdfjs-dist', name),
    target = path.join('public/pdf', name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, { recursive: true });
}
console.log('PDF fonts, CMaps and decoders ready (local/offline)');
