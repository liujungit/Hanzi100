import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
async function current(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open('hanzi100-mobile');
      r.onsuccess = () => resolve(r.result);
      r.onerror = reject;
    });
    return new Promise<any>((resolve, reject) => {
      const r = db.transaction('state').objectStore('state').get('user');
      r.onsuccess = () => {
        db.close();
        resolve(r.result);
      };
      r.onerror = reject;
    });
  });
}
test('phone learning, wrong answers, restart, import update and tablet layout', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: '学习设置', exact: true }).click();
  await page.getByLabel('每日新字').fill('2');
  await page.getByLabel('换字自动朗读').uncheck();
  await page.getByLabel('答题语音提示').uncheck();
  await page.getByRole('button', { name: '保存设置' }).click();
  await expect.poll(async () => (await current(page)).settings.dailyNew).toBe(2);
  await page.getByRole('button', { name: /导入基础字库/ }).click();
  await expect(page.getByText('本地字库')).toContainText('120');
  await page.getByRole('button', { name: '学习汉字', exact: true }).click();
  await page.getByRole('button', { name: '开始学习', exact: true }).click();
  await expect(page.locator('.character')).toBeVisible();
  await expect(page.getByRole('button', { name: '上一个字', exact: true })).toBeDisabled();
  if (await page.getByRole('button', { name: '关闭提示' }).count())
    await page.getByRole('button', { name: '关闭提示' }).click();
  await page.screenshot({ path: 'test-results/phone-preview.png' });
  await page.getByRole('button', { name: '练习书写' }).click();
  const canvas = page.getByLabel('汉字书写画布');
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 40, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x + 200, box.y + 100);
  await page.mouse.up();
  expect(
    await canvas.evaluate((element) => {
      const c = element as HTMLCanvasElement;
      const pixels = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      let painted = 0;
      for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 0) painted++;
      return painted;
    }),
  ).toBeGreaterThan(100);
  await expect(page.getByRole('button', { name: '撤销一笔' })).toBeEnabled();
  await page.screenshot({ path: 'test-results/phone-writing.png' });
  await page.getByRole('button', { name: '完成', exact: true }).click();
  await page.getByRole('button', { name: '下一个字', exact: true }).click();
  await expect(page.getByRole('button', { name: '上一个字', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '开始练习', exact: true }).click();
  let state = await current(page),
    attempt = state.sessions.study.current;
  const wrong = attempt.question.options.findIndex((v: string) => v !== attempt.question.answer);
  await page.locator('.answer-option').nth(wrong).click();
  await expect(page.locator('.answer-option.wrong')).toHaveCount(1);
  await page.reload();
  await expect(page.getByRole('button', { name: '开始学习', exact: true })).toHaveCount(0);
  await expect(page.locator('.answer-option.wrong')).toHaveCount(1);
  await page.screenshot({ path: 'test-results/phone-question.png', fullPage: true });
  for (let i = 0; i < 60; i++) {
    state = await current(page);
    if (state.sessions.study.phase === 'done') break;
    attempt = state.sessions.study.current;
    if (attempt.answered) {
      await page.waitForTimeout(950);
      continue;
    }
    await page
      .locator('.answer-option')
      .nth(attempt.question.options.indexOf(attempt.question.answer))
      .click();
    await page.waitForTimeout(950);
  }
  await expect(page.getByRole('heading', { name: '今日学习已完成' })).toBeVisible();
  expect(Object.keys((await current(page)).progress)).toHaveLength(2);
  const before = await current(page);
  await page.getByRole('button', { name: '学习设置', exact: true }).click();
  await page.getByRole('button', { name: /导入基础字库/ }).click();
  await expect(page.getByRole('status')).toContainText('更新 120 条');
  expect((await current(page)).progress).toEqual(before.progress);
  expect((await current(page)).errors).toEqual(before.errors);
  await page.getByRole('button', { name: '汉字字库', exact: true }).click();
  await expect(page.locator('.has-errors').first()).toHaveText('1');
  if (await page.getByRole('button', { name: '关闭提示' }).count())
    await page.getByRole('button', { name: '关闭提示' }).click();
  for (const size of [
    { width: 360, height: 780 },
    { width: 834, height: 1194 },
    { width: 1194, height: 834 },
  ]) {
    await page.setViewportSize(size);
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: `test-results/library-${size.width}.png` });
  }
});

