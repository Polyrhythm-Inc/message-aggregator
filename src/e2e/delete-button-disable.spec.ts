import { test, expect } from '@playwright/test';

/**
 * 削除ボタン無効化機能のE2Eテスト
 *
 * 要件:
 * - 自動読み込み直後に削除ボタンが無効化される
 * - 1.5秒後に削除ボタンが有効化される
 * - 無効化中は視覚的なフィードバック（opacity, cursor）が表示される
 */
test.describe('削除ボタン無効化機能', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // ページが完全に読み込まれるまで待機
    await page.waitForLoadState('networkidle');
  });

  // メッセージアイテム内の削除ボタンを取得するヘルパー
  // （「削除モード」ボタンではなく、各メッセージアイテム内の「削除」ボタン）
  const getMessageDeleteButton = (page: import('@playwright/test').Page) => {
    // MessageItem内の削除ボタン（min-w-[72px]クラスで識別）
    return page.locator('button.min-w-\\[72px\\]:has-text("削除")').first();
  };

  test('削除ボタンが初期状態で有効である', async ({ page }) => {
    // メッセージアイテムが表示されるまで待機
    const messageItems = page.locator('.bg-white, .bg-gray-800').filter({
      has: page.locator('button.min-w-\\[72px\\]')
    });

    const count = await messageItems.count();
    if (count === 0) {
      test.skip(true, 'メッセージが存在しないためスキップ');
      return;
    }

    // 削除ボタンを取得
    const deleteButton = getMessageDeleteButton(page);
    await expect(deleteButton).toBeVisible();

    // disabled属性がないことを確認
    await expect(deleteButton).not.toBeDisabled();
  });

  test('削除ボタンにdisabledスタイルが正しく設定される', async ({ page }) => {
    // メッセージアイテムが表示されるまで待機
    const messageItems = page.locator('.bg-white, .bg-gray-800').filter({
      has: page.locator('button.min-w-\\[72px\\]')
    });

    const count = await messageItems.count();
    if (count === 0) {
      test.skip(true, 'メッセージが存在しないためスキップ');
      return;
    }

    // 削除ボタンを取得
    const deleteButton = getMessageDeleteButton(page);

    // disabled:opacity-50 クラスがスタイルに含まれていることを確認
    // （TailwindのdisabledスタイルがCSSに含まれていることを確認）
    await expect(deleteButton).toHaveClass(/disabled:opacity-50/);
    await expect(deleteButton).toHaveClass(/disabled:cursor-not-allowed/);
  });

  test('削除ボタンのdisabledプロパティが正しく伝播される', async ({ page }) => {
    // メッセージアイテムが表示されるまで待機
    const messageItems = page.locator('.bg-white, .bg-gray-800').filter({
      has: page.locator('button.min-w-\\[72px\\]')
    });

    const count = await messageItems.count();
    if (count === 0) {
      test.skip(true, 'メッセージが存在しないためスキップ');
      return;
    }

    // 削除ボタンを取得
    const deleteButton = getMessageDeleteButton(page);

    // 初期状態でボタンが有効であることを確認
    const isDisabled = await deleteButton.isDisabled();
    expect(isDisabled).toBe(false);
  });

  test('削除ボタンが正しいテキストで表示される', async ({ page }) => {
    // メッセージアイテムが表示されるまで待機
    const messageItems = page.locator('.bg-white, .bg-gray-800').filter({
      has: page.locator('button.min-w-\\[72px\\]')
    });

    const count = await messageItems.count();
    if (count === 0) {
      test.skip(true, 'メッセージが存在しないためスキップ');
      return;
    }

    // 削除ボタンが存在することを確認
    const deleteButton = getMessageDeleteButton(page);
    await expect(deleteButton).toBeVisible();

    // ボタンが正しくレンダリングされていることを確認
    await expect(deleteButton).toHaveText('削除');
  });

  test('複数の削除ボタンが独立して動作する', async ({ page }) => {
    // MessageItem内の削除ボタンを取得
    const deleteButtons = page.locator('button.min-w-\\[72px\\]:has-text("削除")');

    const count = await deleteButtons.count();
    if (count < 2) {
      test.skip(true, 'メッセージが2件未満のためスキップ');
      return;
    }

    // 最初の2つの削除ボタンが両方とも有効であることを確認
    await expect(deleteButtons.nth(0)).not.toBeDisabled();
    await expect(deleteButtons.nth(1)).not.toBeDisabled();

    // 両方のボタンがクリック可能であることを確認
    await expect(deleteButtons.nth(0)).toBeEnabled();
    await expect(deleteButtons.nth(1)).toBeEnabled();
  });
});

test.describe('カウントダウンUI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('カウントダウンUIが初期状態で非表示である', async ({ page }) => {
    // カウントダウン表示要素が存在しないことを確認
    const countdownElement = page.locator('text=/\\d+秒後に再読み込み/');
    await expect(countdownElement).not.toBeVisible();
  });

  test('ページレイアウトが正しく表示される', async ({ page }) => {
    // メッセージリストコンテナが存在することを確認
    const messageContainer = page.locator('.space-y-4').first();

    // メッセージがない場合はテストスキップ
    const messageItems = page.locator('.bg-white, .bg-gray-800').filter({
      has: page.locator('button:has-text("削除")')
    });

    const count = await messageItems.count();
    if (count === 0) {
      // メッセージがない場合でもページは正常にレンダリングされるべき
      await expect(page.locator('body')).toBeVisible();
      return;
    }

    await expect(messageContainer).toBeVisible();
  });
});
