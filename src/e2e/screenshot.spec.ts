import { test, expect } from '@playwright/test';

test.describe('スクリーンショット取得', () => {
  test('メッセージ一覧画面のスクリーンショット', async ({ page }) => {
    // ページにアクセス
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // メッセージが表示されるのを待つ
    // MessageListコンポーネントが表示されるまで待機
    await page.waitForTimeout(8000);

    // スクリーンショットを保存
    await page.screenshot({
      path: 'screenshots/message-list.png',
      fullPage: true,
    });

    // ページが表示されていることを確認
    await expect(page).toHaveURL('/');
  });
});
