const { chromium } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const p = await browser.newPage({
      viewport: { width: 256, height: 256 },
      deviceScaleFactor: 1,
    });
    await p.goto(pathToFileURL(path.resolve('assets/icon.svg')).href);
    const png = await p.screenshot({ omitBackground: true });
    await fs.writeFile('assets/icon.png', png);
    const h = Buffer.alloc(22);
    h.writeUInt16LE(1, 2);
    h.writeUInt16LE(1, 4);
    h.writeUInt16LE(1, 10);
    h.writeUInt16LE(32, 12);
    h.writeUInt32LE(png.length, 14);
    h.writeUInt32LE(22, 18);
    await fs.writeFile('assets/icon.ico', Buffer.concat([h, png]));
    console.log('App icon generated');
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
