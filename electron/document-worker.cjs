const { parentPort, workerData } = require('node:worker_threads');
const limits = require('./import-limits.json');
const mammoth = require('mammoth'),
  WordExtractor = require('word-extractor'),
  JSZip = require('jszip');
(async () => {
  const data = Buffer.from(workerData.data),
    images = [],
    warnings = [];
  let text = '';
  if (workerData.ext === 'doc') {
    const result = await new WordExtractor().extract(data);
    text = result.getBody() + '\n' + result.getTextboxes({ includeHeadersAndFooters: false });
    warnings.push('旧版DOC当前提取正文与文本框；含图表的页面可另存PDF或照片补充识别。');
  } else {
    const zip = await JSZip.loadAsync(data);
    const entries = Object.values(zip.files);
    if (
      entries.length > 10000 ||
      entries.reduce((n, f) => n + (f._data?.uncompressedSize || 0), 0) > 100000000
    )
      throw Error('Word解压后体积过大，请拆分文档');
    if (!zip.file('word/document.xml')) throw Error('文件不是有效的DOCX文档');
    const result = await mammoth.extractRawText({ buffer: data });
    text = result.value;
    for (const entry of entries.filter((f) => /^word\/media\//.test(f.name) && !f.dir)) {
      const ext = entry.name.split('.').pop().toLowerCase();
      if (!['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
        warnings.push('有无法直接识别的矢量图，请将相关页面另存PDF或照片');
        continue;
      }
      if (images.length >= limits.images)
        throw Error('Word图片超过6张，请拆分文档，或转PDF后选页分批上传');
      const bytes = await entry.async('nodebuffer');
      if (bytes.length > 5000000) {
        warnings.push('有超过5MB的内嵌图片，请单独裁剪上传');
        continue;
      }
      images.push({
        name: entry.name.split('/').pop(),
        url: 'data:image/' + (ext === 'jpg' ? 'jpeg' : ext) + ';base64,' + bytes.toString('base64'),
      });
    }
    if (entries.some((f) => f.name.startsWith('word/charts/')))
      warnings.push('文档包含图表；如文字提取不完整，请将图表页另存PDF或照片。');
  }
  if (text.length > limits.textChars)
    throw Error(`Word文字超过${limits.textChars / 10000}万字符，请按章节拆分，或转PDF后选页分批上传`);
  parentPort.postMessage({
    ok: true,
    result: { text: text.trim(), images, warnings: [...new Set(warnings)] },
  });
})().catch((e) =>
  parentPort.postMessage({
    ok: false,
    error: e.message || 'Word解析失败，请转换为PDF或DOCX后重试',
  }),
);
