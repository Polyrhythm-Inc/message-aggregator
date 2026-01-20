import { test, expect } from '@playwright/test';

/**
 * Slack添付ファイル表示機能のE2Eテスト
 *
 * このテストは以下のシナリオをカバーします:
 * 1. 添付ファイルがあるメッセージの表示
 * 2. ファイルボタンのクリックでモーダルが開く
 * 3. モーダルの閉じる操作
 * 4. 各種ファイルタイプの表示
 */

test.describe('Slack添付ファイル表示機能', () => {
  test.beforeEach(async ({ page }) => {
    // APIレスポンスをモックして添付ファイル付きメッセージを返す
    await page.route('**/api/slack/messages', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          messages: [
            {
              ts: '1704067200.000001',
              text: 'テストメッセージ（添付ファイルあり）',
              user: 'U12345678',
              userName: 'テストユーザー',
              files: [
                {
                  id: 'F123456',
                  name: 'test-image.png',
                  title: 'テスト画像',
                  mimetype: 'image/png',
                  filetype: 'png',
                  url_private: 'https://files.slack.com/files-pri/T00000000-F123456/test-image.png',
                  permalink: 'https://slack.com/files/U12345678/F123456/test-image.png',
                  size: 12345,
                },
                {
                  id: 'F234567',
                  name: 'document.pdf',
                  title: 'テストPDF',
                  mimetype: 'application/pdf',
                  filetype: 'pdf',
                  url_private: 'https://files.slack.com/files-pri/T00000000-F234567/document.pdf',
                  permalink: 'https://slack.com/files/U12345678/F234567/document.pdf',
                  size: 54321,
                },
                {
                  id: 'F345678',
                  name: 'code.ts',
                  title: 'TypeScriptコード',
                  mimetype: 'text/plain',
                  filetype: 'ts',
                  url_private: 'https://files.slack.com/files-pri/T00000000-F345678/code.ts',
                  permalink: 'https://slack.com/files/U12345678/F345678/code.ts',
                  size: 1234,
                },
              ],
              project_id: null,
              external_project_id: null,
            },
            {
              ts: '1704067100.000001',
              text: 'テストメッセージ（添付ファイルなし）',
              user: 'U12345678',
              userName: 'テストユーザー',
              project_id: null,
              external_project_id: null,
            },
          ],
          hasMore: false,
        }),
      });
    });

    // プロジェクト一覧のモック
    await page.route('**/api/projects', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      }
    });

    // 外部プロジェクト一覧のモック
    await page.route('**/api/external-projects', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ projects: [] }),
      });
    });

    // ページにアクセス
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
  });

  test('添付ファイルボタンが表示される', async ({ page }) => {
    // 添付ファイルセクションが表示されるのを待つ
    const attachmentSection = page.locator('text=添付ファイル (3)');
    await expect(attachmentSection).toBeVisible({ timeout: 10000 });

    // 各ファイルボタンが表示される
    const imageButton = page.locator('button:has-text("テスト画像")');
    const pdfButton = page.locator('button:has-text("テストPDF")');
    const codeButton = page.locator('button:has-text("TypeScriptコード")');

    await expect(imageButton).toBeVisible();
    await expect(pdfButton).toBeVisible();
    await expect(codeButton).toBeVisible();
  });

  test('ファイルボタンクリックでモーダルが開く', async ({ page }) => {
    // ファイルAPIのモック（画像の場合）
    await page.route('**/api/slack/files**', async (route) => {
      // 簡単なテスト用の1x1 PNG画像
      const pngData = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64'
      );
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: pngData,
      });
    });

    // 添付ファイルセクションが表示されるのを待つ
    await page.waitForSelector('text=添付ファイル (3)', { timeout: 10000 });

    // 画像ファイルのボタンをクリック
    const imageButton = page.locator('button:has-text("テスト画像")');
    await imageButton.click();

    // モーダルが表示される
    const modal = page.locator('.fixed.inset-0.bg-black\\/50');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // モーダルヘッダーにファイル名が表示される
    const modalTitle = page.locator('h3:has-text("テスト画像")');
    await expect(modalTitle).toBeVisible();
  });

  test('モーダルをESCキーで閉じる', async ({ page }) => {
    // ファイルAPIのモック
    await page.route('**/api/slack/files**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/plain',
        body: 'const test = "hello";',
      });
    });

    // 添付ファイルセクションが表示されるのを待つ
    await page.waitForSelector('text=添付ファイル (3)', { timeout: 10000 });

    // ファイルボタンをクリック
    const codeButton = page.locator('button:has-text("TypeScriptコード")');
    await codeButton.click();

    // モーダルが表示される
    const modal = page.locator('.fixed.inset-0.bg-black\\/50');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // ESCキーを押す
    await page.keyboard.press('Escape');

    // モーダルが閉じる
    await expect(modal).not.toBeVisible({ timeout: 3000 });
  });

  test('モーダルを閉じるボタンで閉じる', async ({ page }) => {
    // ファイルAPIのモック
    await page.route('**/api/slack/files**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/plain',
        body: 'const test = "hello";',
      });
    });

    // 添付ファイルセクションが表示されるのを待つ
    await page.waitForSelector('text=添付ファイル (3)', { timeout: 10000 });

    // ファイルボタンをクリック
    const codeButton = page.locator('button:has-text("TypeScriptコード")');
    await codeButton.click();

    // モーダルが表示される
    const modal = page.locator('.fixed.inset-0.bg-black\\/50');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // 閉じるボタンをクリック
    const closeButton = page.locator('button[title="閉じる"]');
    await closeButton.click();

    // モーダルが閉じる
    await expect(modal).not.toBeVisible({ timeout: 3000 });
  });

  test('モーダルの外側クリックで閉じる', async ({ page }) => {
    // ファイルAPIのモック
    await page.route('**/api/slack/files**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/plain',
        body: 'const test = "hello";',
      });
    });

    // 添付ファイルセクションが表示されるのを待つ
    await page.waitForSelector('text=添付ファイル (3)', { timeout: 10000 });

    // ファイルボタンをクリック
    const codeButton = page.locator('button:has-text("TypeScriptコード")');
    await codeButton.click();

    // モーダルが表示される
    const modal = page.locator('.fixed.inset-0.bg-black\\/50');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // モーダルの外側をクリック（背景部分）
    await modal.click({ position: { x: 10, y: 10 } });

    // モーダルが閉じる
    await expect(modal).not.toBeVisible({ timeout: 3000 });
  });

  test('テキストファイルの場合コピーボタンが表示される', async ({ page }) => {
    // ファイルAPIのモック（テキストファイル）
    await page.route('**/api/slack/files**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/plain',
        body: 'const test = "hello world";',
      });
    });

    // 添付ファイルセクションが表示されるのを待つ
    await page.waitForSelector('text=添付ファイル (3)', { timeout: 10000 });

    // TypeScriptファイルのボタンをクリック
    const codeButton = page.locator('button:has-text("TypeScriptコード")');
    await codeButton.click();

    // モーダルが表示される
    const modal = page.locator('.fixed.inset-0.bg-black\\/50');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // コピーボタンが表示される
    const copyButton = page.locator('button[title="コピー"]');
    await expect(copyButton).toBeVisible();

    // テキストコンテンツが表示される
    const codeContent = page.locator('pre:has-text("const test")');
    await expect(codeContent).toBeVisible();
  });

  test('添付ファイルがないメッセージには添付ファイルセクションが表示されない', async ({ page }) => {
    // ページ内容が表示されるのを待つ
    await page.waitForSelector('text=テストメッセージ（添付ファイルなし）', { timeout: 10000 });

    // 添付ファイルがないメッセージを含むカードを確認
    const messageWithoutFiles = page.locator('.bg-white:has-text("テストメッセージ（添付ファイルなし）")');
    await expect(messageWithoutFiles).toBeVisible();

    // そのメッセージには添付ファイルセクションがない
    const attachmentInMessage = messageWithoutFiles.locator('text=添付ファイル');
    await expect(attachmentInMessage).not.toBeVisible();
  });

  test('ファイル取得エラー時にエラーメッセージが表示される', async ({ page }) => {
    // ファイルAPIのモック（エラー）
    await page.route('**/api/slack/files**', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'ファイルの取得に失敗しました' }),
      });
    });

    // 添付ファイルセクションが表示されるのを待つ
    await page.waitForSelector('text=添付ファイル (3)', { timeout: 10000 });

    // ファイルボタンをクリック
    const imageButton = page.locator('button:has-text("テスト画像")');
    await imageButton.click();

    // モーダルが表示される
    const modal = page.locator('.fixed.inset-0.bg-black\\/50');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // エラーメッセージが表示される
    const errorMessage = page.locator('text=ファイルの取得に失敗しました');
    await expect(errorMessage).toBeVisible({ timeout: 5000 });
  });
});
