import { test, expect } from '@playwright/test';

test.describe('デバッグ', () => {
  test('ページのHTML構造を確認', async ({ page }) => {
    // ネットワークリクエストを監視
    page.on('request', (request) => {
      console.log('>> REQUEST:', request.method(), request.url());
    });
    page.on('response', (response) => {
      console.log('<< RESPONSE:', response.status(), response.url());
    });
    page.on('console', (msg) => {
      console.log('CONSOLE:', msg.type(), msg.text());
    });

    // ページにアクセス
    await page.goto('/');
    console.log('=== PAGE LOADED ===');
    await page.waitForTimeout(10000);

    // ページのHTML全体を取得
    const html = await page.content();
    console.log('=== PAGE HTML (first 5000 chars) ===');
    console.log(html.substring(0, 5000));

    // ボタン要素を探す
    const buttons = await page.locator('button').allTextContents();
    console.log('=== BUTTONS ===');
    console.log(buttons);

    // 「自動設定」を含む要素を探す
    const autoAssignElements = await page.locator('text=自動設定').count();
    console.log('=== AUTO ASSIGN ELEMENTS COUNT ===');
    console.log(autoAssignElements);

    // メッセージアイテムを探す
    const messageItems = await page.locator('.bg-white').count();
    console.log('=== BG-WHITE ELEMENTS COUNT ===');
    console.log(messageItems);

    // スペースを探す
    const spaceElements = await page.locator('.space-y-4').count();
    console.log('=== SPACE-Y-4 ELEMENTS COUNT ===');
    console.log(spaceElements);

    await expect(page).toHaveURL('/');
  });
});
