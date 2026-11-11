const fs = require('node:fs');
const { PDFDocument, StandardFonts } = require('pdf-lib');
const JSZip = require('jszip');
const { createCanvas } = require('@napi-rs/canvas');
(async () => {
  fs.mkdirSync('tests/fixtures', { recursive: true });
  const canvas = createCanvas(900, 1200),
    ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, 900, 1200);
  ctx.fillStyle = '#222';
  ctx.font = '28px sans-serif';
  ctx.fillText('[IMAGE_DOCUMENT_FIELD]', 60, 100);
  const png = canvas.toBuffer('image/png');
  fs.writeFileSync('tests/fixtures/photo.png', png);
  for (const scanned of [false, true]) {
    const doc = await PDFDocument.create(),
      font = await doc.embedFont(StandardFonts.Helvetica),
      image = await doc.embedPng(png);
    for (let i = 1; i <= 2; i++) {
      const page = doc.addPage([600, 800]);
      if (scanned) page.drawImage(image, { x: 0, y: 0, width: 600, height: 800 });
      else page.drawText('[DOCUMENT_BODY_FIELD] PAGE ' + i, { x: 50, y: 720, font, size: 16 });
    }
    fs.writeFileSync('tests/fixtures/' + (scanned ? 'scanned' : 'text') + '.pdf', await doc.save());
  }
  const long = await PDFDocument.create();
  const longFont = await long.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 21; i++) {
    const page = long.addPage([600, 800]);
    page.drawText('[DOCUMENT_BODY_FIELD] PAGE ' + i, { x: 50, y: 720, font: longFont, size: 16 });
  }
  fs.writeFileSync('tests/fixtures/long.pdf', await long.save());
  const dense = await PDFDocument.create();
  const denseFont = await dense.embedFont(StandardFonts.Helvetica);
  for (let n = 1; n <= 12; n++) {
    const page = dense.addPage([600, 800]);
    for (let row = 0; row < 70; row++)
      page.drawText('[DOCUMENT_BODY_FIELD] PAGE ' + n + ' LINE ' + row + ' [DOCUMENT_BODY_FIELD]', {
        x: 24, y: 770 - row * 10, font: denseFont, size: 8.5,
      });
  }
  fs.writeFileSync('tests/fixtures/dense.pdf', await dense.save());
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  zip.file(
    'word/document.xml',
    '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>[DOCUMENT_BODY_FIELD]</w:t></w:r></w:p></w:body></w:document>',
  );
  zip.file('word/media/image1.png', png);
  fs.writeFileSync('tests/fixtures/document.docx', await zip.generateAsync({ type: 'nodebuffer' }));
  fs.writeFileSync('tests/fixtures/article.txt', '[DOCUMENT_BODY_FIELD]');
  console.log('Created structural PDF, scanned PDF, DOCX, image and text fixtures');
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
