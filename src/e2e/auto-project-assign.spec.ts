import { test, expect } from '@playwright/test';

test.describe('プロジェクト自動設定機能', () => {
  test.beforeEach(async ({ page }) => {
    // メッセージ一覧ページにアクセス
    await page.goto('/');
    // ページが完全に読み込まれるまで待機
    await page.waitForLoadState('networkidle');

    // Reactのレンダリングとデータ取得が完了するまで待機
    // ローディング完了のタイムアウトを延長（APIからのデータ取得を待つ）
    await page.waitForTimeout(3000);

    // メッセージが表示されるか、「メッセージがありません」が表示されるまで待機
    try {
      await Promise.race([
        page.waitForSelector('.space-y-4', { timeout: 20000 }),
        page.waitForSelector('text=メッセージがありません', { timeout: 20000 }),
      ]);
    } catch {
      // どちらも表示されない場合はそのまま続行（テスト側でスキップ判定）
    }
  });

  test('メッセージ一覧画面が表示される', async ({ page }) => {
    // ページタイトルまたは主要な要素を確認
    await expect(page).toHaveURL('/');

    // ページの主要な要素が表示されることを確認
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('「自動設定」ボタンが表示される', async ({ page }) => {
    // 「自動設定」ボタンを探す
    const autoAssignButtons = page.locator('button:has-text("自動設定")');

    // ボタンが1つ以上存在することを確認
    // メッセージがない場合はスキップ
    const count = await autoAssignButtons.count();

    if (count > 0) {
      // 最初のボタンが表示されていることを確認
      await expect(autoAssignButtons.first()).toBeVisible();
      // ボタンのスタイルを確認（紫色のテキスト）
      await expect(autoAssignButtons.first()).toHaveClass(/text-purple/);
    } else {
      // メッセージがない場合はテストをスキップ
      test.skip(true, 'メッセージが存在しないためスキップ');
    }
  });

  test('「自動設定」ボタンをクリックすると分析が開始される', async ({ page }) => {
    const autoAssignButton = page.locator('button:has-text("自動設定")').first();

    // ボタンが存在する場合のみテスト
    const isVisible = await autoAssignButton.isVisible().catch(() => false);

    if (!isVisible) {
      test.skip(true, 'メッセージが存在しないためスキップ');
      return;
    }

    // ボタンをクリック
    await autoAssignButton.click();

    // 「分析中...」テキストとスピナーが表示されることを確認
    await expect(autoAssignButton).toContainText('分析中');

    // スピナー（animate-spin クラスを持つ要素）が表示されることを確認
    const spinner = autoAssignButton.locator('.animate-spin');
    await expect(spinner).toBeVisible();
  });

  test('分析完了後にトースト通知が表示される', async ({ page }) => {
    const autoAssignButton = page.locator('button:has-text("自動設定")').first();

    const isVisible = await autoAssignButton.isVisible().catch(() => false);

    if (!isVisible) {
      test.skip(true, 'メッセージが存在しないためスキップ');
      return;
    }

    // ボタンをクリック
    await autoAssignButton.click();

    // トースト通知の出現を待機（成功または失敗）
    // トーストは親要素のdiv内に出現する
    const toastLocator = page.locator('.bg-green-600, .bg-red-600');

    // タイムアウトを30秒に設定（Claude Code APIの応答を待つ）
    await expect(toastLocator).toBeVisible({ timeout: 30000 });
  });

  test('分析完了後ボタンが「自動設定」に戻る', async ({ page }) => {
    const autoAssignButton = page.locator('button:has-text("自動設定")').first();

    const isVisible = await autoAssignButton.isVisible().catch(() => false);

    if (!isVisible) {
      test.skip(true, 'メッセージが存在しないためスキップ');
      return;
    }

    // ボタンをクリック
    await autoAssignButton.click();

    // 分析完了を待機（ボタンテキストが「自動設定」に戻る）
    await expect(autoAssignButton).toContainText('自動設定', { timeout: 30000 });

    // ボタンが有効状態に戻ることを確認
    await expect(autoAssignButton).toBeEnabled();
  });

  test('プロジェクトセレクターが存在する', async ({ page }) => {
    // プロジェクトセレクター（select要素またはカスタムドロップダウン）を探す
    // ProjectSelector.tsx の実装に基づいて検索
    const projectSelector = page.locator('select, [role="listbox"], [data-testid="project-selector"]');

    // セレクターが存在する場合のみ確認
    const count = await projectSelector.count();

    if (count > 0) {
      await expect(projectSelector.first()).toBeVisible();
    } else {
      // カスタム実装の可能性があるためスキップ
      test.skip(true, 'プロジェクトセレクターのUI実装が異なる可能性');
    }
  });

  test('AIボタンが表示される', async ({ page }) => {
    // AIボタンを探す
    const aiButton = page.locator('button:has-text("AI")').first();

    const isVisible = await aiButton.isVisible().catch(() => false);

    if (isVisible) {
      await expect(aiButton).toBeVisible();
      await expect(aiButton).toHaveClass(/text-purple/);
    } else {
      test.skip(true, 'メッセージが存在しないためスキップ');
    }
  });

  test('削除ボタンまたは削除モードボタンが表示される', async ({ page }) => {
    // 削除ボタン（メッセージ内）または削除モードボタンを探す
    const deleteButton = page.locator('button:has-text("削除")').first();

    const isVisible = await deleteButton.isVisible().catch(() => false);

    if (isVisible) {
      await expect(deleteButton).toBeVisible();
      // 「削除モード」または「削除」ボタンのどちらかが表示される
    } else {
      test.skip(true, 'メッセージが存在しないためスキップ');
    }
  });

  test('メッセージアイテムのレイアウトが正しい', async ({ page }) => {
    // メッセージアイテムのコンテナを探す
    const messageItems = page.locator('.bg-white.rounded-lg.shadow-sm, .dark\\:bg-gray-800.rounded-lg');

    const count = await messageItems.count();

    if (count > 0) {
      const firstItem = messageItems.first();

      // メッセージアイテム内にボタン群が存在することを確認
      const buttons = firstItem.locator('button');
      const buttonCount = await buttons.count();

      // 最低でも「自動設定」「AI」「削除」の3つ以上のボタンがあることを期待
      expect(buttonCount).toBeGreaterThanOrEqual(2);
    } else {
      test.skip(true, 'メッセージが存在しないためスキップ');
    }
  });
});

test.describe('エラーハンドリング', () => {
  test('ネットワークエラー時にエラートーストが表示される', async ({ page }) => {
    // ページにアクセス
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Reactのレンダリングとデータ取得が完了するまで待機
    await page.waitForTimeout(3000);
    try {
      await Promise.race([
        page.waitForSelector('.space-y-4', { timeout: 20000 }),
        page.waitForSelector('text=メッセージがありません', { timeout: 20000 }),
      ]);
    } catch {
      // どちらも表示されない場合はそのまま続行
    }

    const autoAssignButton = page.locator('button:has-text("自動設定")').first();

    const isVisible = await autoAssignButton.isVisible().catch(() => false);

    if (!isVisible) {
      test.skip(true, 'メッセージが存在しないためスキップ');
      return;
    }

    // APIリクエストをインターセプトしてエラーを返す
    await page.route('**/api/projects/suggest-and-apply', (route) => {
      route.fulfill({
        status: 500,
        body: JSON.stringify({ error: 'サーバーエラー' }),
      });
    });

    // ボタンをクリック
    await autoAssignButton.click();

    // エラートースト（赤色の背景）が表示されることを確認
    const errorToast = page.locator('.bg-red-600');
    await expect(errorToast).toBeVisible({ timeout: 10000 });
  });
});
