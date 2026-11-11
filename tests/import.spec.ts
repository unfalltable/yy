import { test, expect } from '@playwright/test';
import { defaults } from '../src/types';
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as any;
    w.__requests = [];
    w.__cancelled = [];
    w.__reply = null;
    const q = {
      stem: '[STEM_FIELD]',
      options: ['[OPTION_FIELD_0]', '[OPTION_FIELD_1]'],
      answer: 0,
      answerBasis: 'ai',
      skill: '[SKILL_FIELD]',
      explanation: '[EXPLANATION_FIELD]',
      evidence: '[EVIDENCE_FIELD]',
      hints: ['[HINT_FIELD]'],
    };
    w.desktop = {
      isDesktop: false,
      minimize() {},
      maximize() {},
      close() {},
      hasKey: async () => false,
      cancelAi: async (id: string) => {
        w.__cancelled.push(id);
      },
      ai: async (data: any) => {
        w.__requests.push(data);
        if (w.__reply !== null) return w.__reply;
        const generated = data.prompt.includes('创建个人英语阅读练习');
        return JSON.stringify({
          items: [
            {
              title: '[TITLE_FIELD]',
              kind: 'reading',
              paragraphs: [generated ? '[ADAPTED_DOCUMENT_BODY_FIELD]' : '[DOCUMENT_BODY_FIELD]'],
              sourceLocator: '[PAGE_FIELD]',
              questions: generated
                ? Array.from({ length: 5 }, (_,index) => ({ ...q, stem:'[STEM_FIELD_'+index+']', options: ['A', 'B', 'C', 'D'] }))
                : [q],
            },
          ],
          warnings: [],
        });
      },
    };
  });
  await page.goto('/');
  const settings = {
    ...structuredClone(defaults),
    settings: {
      ...defaults.settings,
      aiEndpoint: 'http://127.0.0.1:9999/v1',
      aiModel: 'text-fixture',
      visionModel: 'vision-fixture',
    },
  };
  await page.evaluate(async (state) => {
    const { set } = await import('/node_modules/.vite/deps/idb-keyval.js');
    await set('lingo-state-v1', state);
  }, settings);
  await page.reload();
  await page.getByRole('button', { name: '开始学习', exact: true }).click();

  await page.getByRole('button', { name: '添加题目 / AI出题', exact: true }).click();
});
test('自购模拟题提取先预览，确认后入私人题库并持久化', async ({ page }) => {
  await page.getByRole('button', { name: '粘贴文章 / 题目' }).click();
  await page.getByLabel('待处理文章').fill('[DOCUMENT_BODY_FIELD]');
  await page.getByRole('button', { name: '读取资料', exact: true }).click();
  await page.getByRole('button', { name: '发送给 AI 提取' }).click();
  await expect(page.getByRole('dialog')).toContainText('答案由 AI 补全');
  const before = await page.evaluate(async () => {
    const { get } = await import('/node_modules/.vite/deps/idb-keyval.js');
    return (await get('lingo-state-v1')).customPassages.length;
  });
  expect(before).toBe(0);
  await expect(page.getByRole('button', { name: '确认入库并开始' })).toBeDisabled();
  await page.getByLabel('我已核对原文、题目和答案，确认加入自己的题库').check();
  await page.getByRole('button', { name: '确认入库并开始' }).click();
  await expect(page.locator('.reading-header')).toContainText('个人练习');
  await page.getByRole('radio').first().click();
  await page.getByRole('button', { name: '确认答案', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('本篇已完成');
  await page.getByRole('button', { name: '回看解析', exact: true }).click();
  await expect(page.locator('.answer-origin')).toContainText('AI');
  await page.reload();
  await page.getByRole('button', { name: '开始学习', exact: true }).click();
  await page.locator('.passage-card').first().click();

  await expect(page.locator('.reading-header')).toContainText('个人练习');
});
test('文章按考试生成5题4选项，标自创，原始资料可查看', async ({ page }) => {
  await page.getByRole('button', { name: '文章 AI 出题', exact: false }).click();
  await expect(page.getByLabel('允许 AI 改写文章以调整难度和篇幅（会明确标记）')).toBeChecked();
  await page.getByRole('button', { name: '粘贴文章 / 题目' }).click();
  await page.getByLabel('待处理文章').fill('[DOCUMENT_BODY_FIELD]');
  await page.getByRole('button', { name: '读取资料', exact: true }).click();
  await page.getByRole('button', { name: '发送给 AI 出题' }).click();
  await expect(page.getByRole('dialog')).toContainText('1篇 · 5题');
  await expect(page.getByLabel('预览原文')).toHaveValue('[ADAPTED_DOCUMENT_BODY_FIELD]');
  await page.getByLabel('我已核对原文、题目和答案，确认加入自己的题库').check();
  await page.getByRole('button', { name: '确认入库并开始' }).click();
  await expect(page.locator('.reading-header')).toContainText('AI 自创');
  await expect(page.getByRole('radio')).toHaveCount(4);
  await page.getByText('查看原资料与来源（可能含答案）', { exact: true }).click();
  await expect(page.locator('.original-material pre')).toHaveText('[DOCUMENT_BODY_FIELD]');
});
test('照片通过图片模型发送，原图入库后可核对', async ({ page }) => {
  await page.getByLabel('选择学习资料').setInputFiles('tests/fixtures/photo.png');
  await page.getByRole('button', { name: '读取资料', exact: true }).click();
  await expect(page.getByText('已读取 0 字符、1 张图片', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '发送给 AI 提取' }).click();
  const sent = await page.evaluate(() => {
    const r = (window as any).__requests[0];
    return { model: r.model, images: r.images.length, mime: r.images[0].slice(0, 23) };
  });
  expect(sent.model).toBe('vision-fixture');
  expect(sent.images).toBe(1);
  expect(sent.mime).toContain('data:image/jpeg');
  await page.getByLabel('我已核对原文、题目和答案，确认加入自己的题库').check();
  await page.getByRole('button', { name: '确认入库并开始' }).click();
  await page.getByText('查看原资料与来源（可能含答案）', { exact: true }).click();
  await expect(page.locator('.original-pages img')).toHaveCount(1);
  await page.waitForTimeout(350);
  await page.reload();
  await page.getByRole('button', { name: '开始学习', exact: true }).click();
  await page.locator('.passage-card').first().click();

  await page.getByText('查看原资料与来源（可能含答案）', { exact: true }).click();
  await expect(page.locator('.original-pages img')).toHaveCount(1);
  expect(
    await page
      .locator('.original-pages img')
      .evaluate(
        (img: HTMLImageElement) =>
          img.src.startsWith('data:image/jpeg') && img.complete && img.naturalWidth > 0,
      ),
  ).toBe(true);
});
test('文字PDF本机读取指定页，扫描PDF保留图像并提示识别', async ({ page }) => {
  await page.getByLabel('选择学习资料').setInputFiles('tests/fixtures/text.pdf');
  await page.getByLabel('PDF页码范围').fill('2');
  await page.getByRole('button', { name: '读取资料', exact: true }).click();
  await expect(page.getByText(/已读取 .*1 张图片/)).toBeVisible({ timeout: 15000 });
  await page.getByText(/查看本批资料：/).click();
  await expect(page.getByLabel('识别前的文字（可修正）')).toContainText(
    '[DOCUMENT_BODY_FIELD] PAGE 2',
  );
  await page.getByLabel('选择学习资料').setInputFiles('tests/fixtures/scanned.pdf');
  await page.getByLabel('PDF页码范围').fill('1-2');
  await page.getByRole('button', { name: '读取资料', exact: true }).click();
  await expect(
    page.getByText('此PDF文字层很少，AI将主要识别页面图片；请使用支持图片的模型。'),
  ).toBeVisible({ timeout: 15000 });
});
test('不确定答案阻止入库，手工修正后才可保存', async ({ page }) => {
  await page.evaluate(() => {
    (window as any).__reply = JSON.stringify({
      items: [
        {
          title: '[TITLE_FIELD]',
          kind: 'reading',
          paragraphs: ['[DOCUMENT_BODY_FIELD]'],
          questions: [
            {
              stem: '[STEM_FIELD]',
              options: ['A', 'B'],
              answer: null,
              answerBasis: 'unconfirmed',
              skill: '[SKILL]',
              explanation: '[EXPLANATION_FIELD]',
              evidence: '',
              hints: [],
            },
          ],
        },
      ],
    });
  });
  await page.getByRole('button', { name: '粘贴文章 / 题目' }).click();
  await page.getByLabel('待处理文章').fill('[DOCUMENT_BODY_FIELD]');
  await page.getByRole('button', { name: '读取资料', exact: true }).click();
  await page.getByRole('button', { name: '发送给 AI 提取' }).click();
  await expect(page.getByRole('alert')).toContainText('答案待确认');
  await page.getByLabel('正确答案 1', { exact: true }).selectOption('0');
  await page.getByLabel('我已核对原文、题目和答案，确认加入自己的题库').check();
  await page.getByRole('button', { name: '确认入库并开始' }).click();
  await expect(page.locator('.question-body h2')).toHaveText('[STEM_FIELD]');
});
test('AI无效输出不落库；纯文章可离线精读，删除后清理资料', async ({ page }) => {
  await page.evaluate(() => {
    (window as any).__reply = '[INVALID_OUTPUT]';
  });
  await page.getByRole('button', { name: '粘贴文章 / 题目' }).click();
  await page.getByLabel('待处理文章').fill('[DOCUMENT_BODY_FIELD]');
  await page.getByRole('button', { name: '读取资料', exact: true }).click();
  await page.getByRole('button', { name: '发送给 AI 提取' }).click();
  await expect(page.getByRole('alert')).toContainText('完整 JSON');
  await page.getByRole('button', { name: '先保存为精读文章' }).click();
  await page.getByLabel('我已核对原文、题目和答案，确认加入自己的题库').check();
  await page.getByRole('button', { name: '确认入库并开始' }).click();
  await expect(page.getByRole('button', { name: '用这篇文章出题' })).toBeVisible();
  await openBank(page);
  await page.getByRole('button', { name: '删除 粘贴的学习资料', exact: true }).click();
  await page.getByRole('button', { name: '删除此篇内容', exact: true }).click();
  await expect(page.locator('.library-count')).toContainText('共 0 篇内容');
});
test('导入窗口桌面与窄屏布局截图无横向溢出', async ({ page }) => {
  await page.screenshot({ path: 'test-results/personal-import.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('超量照片、文件、文字和PDF页数均在AI调用前被拦截，长PDF仅按批读取', async ({ page }) => {
  test.setTimeout(60000);
  await page.getByLabel('选择学习资料').setInputFiles(Array(7).fill('tests/fixtures/photo.png'));
  await page.getByRole('button', { name: '读取资料', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('6张');
  await page
    .getByLabel('选择学习资料')
    .setInputFiles({
      name: 'oversize.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.alloc(20000001),
    });
  await page.getByRole('button', { name: '读取资料', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('20 MB');
  await page.getByRole('button', { name: '粘贴文章 / 题目' }).click();
  await page.getByLabel('待处理文章').fill('x'.repeat(100001));
  await page.getByRole('button', { name: '读取资料', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('10万');
  await page.getByRole('button', { name: '上传文件', exact: true }).click();
  await page.getByLabel('选择学习资料').setInputFiles('tests/fixtures/long.pdf');
  await page.getByLabel('PDF页码范围').fill('1-21');
  await page.getByRole('button', { name: '读取资料', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('20页');
  await page.getByLabel('PDF页码范围').fill('');
  await page.getByRole('button', { name: '读取资料', exact: true }).click();
  await expect(
    page.getByText('该PDF共21页，本批只读取前20页；其余页请填写页码后继续导入。'),
  ).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/已读取 .*20 张图片/)).toBeVisible();
  expect(await page.evaluate(() => (window as any).__requests.length)).toBe(0);
  await page.getByText(/查看本批资料：/).click();
  const text = await page.getByLabel('识别前的文字（可修正）').inputValue();
  expect(text).toContain('[DOCUMENT_BODY_FIELD] PAGE 20');
  expect(text).not.toContain('[DOCUMENT_BODY_FIELD] PAGE 21');
  await page.getByRole('button', { name: '发送给 AI 提取' }).click();
  const sent = await page.evaluate(() => (window as any).__requests[0]);
  expect(sent.images).toHaveLength(20);
  expect(sent.materialFormat).toBe('pdf');
  await page.getByLabel('我已核对原文、题目和答案，确认加入自己的题库').check();
  await page.getByRole('button', { name: '确认入库并开始' }).click();
  await page.getByText('查看原资料与来源（可能含答案）', { exact: true }).click();
  await expect(page.locator('.original-pages img')).toHaveCount(20);
  await expect.poll(() => page.evaluate(async () => {
    const { get } = await import('/node_modules/.vite/deps/idb-keyval.js');
    return (await get('lingo-state-v1')).materials[0]?.images.length;
  })).toBe(20);
  await page.reload();
  await expect(page.getByRole('button', { name: '开始学习', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '开始学习', exact: true }).click();
  await page.locator('.passage-card').first().click();

  await page.getByText('查看原资料与来源（可能含答案）', { exact: true }).click();
  await expect(page.locator('.original-pages img')).toHaveCount(20);
});

test('12页密集PDF超过旧2万字符仍可读取、发送和保存，失败状态不再假装读取中', async ({ page }) => {
  test.setTimeout(90000);
  await page.getByLabel('选择学习资料').setInputFiles('tests/fixtures/dense.pdf');
  await page.getByRole('button', { name: '读取资料', exact: true }).click();
  await expect(page.getByText(/已读取 .*12 张图片/)).toBeVisible({ timeout: 30000 });
  await page.getByText(/查看本批资料：/).click();
  const source = await page.getByLabel('识别前的文字（可修正）').inputValue();
  expect(source.length).toBeGreaterThan(50000);
  expect(source).toContain('PAGE 12 LINE 69');
  await page.getByLabel('同时识别本批图片', { exact: false }).uncheck();
  await page.getByRole('button', { name: '发送给 AI 提取' }).click();
  const sent = await page.evaluate(() => (window as any).__requests.at(-1));
  expect(sent.prompt.length).toBeGreaterThan(50000);
  expect(sent.prompt).toContain('PAGE 12 LINE 69');
  await expect(page.locator('.import-status')).toContainText('AI整理完成');
  await page.getByLabel('我已核对原文、题目和答案，确认加入自己的题库').check();
  await page.getByRole('button', { name: '确认入库并开始' }).click();
  await page.getByText('查看原资料与来源（可能含答案）', { exact: true }).click();
  await expect(page.locator('.original-pages img')).toHaveCount(12);
  await expect.poll(() => page.evaluate(async () => {
    const { get } = await import('/node_modules/.vite/deps/idb-keyval.js');
    return (await get('lingo-state-v1')).materials[0]?.text.length;
  })).toBe(source.length);
  await openBank(page);
  await page.getByRole('button', { name: '添加题目 / AI出题', exact: true }).click();
  await page.getByRole('button', { name: '粘贴文章 / 题目' }).click();
  await page.getByLabel('待处理文章').fill('x'.repeat(100001));
  await page.getByRole('button', { name: '读取资料', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('10万');
  await expect(page.locator('.import-status')).toContainText('读取未完成');
  await expect(page.locator('.import-status')).not.toContainText('正在读取');
  expect(await page.evaluate(() => (window as any).__requests.length)).toBe(1);
});

test('真题来源三项留空也能入库，未知标记与原资料在重启后保留', async ({page}) => {
  await page.getByLabel('资料类别').selectOption('past-paper');
  for (const label of ['真题年份','原始试卷名称','原始出处']) {
    await expect(page.getByLabel(label,{exact:true})).toHaveValue('');
    await expect(page.getByLabel(label,{exact:true})).not.toHaveAttribute('required',/.*/);
  }
  await page.getByRole('button',{name:'粘贴文章 / 题目'}).click();
  await page.getByLabel('待处理文章').fill('[DOCUMENT_BODY_FIELD]');
  await page.getByRole('button',{name:'读取资料',exact:true}).click();
  await page.getByRole('button',{name:'发送给 AI 提取'}).click();
  for(const label of ['核对真题年份','核对试卷名称','核对原始出处'])
    await expect(page.getByLabel(label,{exact:true})).toHaveValue('');
  await page.getByLabel('我已核对原文、题目和答案，确认加入自己的题库').check();
  await expect(page.getByRole('button',{name:'确认入库并开始'})).toBeEnabled();
  await page.getByRole('button',{name:'确认入库并开始'}).click();
  await expect(page.locator('.reading-header')).toContainText('来源待核实');
  await page.getByText('查看原资料与来源（可能含答案）',{exact:true}).click();
  await expect(page.locator('.source-meta')).toContainText('年份：待核实');
  await expect(page.locator('.original-material pre')).toHaveText('[DOCUMENT_BODY_FIELD]');
  await page.waitForTimeout(400);
  await page.reload();
  await page.getByRole('button',{name:'开始学习',exact:true}).click();
  await page.locator('.passage-card').first().click();

  await expect(page.locator('.reading-header')).toContainText('来源待核实');
  const saved=await page.evaluate(async()=>{const {get}=await import('/node_modules/.vite/deps/idb-keyval.js');return (await get('lingo-state-v1')).customPassages[0];});
  expect(saved.year).toBe('');
  expect(saved.provenance.metadata).toMatchObject({year:'unknown',paper:'unknown',reference:'unknown'});
  expect(await page.evaluate(()=>(window as any).__requests.length)).toBe(0);
});
test('AI来源信息按篇回填，可手动修改或清空；不会自动增加AI调用',async({page})=>{
  await page.evaluate(()=>{
    const q={stem:'[STEM_FIELD]',options:['A','B'],answer:0,answerBasis:'ai',skill:'[SKILL]',explanation:'[EXPLANATION_FIELD]',evidence:'[EVIDENCE_FIELD]',hints:['[HINT]']};
    (window as any).__reply=JSON.stringify({items:[2010,2011].map(year=>({
      title:'[TITLE_'+year+']',kind:'reading',paragraphs:['[DOCUMENT_BODY_'+year+']'],sourceLocator:'[PAGE]',
      metadata:{year:String(year),paper:'[PAPER_'+year+']',reference:'[REF_'+year+']',evidence:'[HEADER_FIELD]'},
      questions:[q],
    }))});
  });
  await page.getByLabel('资料类别').selectOption('past-paper');
  await page.getByRole('button',{name:'粘贴文章 / 题目'}).click();
  await page.getByLabel('待处理文章').fill('[DOCUMENT_BODY_FIELD]');
  await page.getByRole('button',{name:'读取资料',exact:true}).click();
  await page.getByRole('button',{name:'发送给 AI 提取'}).click();
  await expect(page.getByLabel('核对真题年份',{exact:true})).toHaveValue('2010');
  await expect(page.getByLabel('核对试卷名称',{exact:true})).toHaveValue('[PAPER_2010]');
  await expect(page.getByLabel('核对原始出处',{exact:true})).toHaveValue('[REF_2010]');
  await expect(page.getByRole('dialog')).toContainText('AI识别，待核实');
  await page.getByLabel('核对真题年份',{exact:true}).fill('2024');
  await page.getByLabel('核对试卷名称',{exact:true}).fill('[USER_PAPER]');
  await page.getByRole('navigation',{name:'待入库篇目'}).getByRole('button').nth(1).click();
  await expect(page.getByLabel('核对真题年份',{exact:true})).toHaveValue('2011');
  await page.getByLabel('核对原始出处',{exact:true}).fill('');
  await page.getByLabel('我已核对原文、题目和答案，确认加入自己的题库').check();
  await page.screenshot({path:'test-results/import-optional-metadata-051.png'});
  await page.getByRole('button',{name:'确认入库并开始'}).click();
  await page.waitForTimeout(400);
  const saved=await page.evaluate(async()=>{const {get}=await import('/node_modules/.vite/deps/idb-keyval.js');return (await get('lingo-state-v1')).customPassages;});
  expect(saved.map((p:any)=>p.year)).toEqual(['2024','2011']);
  expect(saved[0].provenance.paper).toBe('[USER_PAPER]');
  expect(saved[0].provenance.metadata).toMatchObject({year:'user',paper:'user',reference:'ai'});
  expect(saved[1].provenance.metadata.reference).toBe('unknown');
  expect(saved[1].source).toContain('原始出处待核实');
  expect(await page.evaluate(()=>(window as any).__requests.length)).toBe(1);
});

async function uploadAndSave(page:import('@playwright/test').Page, name='duplicate.txt', body='[RAW_FILE_FIELD]') {
  await page.getByLabel('选择学习资料').setInputFiles({name,mimeType:'text/plain',buffer:Buffer.from(body)});
  await page.getByRole('button',{name:'读取资料',exact:true}).click();
  await page.getByRole('button',{name:'发送给 AI 提取',exact:true}).click();
  await page.getByLabel('我已核对原文、题目和答案，确认加入自己的题库').check();
  await page.getByRole('button',{name:'确认入库并开始',exact:true}).click();
  await expect(page.locator('.reading-header')).toBeVisible();
}
async function openBank(page:import('@playwright/test').Page) {
  await page.getByRole('button',{name:'Lingo 首页',exact:true}).click();
  await page.getByRole('button',{name:'开始学习',exact:true}).click();
}
async function reopenImporter(page:import('@playwright/test').Page) {
  await openBank(page);
  await page.getByRole('button',{name:'添加题目 / AI出题',exact:true}).click();
}
async function savedBank(page:import('@playwright/test').Page) {
  await page.waitForTimeout(400);
  return page.evaluate(async()=>{const {get}=await import('/node_modules/.vite/deps/idb-keyval.js');return await get('lingo-state-v1');});
}
test('相同文件改名后提示已有内容，不再调用AI；重启后仍识别',async({page})=>{
  await uploadAndSave(page);
  await reopenImporter(page);
  await page.getByLabel('选择学习资料').setInputFiles({name:'renamed.txt',mimeType:'text/plain',buffer:Buffer.from('[RAW_FILE_FIELD]')});
  await page.getByRole('button',{name:'读取资料',exact:true}).click();
  await expect(page.getByLabel('重复资料提醒')).toContainText('这批资料已入库');
  expect(await page.evaluate(()=>(window as any).__requests.length)).toBe(1);
  await page.getByRole('button',{name:'打开已有内容',exact:true}).click();
  let saved=await savedBank(page);
  expect(saved.customPassages).toHaveLength(1);expect(saved.materials).toHaveLength(1);
  const id=saved.customPassages[0].id;
  await page.reload();
  await page.getByRole('button',{name:'开始学习',exact:true}).click();

  await reopenImporter(page);
  await page.getByLabel('选择学习资料').setInputFiles({name:'duplicate.txt',mimeType:'text/plain',buffer:Buffer.from('[RAW_FILE_FIELD]')});
  await page.getByRole('button',{name:'读取资料',exact:true}).click();
  await expect(page.getByLabel('重复资料提醒')).toBeVisible();
  expect(await page.evaluate(()=>(window as any).__requests.length)).toBe(0);
  await page.getByRole('button',{name:'打开已有内容',exact:true}).click();
  saved=await savedBank(page);expect(saved.customPassages[0].id).toBe(id);
});
test('主动重新解析仍跳过重复题，原答题草稿、笔记与资料不变',async({page})=>{
  await uploadAndSave(page);
  await page.getByRole('radio').nth(1).click();
  const before=await savedBank(page), id=before.customPassages[0].id;
  await page.evaluate(async(id)=>{
    const {get,set}=await import('/node_modules/.vite/deps/idb-keyval.js');
    const s=await get('lingo-state-v1');
    s.notes=[{id:'kept-note',passageId:id,quote:'[QUOTE]',body:'[KEPT_NOTE]',at:new Date().toISOString()}];
    await set('lingo-state-v1',s);
  },id);
  await page.reload();
  await page.getByRole('button',{name:'开始学习',exact:true}).click();

  await reopenImporter(page);
  await page.getByLabel('选择学习资料').setInputFiles({name:'renamed.txt',mimeType:'text/plain',buffer:Buffer.from('[RAW_FILE_FIELD]')});
  await page.getByRole('button',{name:'读取资料',exact:true}).click();
  await page.getByRole('button',{name:'重新解析并去重',exact:true}).click();
  await expect(page.getByLabel('入库去重结果')).toContainText('跳过 1 道重复题');
  await page.getByLabel('我已核对原文、题目和答案，确认加入自己的题库').check();
  await page.getByRole('button',{name:'确认入库并开始',exact:true}).click();
  await expect(page.getByRole('radio').nth(1)).toBeChecked();
  const saved=await savedBank(page);
  expect(saved.customPassages).toHaveLength(1);expect(saved.materials).toHaveLength(1);
  expect(saved.customPassages[0].id).toBe(id);
  expect(saved.customPassages[0].questions[0].id).toBe(before.customPassages[0].questions[0].id);
  expect(saved.notes[0].body).toBe('[KEPT_NOTE]');
  expect(await page.evaluate(()=>(window as any).__requests.length)).toBe(1);
});
test('新文件含旧题和同批重复题时，只保存新增题目',async({page})=>{
  await uploadAndSave(page);
  const before=await savedBank(page);
  await reopenImporter(page);
  await page.evaluate(()=>{
    const q={stem:'[STEM_FIELD]',options:['[OPTION_FIELD_0]','[OPTION_FIELD_1]'],answer:0,answerBasis:'ai',explanation:'[EXPLANATION_FIELD]',evidence:'[EVIDENCE_FIELD]',hints:['[HINT]']};
    (window as any).__reply=JSON.stringify({items:[{title:'[NEW_TITLE]',kind:'reading',paragraphs:['[DOCUMENT_BODY_FIELD]'],questions:[q,{...q,stem:'[NEW_STEM_FIELD]'},{...q,stem:'[NEW_STEM_FIELD]'}]}]});
  });
  await page.getByLabel('选择学习资料').setInputFiles({name:'extended.txt',mimeType:'text/plain',buffer:Buffer.from('[EXTENDED_RAW_FILE_FIELD]')});
  await page.getByRole('button',{name:'读取资料',exact:true}).click();
  await page.getByRole('button',{name:'发送给 AI 提取',exact:true}).click();
  await expect(page.getByLabel('入库去重结果')).toContainText('将新增 1 篇、1 题；跳过 2 道重复题');
  await page.getByLabel('我已核对原文、题目和答案，确认加入自己的题库').check();
  await page.getByRole('button',{name:'确认入库并开始',exact:true}).click();
  await expect(page.locator('.question-body h2')).toHaveText('[NEW_STEM_FIELD]');
  const saved=await savedBank(page);
  expect(saved.customPassages).toHaveLength(2);
  expect(saved.customPassages.reduce((n:number,p:any)=>n+p.questions.length,0)).toBe(2);
  expect(saved.customPassages[0]).toEqual(before.customPassages[0]);
  expect(saved.materials).toHaveLength(2);
});