test('expanded dictionary and review preview/training are usable on tablet', async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 1194 });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: '学习设置', exact: true }).click();
  await page.getByLabel('换字自动朗读').uncheck();
  await page.getByLabel('答题语音提示').uncheck();
  await page.getByLabel('每日复习').fill('1');
  await page.getByRole('button', { name: '保存设置' }).click();
  await expect.poll(async () => (await current(page)).settings.dailyReview).toBe(1);
  await page.getByRole('button', { name: /导入项目扩展字库/ }).click();
  await expect(page.getByText('本地字库')).toContainText('4407', { timeout: 20000 });
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open('hanzi100-mobile');
      r.onsuccess = () => resolve(r.result);
    });
    const entries = await new Promise<any[]>((resolve) => {
      const r = db.transaction('entries').objectStore('entries').getAll();
      r.onsuccess = () => resolve(r.result);
    });
    const state = await new Promise<any>((resolve) => {
      const r = db.transaction('state').objectStore('state').get('user');
      r.onsuccess = () => resolve(r.result);
    });
    state.progress[entries[0].id] = {
      stage: 0,
      nextReview: '2020-01-01',
      learnedOn: '2020-01-01',
      reviewCount: 0,
    };
    state.lastTab = 'review';
    await new Promise<void>((resolve) => {
      const tx = db.transaction('state', 'readwrite');
      tx.objectStore('state').put(state, 'user');
      tx.oncomplete = () => resolve();
    });
    db.close();
  });
  await page.reload();
  await page.getByRole('button', { name: '开始复习', exact: true }).click();
  await expect(page.locator('.character')).toHaveText(/\p{Script=Han}/u);
  if (await page.getByRole('button', { name: '关闭提示' }).count())
    await page.getByRole('button', { name: '关闭提示' }).click();
  await page.screenshot({ path: 'test-results/ipad-review-preview.png' });
  await page.getByRole('button', { name: '开始练习', exact: true }).click();
  expect((await current(page)).sessions.review.tasks).toHaveLength(3);
  for (let i = 0; i < 3; i++) {
    const attempt = (await current(page)).sessions.review.current;
    await page
      .locator('.answer-option')
      .nth(attempt.question.options.indexOf(attempt.question.answer))
      .click();
    await page.waitForTimeout(1000);
  }
  await expect(page.getByRole('heading', { name: '今日复习已完成' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: '今日复习已完成' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('backup restore requires confirmation and rejects invalid CSV atomically', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: '学习设置', exact: true }).click();
  await page.getByRole('button', { name: /导入基础字库/ }).click();
  await expect(page.getByText('本地字库')).toContainText('120');
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出学习备份', exact: true }).click();
  const download = await downloadEvent;
  const path = info.outputPath('backup.json');
  await download.saveAs(path);
  const backup = JSON.parse(readFileSync(path, 'utf8'));
  expect(backup.entries).toHaveLength(120);
  await page.getByLabel('每日新字').fill('7');
  await page.getByRole('button', { name: '保存设置' }).click();
  await expect.poll(async () => (await current(page)).settings.dailyNew).toBe(7);
  await page.getByLabel('导入字库文件').setInputFiles(path);
  await expect(page.getByRole('heading', { name: '恢复学习备份' })).toBeVisible();
  expect((await current(page)).settings.dailyNew).toBe(7);
  await page.getByRole('button', { name: '确认恢复', exact: true }).click();
  await expect(page.getByLabel('每日新字')).toHaveValue('10');
  const before = await current(page);
  await page
    .getByLabel('导入字库文件')
    .setInputFiles({
      name: 'invalid.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(
        'hanzi,pinyin,meaning,grade,edition,book,volume\n学,xue2,学习,一年级,人教版,语文,上册\n坏,行',
        'utf8',
      ),
    });
  await expect(page.getByRole('status')).toContainText('列数不正确');
  expect(await current(page)).toEqual(before);
  await expect(page.getByText('本地字库')).toContainText('120');
});
