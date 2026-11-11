import { test, expect, type Page } from '@playwright/test';

async function writing(page: Page) {
  await page.getByRole('button', { name: '开始学习', exact: true }).click();

  await page.getByRole('navigation', { name: '学习方式' }).getByRole('button', { name: '写作', exact: true }).click();
}

test('气泡自动收起，悬停或键盘阅读暂停，连续招呼重新计时', async ({ page }) => {
  test.setTimeout(60000);
  await page.goto('/');
  const bubble = page.locator('.companion-line');
  await expect(bubble).toContainText('准备好了就出发吧');
  const stage = await page.locator('.companion-stage').boundingBox();
  await page.waitForTimeout(6500);
  await expect(bubble).toHaveCount(0);
  expect(await page.locator('.companion-stage').boundingBox()).toEqual(stage);
  await page.getByRole('button', { name: '向角色打招呼' }).click();
  await expect(bubble).toContainText('嗨，我一直在');
  await page.waitForTimeout(4000);
  await page.getByRole('button', { name: '向角色打招呼' }).click();
  await page.waitForTimeout(3000);
  await expect(bubble).toBeVisible();
  await bubble.hover();
  await page.waitForTimeout(7000);
  await expect(bubble).toBeVisible();
  await page.mouse.move(10, 10);
  await page.getByRole('button', { name: '收起陪练气泡' }).focus();
  await page.waitForTimeout(7000);
  await expect(bubble).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(bubble).toHaveCount(0);
  await page.getByRole('button', { name: '向角色打招呼' }).click();
  await page.waitForTimeout(6500);
  await expect(bubble).toHaveCount(0);
  // Action completion must never resurrect an idle bubble.
  await page.waitForTimeout(7000);
  await expect(bubble).toHaveCount(0);
});

test('写作气泡横排可读，按钮不挤压，气泡隐藏不移动角色', async ({ page }) => {
  await page.goto('/');
  await writing(page);
  for (const width of [1480, 1000, 390]) {
    await page.setViewportSize({ width, height: 960 });
    await page.getByRole('button', { name: '向角色打招呼' }).click();
    const bubble = page.locator('.companion-line');
    const box = await bubble.boundingBox();
    expect(box!.width).toBeGreaterThan(240);
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    const buttons = await page.locator('.companion-actions button').evaluateAll((buttons) =>
      buttons.map((button) => ({ width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height })));
    expect(buttons.every((button) => button.width >= 70 && button.height <= 48)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const avatar = await page.locator('.vrm-avatar').boundingBox();
    if (width === 1480) await page.screenshot({ path: 'test-results/companion-writing-bubble.png', fullPage: true });
    await page.getByRole('button', { name: '收起陪练气泡' }).click();
    expect(await page.locator('.vrm-avatar').boundingBox()).toEqual(avatar);
  }
});

test('窗口内远处鼠标驱动头部与身体，移出回正，减少动态和设置开关生效', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await writing(page);
  const avatar = page.locator('.vrm-avatar');
  await expect(avatar).toHaveAttribute('data-ready', 'true', { timeout: 25000 });
  const yaw = async () => Number((await avatar.getAttribute('data-gaze'))?.split(',')[0]);
  await page.mouse.move(20, 200);
  await expect.poll(yaw).toBeLessThan(-0.12);
  const left = await avatar.screenshot();
  await page.mouse.move(1460, 800);
  await expect.poll(yaw).toBeGreaterThan(0.12);
  const right = await avatar.screenshot();
  expect(left.equals(right)).toBe(false);
  const body = Number((await avatar.getAttribute('data-gaze'))?.split(',')[2]);
  expect(body).toBeGreaterThan(0.02);
  await page.evaluate(() => document.documentElement.dispatchEvent(new PointerEvent('pointerleave')));
  await expect.poll(async () => Math.abs(await yaw())).toBeLessThan(0.01);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.mouse.move(20, 200);
  await expect(avatar).toHaveAttribute('data-tracking', 'false');
  await expect(avatar).toHaveAttribute('data-gaze', '0.000,0.000,0.000');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.getByRole('button', { name: '学习记录与设置', exact: true }).click();
  await page.getByRole('navigation', { name: '学习记录与设置' }).getByRole('button', { name: '设置与角色', exact: true }).click();
  await page.getByRole('group', { name: '内置 3D 角色' }).getByRole('button', { name: 'VRoid 示例女孩', exact: false }).click();
  await expect(avatar).toHaveAttribute('data-ready', 'true', { timeout: 25000 });
  await page.mouse.move(20, 200);
  await expect.poll(yaw).toBeLessThan(-0.12);
  await page.mouse.move(1460, 800);
  await expect.poll(yaw).toBeGreaterThan(0.12);
  await page.getByRole('switch', { name: '角色动态效果' }).click();
  await page.getByRole('button', { name: 'Lingo 首页' }).click();
  await expect(avatar).toHaveAttribute('data-ready', 'true', { timeout: 25000 });
  await page.mouse.move(20, 200);
  await expect(avatar).toHaveAttribute('data-tracking', 'false');
  await expect(avatar).toHaveAttribute('data-gaze', '0.000,0.000,0.000');
  expect(errors).toEqual([]);
});
