import { test, expect, Page } from '@playwright/test';

// テストのタイムアウトを延長
test.setTimeout(60000);

// メッセージ行内の「自動設定」ボタンを取得するヘルパー
const getMessageAutoAssignButton = (page: Page) => {
  return page.locator('button.min-w-\\[100px\\]:has-text("自動設定")').first();
};

test.describe('送信プロンプト表示機能（モックテスト）', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    try {
      await Promise.race([
        page.waitForSelector('.space-y-4', { timeout: 20000 }),
        page.waitForSelector('text=メッセージがありません', { timeout: 20000 }),
      ]);
    } catch {
      // どちらも表示されない場合はそのまま続行
    }
  });

  test('成功時：AI判定結果モーダルにプロンプトが表示される', async ({ page }) => {
    const autoAssignButton = getMessageAutoAssignButton(page);

    const isVisible = await autoAssignButton.isVisible().catch(() => false);

    if (!isVisible) {
      test.skip(true, 'メッセージが存在しないためスキップ');
      return;
    }

    // APIリクエストをインターセプトして成功レスポンスを返す（プロンプト情報付き）
    await page.route('**/api/projects/suggest-and-apply', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          applied: true,
          projectId: 'test-project-id',
          projectName: 'テストプロジェクト',
          confidence: 85,
          reason: 'メッセージ内容からテストプロジェクトと判定しました',
          prompt: '以下のメッセージを分析して、最も適切なプロジェクトを選択してください。\n\nメッセージ内容:\nNext.js 16 vs Other Frameworks...\n\nプロジェクト一覧:\n- test-project-id: テストプロジェクト\n- other-project: 他のプロジェクト',
        }),
      });
    });

    // ボタンをクリック
    await autoAssignButton.click();

    // モーダルの表示を待機
    const modal = page.locator('text=AI判定結果');
    await expect(modal).toBeVisible({ timeout: 10000 });

    // 「送信プロンプト」セクションが存在することを確認
    const promptSection = page.locator('text=送信プロンプト');
    await expect(promptSection).toBeVisible();
  });

  test('成功時：プロンプトを展開すると実際のプロンプトが表示される', async ({ page }) => {
    const autoAssignButton = getMessageAutoAssignButton(page);

    const isVisible = await autoAssignButton.isVisible().catch(() => false);

    if (!isVisible) {
      test.skip(true, 'メッセージが存在しないためスキップ');
      return;
    }

    // APIリクエストをインターセプト
    await page.route('**/api/projects/suggest-and-apply', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          applied: true,
          projectId: 'test-project-id',
          projectName: 'テストプロジェクト',
          confidence: 85,
          reason: 'テストプロジェクトと判定しました',
          prompt: 'これは実際に送信されたプロンプトです。\n\nプロジェクト一覧:\n- project-alpha\n- project-beta',
        }),
      });
    });

    // ボタンをクリック
    await autoAssignButton.click();

    // モーダルの表示を待機
    const modal = page.locator('text=AI判定結果');
    await expect(modal).toBeVisible({ timeout: 10000 });

    // 「送信プロンプト」ボタンをクリックして展開
    const promptToggle = page.locator('button:has-text("送信プロンプト")');
    await promptToggle.click();

    // プロンプト内容が表示されることを確認
    const promptContent = page.locator('pre');
    await expect(promptContent).toBeVisible();

    // プロンプト内容が正しく表示されることを確認
    const promptText = await promptContent.textContent();
    expect(promptText).toContain('実際に送信されたプロンプト');
    expect(promptText).toContain('project-alpha');
    expect(promptText).not.toBe('（プロンプト情報がありません）');
  });

  test('成功時：確信度と判定理由が正しく表示される', async ({ page }) => {
    const autoAssignButton = getMessageAutoAssignButton(page);

    const isVisible = await autoAssignButton.isVisible().catch(() => false);

    if (!isVisible) {
      test.skip(true, 'メッセージが存在しないためスキップ');
      return;
    }

    // APIリクエストをインターセプト
    await page.route('**/api/projects/suggest-and-apply', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          applied: true,
          projectId: 'test-project-id',
          projectName: 'テストプロジェクト',
          confidence: 92,
          reason: 'メッセージ内容がテストプロジェクトの作業に関連しています',
          prompt: 'テスト用プロンプト',
        }),
      });
    });

    // ボタンをクリック
    await autoAssignButton.click();

    // モーダルの表示を待機
    const modal = page.locator('text=AI判定結果');
    await expect(modal).toBeVisible({ timeout: 10000 });

    // 確信度が表示されることを確認
    const confidenceText = page.locator('text=92%');
    await expect(confidenceText).toBeVisible();

    // 判定理由が表示されることを確認
    const reasonText = page.locator('text=メッセージ内容がテストプロジェクトの作業に関連しています');
    await expect(reasonText).toBeVisible();
  });

  test('モーダルを閉じることができる', async ({ page }) => {
    const autoAssignButton = getMessageAutoAssignButton(page);

    const isVisible = await autoAssignButton.isVisible().catch(() => false);

    if (!isVisible) {
      test.skip(true, 'メッセージが存在しないためスキップ');
      return;
    }

    // APIリクエストをインターセプト
    await page.route('**/api/projects/suggest-and-apply', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          applied: true,
          projectId: 'test-id',
          projectName: 'テスト',
          confidence: 80,
          reason: 'テスト',
          prompt: 'テスト',
        }),
      });
    });

    // ボタンをクリック
    await autoAssignButton.click();

    // モーダルの表示を待機
    const modal = page.locator('text=AI判定結果');
    await expect(modal).toBeVisible({ timeout: 10000 });

    // 「閉じる」ボタンをクリック
    const closeButton = page.locator('button:has-text("閉じる")');
    await closeButton.click();

    // モーダルが閉じることを確認
    await expect(modal).not.toBeVisible();
  });
});

