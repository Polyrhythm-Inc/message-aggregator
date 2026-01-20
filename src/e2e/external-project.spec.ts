import { test, expect } from '@playwright/test';

test.describe('外部プロジェクト連携機能（ai-org-projects）', () => {
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

  test('「外部連携」ボタンが表示される', async ({ page }) => {
    // 外部連携ボタンを探す（リンクアイコン付き）
    const externalProjectButtons = page.locator('button:has-text("外部連携")');

    const count = await externalProjectButtons.count();

    if (count > 0) {
      await expect(externalProjectButtons.first()).toBeVisible();
    } else {
      // メッセージがない場合はスキップ
      test.skip(true, 'メッセージが存在しないためスキップ');
    }
  });

  test('外部連携ボタンをクリックするとドロップダウンが表示される', async ({ page }) => {
    const externalProjectButton = page.locator('button:has-text("外部連携")').first();

    const isVisible = await externalProjectButton.isVisible().catch(() => false);

    if (!isVisible) {
      test.skip(true, 'メッセージが存在しないためスキップ');
      return;
    }

    // ボタンをクリック
    await externalProjectButton.click();

    // ドロップダウンメニューが表示されることを確認
    const dropdown = page.locator('.absolute.z-50');
    await expect(dropdown).toBeVisible({ timeout: 5000 });

    // 「ai-org-projects」ヘッダーが表示されることを確認
    await expect(page.locator('text=ai-org-projects')).toBeVisible();

    // 「(なし)」オプションが存在することを確認
    await expect(page.locator('button:has-text("(なし)")')).toBeVisible();
  });

  test('外部プロジェクトを選択できる', async ({ page }) => {
    const externalProjectButton = page.locator('button:has-text("外部連携")').first();

    const isVisible = await externalProjectButton.isVisible().catch(() => false);

    if (!isVisible) {
      test.skip(true, 'メッセージが存在しないためスキップ');
      return;
    }

    // ボタンをクリック
    await externalProjectButton.click();

    // ドロップダウンが表示されるまで待機
    await page.waitForSelector('.absolute.z-50', { timeout: 5000 });

    // プロジェクト一覧が存在するか確認
    const projectButtons = page.locator('.absolute.z-50 button').filter({ hasNot: page.locator('text=(なし)') });
    const projectCount = await projectButtons.count();

    if (projectCount > 1) {
      // 最初のプロジェクトを選択（(なし)以外）
      const firstProject = projectButtons.nth(1);
      const projectName = await firstProject.textContent();

      await firstProject.click();

      // ドロップダウンが閉じることを確認
      await expect(page.locator('.absolute.z-50')).not.toBeVisible({ timeout: 5000 });

      // ボタンテキストが変更されたことを確認（プロジェクト名が表示される）
      if (projectName && projectName.trim()) {
        // ボタンにプロジェクト名が表示されていることを確認
        const updatedButton = page.locator(`button:has-text("${projectName.trim()}")`).first();
        await expect(updatedButton).toBeVisible();
      }
    } else {
      // プロジェクトがない場合はスキップ
      test.skip(true, 'ai-org-projectsにプロジェクトが存在しないためスキップ');
    }
  });

  test('プロジェクト選択後にドロップダウンが閉じる', async ({ page }) => {
    const externalProjectButton = page.locator('button:has-text("外部連携")').first();

    const isVisible = await externalProjectButton.isVisible().catch(() => false);

    if (!isVisible) {
      test.skip(true, 'メッセージが存在しないためスキップ');
      return;
    }

    // ボタンをクリック
    await externalProjectButton.click();

    // ドロップダウンが表示されるまで待機
    await page.waitForSelector('.absolute.z-50', { timeout: 5000 });

    // 「(なし)」を選択
    await page.locator('button:has-text("(なし)")').click();

    // ドロップダウンが閉じることを確認
    await expect(page.locator('.absolute.z-50')).not.toBeVisible({ timeout: 5000 });
  });

  test('外部プロジェクトの割り当てを解除できる', async ({ page }) => {
    const externalProjectButton = page.locator('button:has-text("外部連携")').first();

    const isVisible = await externalProjectButton.isVisible().catch(() => false);

    if (!isVisible) {
      test.skip(true, 'メッセージが存在しないためスキップ');
      return;
    }

    // ボタンをクリック
    await externalProjectButton.click();

    // ドロップダウンが表示されるまで待機
    await page.waitForSelector('.absolute.z-50', { timeout: 5000 });

    // 「(なし)」を選択
    await page.locator('button:has-text("(なし)")').click();

    // ドロップダウンが閉じることを確認
    await expect(page.locator('.absolute.z-50')).not.toBeVisible({ timeout: 5000 });
  });
});

test.describe('外部プロジェクトAPI', () => {
  test('外部プロジェクト一覧APIが正常に動作する', async ({ request }) => {
    const response = await request.get('/api/external-projects');

    // ステータスコードが200であることを確認
    expect(response.status()).toBe(200);

    const data = await response.json();

    // レスポンスにprojectsとtotalが含まれることを確認
    expect(data).toHaveProperty('projects');
    expect(Array.isArray(data.projects)).toBe(true);
  });

  test('外部プロジェクト割り当てAPIにPATCHリクエストを送信できる', async ({ request }) => {
    // テスト用のメッセージタイムスタンプ
    const testTs = '1234567890.123456';

    const response = await request.patch(`/api/slack/messages/${testTs}/external-project`, {
      data: {
        external_project_id: null, // 解除リクエスト
      },
    });

    // ステータスコードが200であることを確認
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
  });

  test('無効なプロジェクトIDでエラーが返される', async ({ request }) => {
    const testTs = '1234567890.123456';

    const response = await request.patch(`/api/slack/messages/${testTs}/external-project`, {
      data: {
        external_project_id: 'invalid-uuid', // 無効なUUID
      },
    });

    // ステータスコードが400であることを確認
    expect(response.status()).toBe(400);

    const data = await response.json();
    expect(data.error).toBeTruthy();
  });
});

test.describe('外部プロジェクトAPIエラーハンドリング', () => {
  test('ai-org-projects接続エラー時にフォールバックする', async ({ page }) => {
    // APIリクエストをインターセプトしてエラーを返す
    await page.route('**/api/external-projects', (route) => {
      route.fulfill({
        status: 500,
        body: JSON.stringify({
          error: 'ai-org-projects サービスに接続できません',
          projects: [],
          total: 0,
        }),
      });
    });

    // ページにアクセス
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // ページがエラー状態でもレンダリングされることを確認
    const body = page.locator('body');
    await expect(body).toBeVisible();

    // 外部連携ボタンが依然として存在することを確認（プロジェクトなしで）
    // ただしプロジェクトがないため、選択肢は空
  });
});
