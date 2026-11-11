import { test, expect } from '@playwright/test';
import { defaults } from '../src/types';
async function settings(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: '学习记录与设置', exact: true }).click();
  await page.getByRole('navigation', { name: '学习记录与设置' }).getByRole('button', { name: '设置与角色', exact: true }).click();
}
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as any;
    w.__minimized = 0; w.__maximized = 0; w.__closed = 0;
    w.desktop = { isDesktop: false, nativeWindowControls: false, hasKey: async () => false,
      minimize: () => w.__minimized++, maximize: () => w.__maximized++, close: () => w.__closed++ };
  });
  await page.goto('/');
});
test('长页面与导入弹窗滚到底，标题栏和关闭按钮仍可见可操作', async ({ page }) => {
  await settings(page);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => page.locator('.focus-titlebar').evaluate(e => e.getBoundingClientRect().top)).toBe(0);
  await expect(page.getByRole('button', { name: '最小化', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '最小化', exact: true }).click();
  await page.getByRole('button', { name: '最大化或还原', exact: true }).click();
  expect(await page.evaluate(() => [(window as any).__minimized, (window as any).__maximized])).toEqual([1, 1]);
  await page.getByRole('button', { name: 'Lingo 首页' }).click();
  await page.getByRole('button', { name: '开始学习', exact: true }).click();

  await page.getByRole('button', { name: '添加题目 / AI出题', exact: true }).click();
  for (const viewport of [{ width: 1480, height: 700 }, { width: 390, height: 700 }]) {
    await page.setViewportSize(viewport);
    await page.locator('.modal-body').evaluate(e => { e.scrollTop = e.scrollHeight; });
    await expect(page.getByRole('button', { name: '关闭弹窗', exact: true })).toBeInViewport();
    const close = await page.getByRole('button', { name: '关闭弹窗', exact: true }).boundingBox();
    expect(close!.y).toBeGreaterThanOrEqual(0);
    expect(close!.y + close!.height).toBeLessThanOrEqual(viewport.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.screenshot({ path: 'test-results/fixed-import-header-0.4.0.png' });
  await page.getByRole('button', { name: '关闭弹窗', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.setViewportSize({ width: 1480, height: 960 });
  await page.getByRole('button', { name: '关闭应用', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__closed)).toBe(1);
});
test('精细模型真实加载，VRMA待机说话动作切换，关动态与减少动态可暂停', async ({ page }) => {
  test.setTimeout(120000);
  const avatar = page.locator('.vrm-avatar');
  await expect(avatar).toHaveAttribute('data-ready', 'true', { timeout: 30000 });
  await expect(avatar).toHaveAttribute('data-motion-ready', 'true', { timeout: 30000 });
  await expect(avatar).toHaveAttribute('data-variant', 'avatar-b');
  await expect(avatar).toHaveAttribute('data-animation', 'idle');
  const time = await avatar.getAttribute('data-motion-time');
  await expect.poll(() => avatar.getAttribute('data-motion-time')).not.toBe(time);
  const firstFrame = await avatar.locator('canvas').screenshot();
  await page.waitForTimeout(700);
  const nextFrame = await avatar.locator('canvas').screenshot();
  expect(firstFrame.equals(nextFrame)).toBe(false);
  await page.getByRole('button', { name: '收起陪练气泡', exact: true }).click();
  await page.screenshot({ path: 'test-results/avatar-b-0.4.0.png' });
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('lingo-speech', { detail: true })));
  await expect(avatar).toHaveAttribute('data-animation', 'speaking');
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('lingo-speech', { detail: false })));
  await expect(avatar).toHaveAttribute('data-animation', 'idle');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(avatar).toHaveAttribute('data-animation', 'paused');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(avatar).toHaveAttribute('data-animation', 'idle');
  await settings(page);
  await page.getByRole('switch', { name: '角色动态效果', exact: true }).click();
  await expect(avatar).toHaveAttribute('data-animation', 'paused');
  await page.getByRole('switch', { name: '角色动态效果', exact: true }).click();
  const choices = page.getByRole('group', { name: '内置 3D 角色' });
  await expect(choices.getByRole('button')).toHaveCount(4);
  await choices.getByRole('button', { name: 'Seed · 机能动漫', exact: false }).click();
  await expect(avatar).toHaveAttribute('data-variant', 'seed', { timeout: 30000 });
  await expect(avatar).toHaveAttribute('data-motion-ready', 'true', { timeout: 30000 });
  await page.getByRole('button', { name: 'Lingo 首页' }).click();
  await page.screenshot({ path: 'test-results/seed-0.4.0.png' });
  await expect(page.getByRole('alert')).toHaveCount(0);
});
