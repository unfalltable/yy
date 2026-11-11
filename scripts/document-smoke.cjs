const { _electron: electron } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
(async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'lingo-documents-'));
  const received = [];
  const item = {
    title: '[TITLE_FIELD]',
    kind: 'reading',
    paragraphs: ['[DOCUMENT_BODY_FIELD]'],
    sourceLocator: '1',
    questions: [
      {
        stem: '[STEM_FIELD]',
        options: ['[OPTION_A]', '[OPTION_B]'],
        answer: 0,
        answerBasis: 'ai',
        skill: '[SKILL_FIELD]',
        explanation: '[EXPLANATION_FIELD]',
        evidence: '[EVIDENCE_FIELD]',
        hints: ['[HINT_FIELD]'],
      },
    ],
  };
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    received.push(body);
    if (body.model === 'cancel-fixture') return;
    const prompt=typeof body.messages[1].content==='string' ? body.messages[1].content : body.messages[1].content.find(c=>c.type==='text').text;
    const responseItem={...item,paragraphs:[prompt.includes('dense.pdf') ? '[DENSE_DOCUMENT_BODY_FIELD]' : prompt.includes('long.pdf') ? '[LONG_DOCUMENT_BODY_FIELD]' : '[DOCUMENT_BODY_FIELD]']};
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        choices: [
          {
            message: { content: JSON.stringify({ items: [body.model === 'vision-fixture' ? { ...responseItem,metadata:{year:'2010',paper:'[PAPER_FIELD]',reference:'[REFERENCE_FIELD]',evidence:'[HEADER_FIELD]'} } : responseItem], warnings: [] }) },
            finish_reason: body.model === 'truncated-fixture' ? 'length' : 'stop',
          },
        ],
      }),
    );
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const endpoint = 'http://127.0.0.1:' + server.address().port + '/v1';
  let app;
  try {
    const env = { ...process.env, LINGO_TEST_DATA: directory };
    delete env.ELECTRON_RUN_AS_NODE;
    app = await electron.launch(
      process.argv[2]
        ? { executablePath: path.resolve(process.argv[2]), args: ['--test-hidden'], env }
        : { args: ['.', '--test-hidden'], env },
    );
    const page = await app.firstWindow();
    await page.waitForSelector('h1');
    async function extract(name) {
      const base64 = (await fs.readFile('tests/fixtures/' + name)).toString('base64');
      return page.evaluate((data) => window.desktop.extractDocument(data), { name, base64 });
    }
    const docx = await extract('document.docx');
    assert.ok(docx.text.includes('[DOCUMENT_BODY_FIELD]'));
    assert.equal(docx.images.length, 1);
    const doc = await extract('legacy.doc');
    assert.ok(doc.text.trim().length > 10);
    assert.equal(doc.images.length, 0);
    const corrupt = await page.evaluate(async () => {
      try {
        await window.desktop.extractDocument({ name: 'bad.docx', base64: 'eA==' });
        return false;
      } catch {
        return true;
      }
    });
    assert.equal(corrupt, true);
    await page.getByRole('button', { name: '学习记录与设置', exact: true }).click();
    await page
      .getByRole('navigation', { name: '学习记录与设置' })
      .getByRole('button', { name: '设置与角色', exact: true })
      .click();
    await page.getByLabel('服务基础地址').fill(endpoint);
    await page.getByLabel('对话模型', { exact: true }).fill('text-fixture');
    await page.getByLabel('图片识别模型', { exact: true }).fill('vision-fixture');
    await page.getByRole('button', { name: '保存服务设置' }).click();
    await page.getByRole('button', { name: 'Lingo 首页' }).click();
    await page.getByRole('button', { name: '开始学习', exact: true }).click();

    await page.getByRole('button', { name: '添加题目 / AI出题', exact: true }).click();
    await page.getByLabel('资料类别').selectOption('past-paper');
    await page.getByLabel('选择学习资料').setInputFiles('tests/fixtures/document.docx');
    await page.getByRole('button', { name: '读取资料', exact: true }).click();
    await page.getByText(/查看本批资料：/).click();
    assert.ok(
      (await page.getByLabel('识别前的文字（可修正）').inputValue()).includes(
        '[DOCUMENT_BODY_FIELD]',
      ),
    );
    await page.getByRole('button', { name: '发送给 AI 提取' }).click();
    assert.equal(await page.getByLabel('核对真题年份',{exact:true}).inputValue(),'2010');
    assert.equal(await page.getByLabel('核对试卷名称',{exact:true}).inputValue(),'[PAPER_FIELD]');
    assert.equal(await page.getByLabel('核对原始出处',{exact:true}).inputValue(),'[REFERENCE_FIELD]');
    await page.getByLabel('我已核对原文、题目和答案，确认加入自己的题库').check();
    await page.getByRole('button', { name: '确认入库并开始' }).click();
    await page.waitForSelector('.reading-header');
    assert.ok((await page.locator('.reading-header').textContent()).includes('历年真题'));
    assert.ok((await page.locator('.reading-header').textContent()).includes('来源待核实'));
    assert.equal(received[0].model, 'vision-fixture');
    assert.equal(Object.hasOwn(received[0], 'max_tokens'), false);
    assert.equal(Object.hasOwn(received[0], 'max_completion_tokens'), false);
    const before = received.length;
    const tooMany = await page.evaluate(async (endpoint) => {
      try {
        await window.desktop.ai({
          endpoint,
          model: 'vision-fixture',
          prompt: '[LIMIT_FIELD]',
          images: Array(21).fill('data:image/jpeg;base64,eA=='),
          materialFormat: 'pdf',
          task: 'bank-import',
        });
        return false;
      } catch {
        return true;
      }
    }, endpoint);
    assert.equal(tooMany, true);
    assert.equal(received.length, before);
    assert.ok(
      received[0].messages[1].content.some(
        (v) => v.type === 'image_url' && v.image_url.url.startsWith('data:image/jpeg;base64,'),
      ),
    );
    await page.getByText('查看原资料与来源（可能含答案）', { exact: true }).click();
    assert.equal(await page.locator('.original-pages img').count(), 1);
    const requestsBeforeDuplicate=received.length;
    await page.getByRole('button',{name:'选择题目',exact:true}).first().click();
    await page.getByRole('button',{name:'添加题目 / AI出题',exact:true}).click();
    await page.getByLabel('选择学习资料').setInputFiles({
      name:'renamed.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer:await fs.readFile('tests/fixtures/document.docx'),
    });
    await page.getByRole('button',{name:'读取资料',exact:true}).click();
    await page.getByLabel('重复资料提醒').waitFor();
    assert.equal(received.length,requestsBeforeDuplicate);
    await page.getByRole('button',{name:'打开已有内容',exact:true}).click();
    await page.waitForSelector('.reading-header');

    await page.getByRole('button', { name: '选择题目', exact: true }).first().click();
    await page.getByRole('button', { name: '添加题目 / AI出题', exact: true }).click();
    await page.getByLabel('选择学习资料').setInputFiles('tests/fixtures/text.pdf');
    await page.getByLabel('PDF页码范围').fill('2');
    await page.getByRole('button', { name: '读取资料', exact: true }).click();
    await page.getByText(/已读取 .*1 张图片/).waitFor({ timeout: 20000 });
    await page.getByText(/查看本批资料：/).click();
    assert.ok(
      (await page.getByLabel('识别前的文字（可修正）').inputValue()).includes(
        '[DOCUMENT_BODY_FIELD] PAGE 2',
      ),
    );
    await page.getByLabel('同时识别本批图片', { exact: false }).uncheck();
    await page.getByRole('button', { name: '发送给 AI 提取' }).click();
    await page.getByRole('button', { name: '返回资料', exact: true }).click();
    assert.equal(received[1].model, 'text-fixture');
    assert.equal(Object.hasOwn(received[1], 'max_tokens'), false);
    assert.equal(Object.hasOwn(received[1], 'max_completion_tokens'), false);
    assert.equal(typeof received[1].messages[1].content, 'string');
    await page.getByLabel('选择学习资料').setInputFiles('tests/fixtures/scanned.pdf');
    await page.getByLabel('PDF页码范围').fill('1-2');
    await page.getByRole('button', { name: '读取资料', exact: true }).click();
    await page
      .getByText('此PDF文字层很少，AI将主要识别页面图片；请使用支持图片的模型。')
      .waitFor({ timeout: 20000 });
    await page.getByRole('button', { name: '发送给 AI 提取' }).click();
    await page.getByRole('alert').filter({ hasText: '没有可用文字' }).waitFor();
    const cancelled = page.evaluate(async (endpoint) => {
      try {
        await window.desktop.ai({
          endpoint,
          model: 'cancel-fixture',
          prompt: '[CANCEL_FIELD]',
          task: 'bank-import',
          requestId: 'cancel-test',
        });
        return false;
      } catch (e) {
        return e.message.includes('取消');
      }
    }, endpoint);
    for (let i = 0; i < 30 && !received.some((r) => r.model === 'cancel-fixture'); i++)
      await new Promise((r) => setTimeout(r, 100));
    assert.ok(received.some((r) => r.model === 'cancel-fixture'));
    await page.evaluate(() => window.desktop.cancelAi('cancel-test'));
    assert.equal(await cancelled, true);
    const truncated = await page.evaluate(async (endpoint) => {
      try {
        await window.desktop.ai({
          endpoint,
          model: 'truncated-fixture',
          prompt: '[TRUNCATED_FIELD]',
          task: 'bank-import',
        });
        return false;
      } catch (e) {
        return e.message.includes('截断');
      }
    }, endpoint);
    assert.equal(truncated, true);
    // PDF page images have a separate 20-page allowance, including the real IPC path.
    await page.getByLabel('选择学习资料').setInputFiles('tests/fixtures/long.pdf');
    await page.getByLabel('PDF页码范围').fill('1-21');
    await page.getByRole('button', { name: '读取资料', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: '20页' }).waitFor();
    await page.getByLabel('PDF页码范围').fill('');
    await page.getByRole('button', { name: '读取资料', exact: true }).click();
    await page.getByText(/已读取 .*20 张图片/).waitFor({ timeout: 30000 });
    await page.getByText('该PDF共21页，本批只读取前20页；其余页请填写页码后继续导入。').waitFor();
    await page.getByText(/查看本批资料：/).click();
    const pdfText = await page.getByLabel('识别前的文字（可修正）').inputValue();
    assert.ok(pdfText.includes('[DOCUMENT_BODY_FIELD] PAGE 20'));
    assert.ok(!pdfText.includes('[DOCUMENT_BODY_FIELD] PAGE 21'));
    await page.getByLabel('同时识别本批图片', { exact: false }).check();
    await page.getByRole('button', { name: '发送给 AI 提取' }).click();
    await page.getByLabel('我已核对原文、题目和答案，确认加入自己的题库').check();
    const pdfRequest = received.at(-1);
    assert.equal(pdfRequest.messages[1].content.filter((v) => v.type === 'image_url').length, 20);
    assert.equal(Object.hasOwn(pdfRequest, 'max_tokens'), false);
    assert.equal(Object.hasOwn(pdfRequest, 'max_completion_tokens'), false);
    await page.getByRole('button', { name: '确认入库并开始' }).click();
    await page.getByText('查看原资料与来源（可能含答案）', { exact: true }).click();
    assert.equal(await page.locator('.original-pages img').count(), 20);
    const photosRejected = await page.evaluate(async (endpoint) => {
      try {
        await window.desktop.ai({
          endpoint, model: 'vision-fixture', prompt: '[LIMIT_FIELD]',
          images: Array(7).fill('data:image/jpeg;base64,eA=='),
          materialFormat: 'image', task: 'bank-import',
        });
        return false;
      } catch {
        return true;
      }
    }, endpoint);
    assert.equal(photosRejected, true);
    await page.getByRole('button', { name: '选择题目', exact: true }).first().click();
    await page.getByRole('button', { name: '添加题目 / AI出题', exact: true }).click();
    await page.getByLabel('资料类别').selectOption('past-paper');
    await page.getByLabel('选择学习资料').setInputFiles('tests/fixtures/dense.pdf');
    await page.getByRole('button', { name: '读取资料', exact: true }).click();
    await page.getByText(/已读取 .*12 张图片/).waitFor({ timeout: 30000 });
    await page.getByText(/查看本批资料：/).click();
    const denseText = await page.getByLabel('识别前的文字（可修正）').inputValue();
    assert.ok(denseText.length > 50000);
    assert.ok(denseText.includes('PAGE 12 LINE 69'));
    await page.getByLabel('同时识别本批图片', { exact: false }).uncheck();
    await page.getByRole('button', { name: '发送给 AI 提取' }).click();
    await page.getByLabel('我已核对原文、题目和答案，确认加入自己的题库').check();
    for (const label of ['核对真题年份','核对试卷名称','核对原始出处']) assert.equal(await page.getByLabel(label,{exact:true}).inputValue(),'');
    const denseRequest = received.at(-1);
    assert.equal(typeof denseRequest.messages[1].content, 'string');
    assert.ok(denseRequest.messages[1].content.length > 50000);
    assert.equal(Object.hasOwn(denseRequest, 'max_tokens'), false);
    await page.getByRole('button', { name: '确认入库并开始' }).click();
    await page.getByText('查看原资料与来源（可能含答案）', { exact: true }).click();
    assert.equal(await page.locator('.original-pages img').count(), 12);
    assert.ok((await page.locator('.source-meta').textContent()).includes('年份：待核实'));
    assert.equal(await page.evaluate(() => window.desktop.nativeWindowControls), true);
    assert.equal(await page.evaluate(() => navigator.windowControlsOverlay?.visible), true);
    console.log(
      'Document smoke: PASS (native DOC/DOCX + images, corrupt file, file:// PDF text/scan + local worker, vision IPC, text-only model, preview/save, renamed DOCX duplicate detection without another AI request, optional source fields with AI-filled and unknown metadata, 20-page PDF read/send/save, dense 12-page PDF >50K chars through IPC, native caption overlay, 21-page/7-photo rejection, cancellation, truncated response)',
    );
  } finally {
    if (app) await app.close();
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    await fs.rm(directory, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
