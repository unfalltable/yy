const fs = require('node:fs');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const asar = require('@electron/asar');
const archive = 'release/win-unpacked/resources/app.asar';
const expectedVersion = require('../package.json').version;
const file = 'release/Lingo-Study-' + expectedVersion + '-Windows.exe';
const extract = (p) =>
  asar.extractFile(archive, p.slice(1).split('/').join(require('node:path').sep));
const list = asar.listPackage(archive).map((p) => p.replaceAll(String.fromCharCode(92), '/'));
const forbidden = list.filter((p) => /^\/(tests|examples|src|\.tools)(\/|$)/.test(p));
assert.deepEqual(forbidden, [], 'Project tests, source fixtures and examples must not ship');
const fields = list
  .filter((p) => p.startsWith('/dist/') && p.endsWith('.js'))
  .filter((p) => {
    const js = extract(p).toString();
    return ['[STEM_FIELD]', '[PERSONAL_ESSAY_FIELD]', '[OPTION_FIELD_0]'].some((token) =>
      js.includes(token),
    );
  });
assert.deepEqual(fields, [], 'No test question fields in production JavaScript');
const productionScripts = list.filter((p) => p.startsWith('/dist/') && p.endsWith('.js'));
assert.ok(productionScripts.some((p) => extract(p).toString().includes('companionHistory')), 'Persistent companion history must ship');
for (const field of ['重复资料提醒','入库去重结果','contentHash','英语二']) assert.ok(productionScripts.some(p => extract(p).toString().includes(field)), 'Deduplication and clear exam labels must ship: '+field);
for (const field of ['来源待核实','metadataBasis','来源信息不要求用户手填']) assert.ok(productionScripts.some(p => extract(p).toString().includes(field)), 'Optional metadata must ship: '+field);
for (const field of ['companionSession','companionStyle','结合当前学习内容','暂停陪学','停止回答']) assert.ok(productionScripts.some(p => extract(p).toString().includes(field)), 'Coach feature must ship: '+field);
for (const field of ['筛选 / 换题','考试范围','题目年份','题目难度','学习进度','题目排序','全部考试']) assert.ok(productionScripts.some(p => extract(p).toString().includes(field)), 'Cross-exam bank filters must ship: '+field);
const productionStyles = list.filter((p) => p.startsWith('/dist/') && p.endsWith('.css'));
assert.ok(productionStyles.some((p) => extract(p).toString().includes('.companion-floating')), 'Fixed companion styles must ship');
const models = list.filter((p) => p.endsWith('.vrm'));
assert.equal(models.length, 4);
assert.ok(list.includes('/assets/AVATAR-LICENSES.md'));
const modelHashes = models.map((p) => ({
  path: p,
  sha256: crypto.createHash('sha256').update(extract(p)).digest('hex'),
}));
assert.ok(
  modelHashes.some(
    (m) => m.sha256 === '52520b514414372ecac1e260ba5dff42f7d8642596200469038d6fb2f881b224',
  ),
);
assert.ok(
  modelHashes.some(
    (m) => m.sha256 === '12c2b97e95e700783a6a550dc0eee2d7880aeedccef9ae67bc4c5a2f0f2631a2',
  ),
);
for (const hash of ['ffbd8c92a9e67c0a948f69c7a2eec91e5c282c9ae70e9184309fc164d74cbc27', '624d0d554bc205bbdc33e22a68a2c3c20edebb3e573011ead8878a65e5329b23']) assert.ok(modelHashes.some(m => m.sha256 === hash));
const expectedMotionHashes = require('../assets/motions/manifest.json').map(m => m.sha256).sort();
const animationHashes = list.filter(p => p.endsWith('.vrma')).map(p => crypto.createHash('sha256').update(extract(p)).digest('hex')).sort();
assert.deepEqual(animationHashes, expectedMotionHashes, 'Licensed captured motion clips must ship unchanged');
assert.ok(extract('/electron/main.cjs').toString().includes('titleBarOverlay'), 'Native Windows controls must ship');
assert.ok(list.includes('/electron/import-limits.json'));
const limits = JSON.parse(extract('/electron/import-limits.json').toString());
assert.equal(limits.pdfPages, 20);
assert.equal(limits.images, 6);
assert.equal(limits.textChars, 100000);
assert.equal(limits.aiPromptChars, 120000);
assert.equal(limits.fileBytes, 20000000);
const version = JSON.parse(asar.extractFile(archive, 'package.json').toString()).version;
assert.equal(version, expectedVersion);
assert.ok(list.includes('/electron/document-worker.cjs'));
assert.ok(list.some((p) => p.startsWith('/dist/pdf/cmaps/')));
assert.ok(list.some((p) => p.startsWith('/dist/pdf/standard_fonts/')));
assert.ok(list.some((p) => p.startsWith('/dist/pdf/wasm/')));
assert.ok(list.some((p) => p.startsWith('/dist/assets/pdf.worker.min-') && p.endsWith('.mjs')));
console.log(
  JSON.stringify(
    {
      file,
      bytes: fs.statSync(file).size,
      sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
      version,
      models: modelHashes,
      animations: animationHashes,
      projectFixtures: forbidden,
      testFields: fields,
      vendorExampleDirectories: list.filter(
        (p) => p.startsWith('/node_modules/') && p.includes('/examples/'),
      ).length,
      verified: true,
    },
    null,
    2,
  ),
);
