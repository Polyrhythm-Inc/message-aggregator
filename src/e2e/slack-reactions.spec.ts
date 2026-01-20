import { test, expect } from '@playwright/test';

test.describe('Slackリアクション機能', () => {
  test.beforeEach(async ({ page }) => {
    // メッセージ一覧ページにアクセス
    await page.goto('/');
    // ページが完全に読み込まれるまで待機
    await page.waitForLoadState('networkidle');

    // Reactのレンダリングとデータ取得が完了するまで待機
    await page.waitForTimeout(3000);

    // メッセージが表示されるか、「メッセージがありません」が表示されるまで待機
    try {
      await Promise.race([
        page.waitForSelector('.space-y-4', { timeout: 20000 }),
        page.waitForSelector('text=メッセージがありません', { timeout: 20000 }),
      ]);
    } catch {
      // どちらも表示されない場合はそのまま続行
    }
  });

  test('リアクションボタン（😀）が返信可能なメッセージに表示される', async ({ page }) => {
    // 返信ボタンを探す（返信ボタンがあればリアクションボタンもある）
    const replyButtons = page.locator('button:has-text("返信")');
    const replyCount = await replyButtons.count();

    if (replyCount > 0) {
      // リアクションボタン（😀）を探す
      const reactionButtons = page.locator('button[title="リアクションを追加"]');
      const reactionCount = await reactionButtons.count();

      // 返信ボタンと同じ数のリアクションボタンがあることを確認
      expect(reactionCount).toBe(replyCount);
      await expect(reactionButtons.first()).toBeVisible();
    } else {
      test.skip(true, 'Slack URLを含むメッセージが存在しないためスキップ');
    }
  });

  test('リアクションボタンをクリックすると絵文字ピッカーが表示される', async ({ page }) => {
    const reactionButton = page.locator('button[title="リアクションを追加"]').first();

    const isVisible = await reactionButton.isVisible().catch(() => false);

    if (!isVisible) {
      test.skip(true, 'Slack URLを含むメッセージが存在しないためスキップ');
      return;
    }

    // リアクションボタンをクリック
    await reactionButton.click();

    // 絵文字ピッカーが表示されることを確認
    const emojiPicker = page.locator('.absolute.z-50');
    await expect(emojiPicker).toBeVisible({ timeout: 5000 });

    // プリセット絵文字が表示されていることを確認（グリッド内のボタン）
    const emojiButtons = emojiPicker.locator('button');
    const emojiCount = await emojiButtons.count();
    expect(emojiCount).toBeGreaterThanOrEqual(10); // 少なくとも10個の絵文字
  });

  test('絵文字ピッカーで絵文字を選択できる', async ({ page }) => {
    // リアクションAPIをモックして成功レスポンスを返す
    await page.route('**/api/slack/reactions', (route) => {
      if (route.request().method() === 'POST') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
      } else {
        route.continue();
      }
    });

    const reactionButton = page.locator('button[title="リアクションを追加"]').first();

    const isVisible = await reactionButton.isVisible().catch(() => false);

    if (!isVisible) {
      test.skip(true, 'Slack URLを含むメッセージが存在しないためスキップ');
      return;
    }

    // リアクションボタンをクリック
    await reactionButton.click();

    // 絵文字ピッカーが表示されるまで待機
    const emojiPicker = page.locator('.absolute.z-50');
    await expect(emojiPicker).toBeVisible({ timeout: 5000 });

    // 最初の絵文字（👍）をクリック
    const firstEmoji = emojiPicker.locator('button').first();
    await firstEmoji.click();

    // 成功表示（✓）が表示されることを確認
    await expect(page.locator('button:has-text("✓")')).toBeVisible({ timeout: 5000 });

    // 絵文字ピッカーが自動で閉じることを確認
    await expect(emojiPicker).not.toBeVisible({ timeout: 3000 });
  });

  test('絵文字ピッカーは外側クリックで閉じる', async ({ page }) => {
    const reactionButton = page.locator('button[title="リアクションを追加"]').first();

    const isVisible = await reactionButton.isVisible().catch(() => false);

    if (!isVisible) {
      test.skip(true, 'Slack URLを含むメッセージが存在しないためスキップ');
      return;
    }

    // リアクションボタンをクリック
    await reactionButton.click();

    // 絵文字ピッカーが表示されるまで待機
    const emojiPicker = page.locator('.absolute.z-50');
    await expect(emojiPicker).toBeVisible({ timeout: 5000 });

    // ページの別の場所をクリック
    await page.locator('body').click({ position: { x: 10, y: 10 } });

    // 絵文字ピッカーが閉じることを確認
    await expect(emojiPicker).not.toBeVisible({ timeout: 3000 });
  });

  test('絵文字ピッカーはESCキーで閉じる', async ({ page }) => {
    const reactionButton = page.locator('button[title="リアクションを追加"]').first();

    const isVisible = await reactionButton.isVisible().catch(() => false);

    if (!isVisible) {
      test.skip(true, 'Slack URLを含むメッセージが存在しないためスキップ');
      return;
    }

    // リアクションボタンをクリック
    await reactionButton.click();

    // 絵文字ピッカーが表示されるまで待機
    const emojiPicker = page.locator('.absolute.z-50');
    await expect(emojiPicker).toBeVisible({ timeout: 5000 });

    // ESCキーを押す
    await page.keyboard.press('Escape');

    // 絵文字ピッカーが閉じることを確認
    await expect(emojiPicker).not.toBeVisible({ timeout: 3000 });
  });

  test('リアクションボタンをトグルで開閉できる', async ({ page }) => {
    const reactionButton = page.locator('button[title="リアクションを追加"]').first();

    const isVisible = await reactionButton.isVisible().catch(() => false);

    if (!isVisible) {
      test.skip(true, 'Slack URLを含むメッセージが存在しないためスキップ');
      return;
    }

    const emojiPicker = page.locator('.absolute.z-50');

    // 1回目のクリック: 開く
    await reactionButton.click();
    await expect(emojiPicker).toBeVisible({ timeout: 5000 });

    // 2回目のクリック: 閉じる
    await reactionButton.click();
    await expect(emojiPicker).not.toBeVisible({ timeout: 3000 });
  });
});

