const { _electron: electron } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
(async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'lingo-smoke-'));
  const received = [];
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks), bytes = raw.length;
    received.push({
      url: req.url,
      authorized: req.headers.authorization === 'Bearer mock-only-key',
      bytes,
      body: req.url.endsWith('/chat/completions') ? JSON.parse(raw.toString()) : null,
    });
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify(
        req.url.endsWith('/audio/transcriptions')
          ? { text: 'Small steps bring real progress.' }
          : { choices: [{ message: { content: '连接成功，继续练习。' } }] },
      ),
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
    await fs.mkdir('test-results', { recursive: true });
    assert.equal(await page.evaluate(() => window.desktop?.isDesktop), true);
    assert.equal(await page.evaluate(() => window.desktop?.nativeWindowControls), true);
    assert.equal(await page.evaluate(() => navigator.windowControlsOverlay?.visible), true);
    assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
    assert.equal(await page.evaluate(() => window.desktop.hasKey()), false);
    await page.evaluate(() => window.desktop.saveKey('mock-only-key'));
    assert.equal(await page.evaluate(() => window.desktop.hasKey()), true);
    const encrypted = await fs.readFile(path.join(directory, 'service-key.bin'));
    assert.equal(encrypted.includes(Buffer.from('mock-only-key')), false);
    const answer = await page.evaluate(
      (endpoint) => window.desktop.ai({ endpoint, model: 'mock-model', prompt: '测试汇总数据' }),
      endpoint,
    );
    assert.ok(answer.includes('连接成功'));
    const text = await page.evaluate(
      (endpoint) =>
        window.desktop.transcribe({
          endpoint,
          model: 'mock-asr',
          audio: 'UklGRg==',
          mime: 'audio/wav',
        }),
      endpoint,
    );
    assert.equal(text, 'Small steps bring real progress.');
    assert.equal(received.length, 2);
    assert.ok(received.every((r) => r.authorized));
    assert.ok(received[1].bytes > 100);
    assert.equal(received[0].body.max_tokens, undefined);
    assert.equal(received[0].body.max_completion_tokens, undefined);
    const invalid = await page.evaluate(async () => {
      try {
        await window.desktop.ai({ endpoint: 'file:///C:/Windows', model: 'test', prompt: 'test' });
        return false;
      } catch {
        return true;
      }
    });
    assert.equal(invalid, true);
    await page.waitForSelector('.vrm-avatar[data-ready="true"]', { timeout: 30000 });
    assert.equal(await page.locator('.vrm-avatar canvas').count(), 1);
    const companionPosition = await page.locator('.companion-floating').boundingBox();
    await page.locator('.vrm-avatar').evaluate((element) => { element.dataset.instance = 'desktop-persistent'; });
    const arms = JSON.parse(await page.locator('.vrm-avatar').getAttribute('data-rest-arms'));
    assert.ok(arms.left < -0.02 && arms.right < -0.02);
    await page.getByRole('button', { name: '向角色打招呼' }).click();
    assert.ok((await page.locator('.companion-line').textContent()).includes('嗨，我一直在'));
    const stageBefore = await page.locator('.companion-stage').boundingBox();
    await page.waitForTimeout(6500);
    assert.equal(await page.locator('.companion-line').count(), 0);
    assert.deepEqual(await page.locator('.companion-stage').boundingBox(), stageBefore);
    await page.mouse.move(20, 200);
    await page.waitForFunction(() => Number(document.querySelector('.vrm-avatar').dataset.gaze.split(',')[0]) < -0.12);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => document.querySelector('.vrm-avatar').dataset.tracking === 'false');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.getByRole('button', { name: '开始学习', exact: true }).click();

    await page.waitForSelector('.library-count');
    assert.equal(await page.locator('.vrm-avatar').getAttribute('data-instance'), 'desktop-persistent');
    assert.deepEqual(await page.locator('.companion-floating').boundingBox(), companionPosition);
    assert.ok((await page.locator('.library-count').textContent()).includes('共 0 篇内容'));
    await page.getByRole('button', { name: '学习记录与设置', exact: true }).click();
    await page
      .getByRole('navigation', { name: '学习记录与设置' })
      .getByRole('button', { name: '设置与角色', exact: true })
      .click();
    assert.equal(await page.locator('.vrm-avatar canvas').count(), 1);
    assert.equal(await page.locator('.vrm-avatar').getAttribute('data-instance'), 'desktop-persistent');
    await page.getByLabel('服务基础地址').fill(endpoint);
    await page.getByLabel('对话模型', { exact: true }).fill('deepseek-flash');
    await page.getByRole('button', { name: '保存服务设置' }).click();
    await page.getByRole('button', { name: 'Lingo 首页' }).click();
    await page.getByRole('button', { name: '问陪练', exact: true }).click();
    await page.getByLabel('问陪练的问题').fill('[USER_QUESTION_FIELD]');
    await page.getByRole('button', { name: '发送问题', exact: true }).click();
    await page.waitForFunction(() =>
      document.querySelector('.companion-line')?.textContent.includes('连接成功'),
    );
    assert.equal(received.length, 3);
    assert.equal(received[2].body.model, 'deepseek-flash');
    assert.ok(received[2].body.messages.some(m => m.content.includes('情绪支持、鼓励、温和监督和学习答疑')));
    assert.equal(received[2].body.max_tokens, undefined);
    assert.equal(received[2].body.max_completion_tokens, undefined);
    assert.ok((await page.getByLabel('陪练完整回答').textContent()).includes('连接成功'));
    await page.getByRole('button', { name: '收起陪练气泡' }).click();
    assert.ok((await page.getByLabel('陪练完整回答').textContent()).includes('连接成功'));
    await page.getByRole('button', { name: '学习记录与设置', exact: true }).click();
    await page
      .getByRole('navigation', { name: '学习记录与设置' })
      .getByRole('button', { name: '设置与角色', exact: true })
      .click();
    await page.getByLabel('陪练名字').fill('本地持久化检查');
    await page.waitForTimeout(250);
    await page.reload();
    await page.getByRole('button', { name: '学习记录与设置', exact: true }).click();
    await page
      .getByRole('navigation', { name: '学习记录与设置' })
      .getByRole('button', { name: '设置与角色', exact: true })
      .click();
    assert.equal(await page.getByLabel('陪练名字').inputValue(), '本地持久化检查');
    await page.getByRole('button', { name: 'Lingo 首页' }).click();
    await page.getByRole('button', { name: '问陪练', exact: true }).click();
    assert.ok((await page.getByLabel('陪练完整回答').textContent()).includes('连接成功'));
    await page.evaluate(() => window.desktop.saveKey(''));
    assert.equal(await page.evaluate(() => window.desktop.hasKey()), false);
    await fs.mkdir('test-results', { recursive: true });
    await page.getByRole('button', { name: '专注陪学', exact: true }).click();
    await page.getByLabel('本轮陪学目标').selectOption('15');
    await page.getByRole('button', { name: '开始陪学', exact: true }).click();
    await page.getByRole('button', { name: '学习记录与设置', exact: true }).click();
    await page.getByRole('navigation', { name: '学习记录与设置' }).getByRole('button', { name: '设置与角色', exact: true }).click();
    await page.getByLabel('陪练名字').fill('原生关闭前保存检查');
    const closed = app.waitForEvent('close');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
    await closed;
    app = undefined;
    app = await electron.launch(process.argv[2]
      ? { executablePath: path.resolve(process.argv[2]), args: ['--test-hidden'], env }
      : { args: ['.', '--test-hidden'], env });
    const reopened = await app.firstWindow();
    await reopened.waitForSelector('h1');
    await reopened.getByRole('button', { name: '学习记录与设置', exact: true }).click();
    await reopened.getByRole('navigation', { name: '学习记录与设置' }).getByRole('button', { name: '设置与角色', exact: true }).click();
    assert.equal(await reopened.getByLabel('陪练名字').inputValue(), '原生关闭前保存检查');
    await reopened.getByRole('button', { name: '问陪练', exact: true }).click();
    await reopened.getByRole('button', { name: '专注陪学', exact: true }).click();
    assert.ok(await reopened.getByRole('button', { name: '继续陪学', exact: true }).isVisible());
    assert.ok((await reopened.getByLabel('本轮已陪学时长').textContent()).includes('15 分钟'));
    console.log(
      'Electron smoke: PASS (sandbox, encrypted key, chat, multipart ASR, endpoint validation, goal flow, local 3D model, transient bubbles, fixed persistent avatar, global pointer tracking, DeepSeek-compatible coaching prompt without output token limits, focus-session restart pause, continuous saved AI conversation, IndexedDB restart, native caption controls and native-close storage flush)',
    );
  } finally {
    if (app) await app.close();
    await new Promise((r) => server.close(r));
    await fs.rm(directory, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
