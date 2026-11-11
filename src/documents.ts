import type { SourceMaterial } from './types';
import { parsePageRange, importLimits as limits, validateMaterialBatch } from './importCore';
import { uid } from './core';
export type ReadResult = { material: SourceMaterial; warnings: string[] };
const stop = (signal: AbortSignal) => {
  if (signal.aborted) throw new DOMException('已取消', 'AbortError');
};
export async function fileData(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(Error('读取文件失败'));
    r.readAsDataURL(file);
  });
}
async function photo(file: Blob, name: string, page?: number) {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const url = canvas.toDataURL('image/jpeg', 0.8);
    if (url.length > limits.imageChars) throw Error('图片过大，请裁剪到单页题目后重试');
    return { name, url, page };
  } finally {
    bitmap.close();
  }
}
export async function readDocuments(
  files: File[],
  range: string,
  signal: AbortSignal,
  progress: (s: string) => void,
): Promise<ReadResult> {
  if (!files.length) throw Error('请选择文件或粘贴文章');
  if (
    files.some((f) => f.size > limits.fileBytes) ||
    files.reduce((n, f) => n + f.size, 0) > limits.fileBytes
  )
    throw Error('单文件及本批文件合计最多20 MB，请拆分后上传');
  const imagesOnly = files.every((f) => /\.(png|jpe?g|webp|bmp|gif)$/i.test(f.name));
  if (!imagesOnly && files.length > 1) throw Error('文档请一次上传一个；照片可一次选择最多6张');
  if (files.length > limits.images) throw Error('每批最多6张照片');
  const warnings: string[] = [];
  const material: SourceMaterial = {
    id: uid(),
    name: files
      .map((f) => f.name)
      .join('、')
      .slice(0, 300),
    text: '',
    images: [],
    at: new Date().toISOString(),
  };
  if (imagesOnly) {
    material.format = 'image';
    for (let i = 0; i < files.length; i++) {
      stop(signal);
      progress('正在整理照片 ' + (i + 1) + ' / ' + files.length);
      material.images.push(await photo(files[i], files[i].name, i + 1));
    }
  } else {
    const f = files[0],
      ext = f.name.split('.').pop()?.toLowerCase();
    progress('正在读取 ' + f.name);
    stop(signal);
    if (ext === 'txt' || ext === 'md') {
      material.format = 'text';
      material.text = await f.text();
    }
    else if (ext === 'doc' || ext === 'docx') {
      material.format = 'word';
      if (!window.desktop?.extractDocument) throw Error('Word 解析请使用桌面版');
      const data = await fileData(f);
      stop(signal);
      const result = await window.desktop.extractDocument({
        name: f.name,
        base64: data.slice(data.indexOf(',') + 1),
      });
      stop(signal);
      material.text = result.text;
      warnings.push(...result.warnings);
      for (const image of result.images) {
        stop(signal);
        const encoded = image.url.slice(image.url.indexOf(',') + 1),
          bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
        const raw = new Blob([bytes], { type: image.url.slice(5, image.url.indexOf(';')) });
        material.images.push(await photo(raw, image.name));
      }
    } else if (ext === 'pdf') {
      material.format = 'pdf';
      const pdfjs = await import('pdfjs-dist');
      const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      const base = new URL('./pdf/', document.baseURI).href;
      const task = pdfjs.getDocument({
        data: new Uint8Array(await f.arrayBuffer()),
        cMapUrl: base + 'cmaps/',
        cMapPacked: true,
        standardFontDataUrl: base + 'standard_fonts/',
        wasmUrl: base + 'wasm/',
        useSystemFonts: true,
        enableXfa: false,
        maxImageSize: 12000000,
      });
      const cancel = () => {
        void task.destroy();
      };
      signal.addEventListener('abort', cancel, { once: true });
      try {
        const doc = await task.promise;
        stop(signal);
        const pages = parsePageRange(range, doc.numPages);
        if (!range.trim() && doc.numPages > limits.pdfPages)
          warnings.push(
            `该PDF共${doc.numPages}页，本批只读取前${limits.pdfPages}页；其余页请填写页码后继续导入。`,
          );
        const texts: string[] = [];
        for (const n of pages) {
          stop(signal);
          progress('正在读取 PDF 第 ' + n + ' / ' + doc.numPages + ' 页');
          const page = await doc.getPage(n),
            content = await page.getTextContent();
          let line = '',
            lastY: number | undefined;
          for (const item of content.items) {
            if (!('str' in item)) continue;
            const y = item.transform[5];
            if (lastY !== undefined && Math.abs(y - lastY) > 4) line += '\n';
            line += item.str + (item.hasEOL ? '\n' : ' ');
            lastY = y;
          }
          texts.push('[第' + n + '页]\n' + line.trim());
          const raw = page.getViewport({ scale: 1 }),
            view = page.getViewport({ scale: Math.min(2, 1600 / Math.max(raw.width, raw.height)) });
          const canvas = document.createElement('canvas');
          canvas.width = Math.ceil(view.width);
          canvas.height = Math.ceil(view.height);
          const render = page.render({ canvas, viewport: view });
          const cancelRender = () => render.cancel();
          signal.addEventListener('abort', cancelRender, { once: true });
          try {
            await render.promise;
          } finally {
            signal.removeEventListener('abort', cancelRender);
          }
          material.images.push({
            name: f.name + ' · 第' + n + '页',
            page: n,
            url: canvas.toDataURL('image/jpeg', 0.78),
          });
          page.cleanup();
        }
        material.text = texts.join('\n\n');
        material.name = (f.name + '（第' + pages.join(',') + '页）').slice(0, 300);
        if (material.text.replace(/\[第\d+页\]/g, '').trim().length < 30)
          warnings.push('此PDF文字层很少，AI将主要识别页面图片；请使用支持图片的模型。');
      } catch (e) {
        stop(signal);
        if ((e as Error).name === 'PasswordException')
          throw Error('PDF带有密码，请先在本机解锁并另存副本后上传');
        throw e;
      } finally {
        signal.removeEventListener('abort', cancel);
        await task.destroy();
      }
    } else throw Error('支持照片、PDF、Word DOC/DOCX、TXT、Markdown；其他格式可另存为PDF或照片');
  }
  stop(signal);
  validateMaterialBatch(material);
  if (!material.text.trim() && !material.images.length)
    throw Error('没有读取到文字或图片，请检查文件是否为空');
  return { material, warnings };
}