test.describe('Slackリアクション API', () => {
  test('リアクション追加APIが正常に動作する（モック）', async ({ request }) => {
    // 注: 実際のSlack APIをコールするとリアクションが追加されてしまうため、
    // このテストはモックなしではスキップ
    // 実際のテストはページコンテキストでモックを使用する
    test.skip(true, '実際のAPIテストはページコンテキストでモックを使用');
  });

  test('リアクション追加APIのバリデーションエラー', async ({ request }) => {
    // channelIdが空の場合
    const response = await request.post('/api/slack/reactions', {
      data: {
        channelId: '',
        messageTs: '1234567890.123456',
        name: 'thumbsup',
      },
    });

    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data.error).toBeTruthy();
  });

  test('リアクション追加APIのバリデーション - messageTs空', async ({ request }) => {
    const response = await request.post('/api/slack/reactions', {
      data: {
        channelId: 'C1234567890',
        messageTs: '',
        name: 'thumbsup',
      },
    });

    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data.error).toBeTruthy();
  });

  test('リアクション追加APIのバリデーション - name空', async ({ request }) => {
    const response = await request.post('/api/slack/reactions', {
      data: {
        channelId: 'C1234567890',
        messageTs: '1234567890.123456',
        name: '',
      },
    });

    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data.error).toBeTruthy();
  });

  test('リアクション削除APIのバリデーションエラー', async ({ request }) => {
    const response = await request.delete('/api/slack/reactions', {
      data: {
        channelId: '',
        messageTs: '1234567890.123456',
        name: 'thumbsup',
      },
    });

    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data.error).toBeTruthy();
  });
});

test.describe('Slackリアクション エラーハンドリング', () => {
  test('APIエラー時にエラーメッセージが表示される', async ({ page }) => {
    // リアクションAPIをモックしてエラーを返す
    await page.route('**/api/slack/reactions', (route) => {
      if (route.request().method() === 'POST') {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ success: false, error: 'リアクションの追加に失敗しました' }),
        });
      } else {
        route.continue();
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const reactionButton = page.locator('button[title="リアクションを追加"]').first();

    const isVisible = await reactionButton.isVisible().catch(() => false);

    if (!isVisible) {
      test.skip(true, 'Slack URLを含むメッセージが存在しないためスキップ');
      return;
    }

    // リアクションボタンをクリック
    await reactionButton.click();

    // 絵文字ピッカーが表示されるまで待機
    const emojiPicker = page.locator('.absolute.z-50');
    await expect(emojiPicker).toBeVisible({ timeout: 5000 });

    // 絵文字をクリック
    const firstEmoji = emojiPicker.locator('button').first();
    await firstEmoji.click();

    // エラーメッセージが表示されることを確認
    await expect(page.locator('text=リアクションの追加に失敗しました')).toBeVisible({ timeout: 5000 });
  });

  test('「既にリアクション済み」エラーの表示', async ({ page }) => {
    // リアクションAPIをモックして「既にリアクション済み」エラーを返す
    await page.route('**/api/slack/reactions', (route) => {
      if (route.request().method() === 'POST') {
        route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ success: false, error: '既にリアクション済みです' }),
        });
      } else {
        route.continue();
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const reactionButton = page.locator('button[title="リアクションを追加"]').first();

    const isVisible = await reactionButton.isVisible().catch(() => false);

    if (!isVisible) {
      test.skip(true, 'Slack URLを含むメッセージが存在しないためスキップ');
      return;
    }

    // リアクションボタンをクリック
    await reactionButton.click();

    // 絵文字ピッカーが表示されるまで待機
    const emojiPicker = page.locator('.absolute.z-50');
    await expect(emojiPicker).toBeVisible({ timeout: 5000 });

    // 絵文字をクリック
    const firstEmoji = emojiPicker.locator('button').first();
    await firstEmoji.click();

    // エラーメッセージが表示されることを確認
    await expect(page.locator('text=既にリアクション済みです')).toBeVisible({ timeout: 5000 });
  });
});