test.describe('エラー時のプロンプト表示', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    try {
      await Promise.race([
        page.waitForSelector('.space-y-4', { timeout: 20000 }),
        page.waitForSelector('text=メッセージがありません', { timeout: 20000 }),
      ]);
    } catch {
      // どちらも表示されない場合はそのまま続行
    }
  });

  test('APIエラー時もモーダルにプロンプト情報が表示される', async ({ page }) => {
    const autoAssignButton = getMessageAutoAssignButton(page);

    const isVisible = await autoAssignButton.isVisible().catch(() => false);

    if (!isVisible) {
      test.skip(true, 'メッセージが存在しないためスキップ');
      return;
    }

    // APIリクエストをインターセプトしてエラーを返す（プロンプト情報付き）
    await page.route('**/api/projects/suggest-and-apply', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          applied: false,
          projectId: null,
          projectName: null,
          confidence: 0,
          error: 'JSONパースに失敗しました',
          prompt: 'エラー時でもプロンプトは保持されています。\n\nプロジェクト一覧:\n- project-a\n- project-b',
        }),
      });
    });

    // ボタンをクリック
    await autoAssignButton.click();

    // モーダルの表示を待機
    const modal = page.locator('text=AI判定結果');
    await expect(modal).toBeVisible({ timeout: 10000 });

    // 「送信プロンプト」ボタンをクリックして展開
    const promptToggle = page.locator('button:has-text("送信プロンプト")');
    await promptToggle.click();

    // プロンプト内容が表示されることを確認
    const promptContent = page.locator('pre');
    await expect(promptContent).toBeVisible();

    // エラー時でもプロンプトが表示されることを確認
    const promptText = await promptContent.textContent();
    expect(promptText).toContain('エラー時でもプロンプトは保持されています');
    expect(promptText).toContain('project-a');
  });

  test('パースエラー時に詳細なエラー情報が表示される', async ({ page }) => {
    const autoAssignButton = getMessageAutoAssignButton(page);

    const isVisible = await autoAssignButton.isVisible().catch(() => false);

    if (!isVisible) {
      test.skip(true, 'メッセージが存在しないためスキップ');
      return;
    }

    // APIリクエストをインターセプトしてパースエラーを返す
    await page.route('**/api/projects/suggest-and-apply', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          applied: false,
          projectId: null,
          projectName: null,
          confidence: 0,
          error: 'Claude応答のJSONパースに失敗しました。応答形式が期待と異なります。',
          prompt: 'パースエラーテスト用プロンプト',
        }),
      });
    });

    // ボタンをクリック
    await autoAssignButton.click();

    // モーダルの表示を待機
    const modal = page.locator('text=AI判定結果');
    await expect(modal).toBeVisible({ timeout: 10000 });

    // 判定理由にエラー情報が表示されることを確認
    const errorMessage = page.locator('text=Claude応答のJSONパースに失敗しました');
    await expect(errorMessage).toBeVisible();
  });

  test('ネットワークエラー時のモーダル表示', async ({ page }) => {
    const autoAssignButton = getMessageAutoAssignButton(page);

    const isVisible = await autoAssignButton.isVisible().catch(() => false);

    if (!isVisible) {
      test.skip(true, 'メッセージが存在しないためスキップ');
      return;
    }

    // APIリクエストをインターセプトしてネットワークエラーを発生させる
    await page.route('**/api/projects/suggest-and-apply', (route) => {
      route.abort('failed');
    });

    // ボタンをクリック
    await autoAssignButton.click();

    // モーダルの表示を待機
    const modal = page.locator('text=AI判定結果');
    await expect(modal).toBeVisible({ timeout: 10000 });

    // 「送信プロンプト」ボタンをクリックして展開
    const promptToggle = page.locator('button:has-text("送信プロンプト")');
    await promptToggle.click();

    // プロンプト内容が表示されることを確認（通信エラーメッセージ）
    const promptContent = page.locator('pre');
    await expect(promptContent).toBeVisible();

    const promptText = await promptContent.textContent();
    expect(promptText).toContain('通信エラー');
  });

  test('該当プロジェクトなしの場合のモーダル表示', async ({ page }) => {
    const autoAssignButton = getMessageAutoAssignButton(page);

    const isVisible = await autoAssignButton.isVisible().catch(() => false);

    if (!isVisible) {
      test.skip(true, 'メッセージが存在しないためスキップ');
      return;
    }

    // APIリクエストをインターセプトして「該当なし」を返す
    await page.route('**/api/projects/suggest-and-apply', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          applied: false,
          projectId: null,
          projectName: null,
          confidence: 30,
          reason: 'メッセージ内容から適切なプロジェクトを特定できませんでした',
          prompt: '該当なし判定のプロンプト',
        }),
      });
    });

    // ボタンをクリック
    await autoAssignButton.click();

    // モーダルの表示を待機
    const modal = page.locator('text=AI判定結果');
    await expect(modal).toBeVisible({ timeout: 10000 });

    // 「該当するプロジェクトが見つかりませんでした」メッセージを確認
    const notFoundMessage = page.locator('text=該当するプロジェクトが見つかりませんでした');
    await expect(notFoundMessage).toBeVisible();
  });
});
