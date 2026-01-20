import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';

/**
 * プロンプト表示機能のE2Eテスト
 *
 * 実際のClaude Code APIはタイムアウトする可能性があるため、
 * APIリクエストをキャプチャしてプロンプトを生成し、
 * モックレスポンスで画面表示を確認します。
 */

// タイムアウトを60秒に設定
test.setTimeout(60000);

// メッセージ行内の「自動設定」ボタンを取得するヘルパー
const getMessageAutoAssignButton = (page: Page) => {
  return page.locator('button.min-w-\\[100px\\]:has-text("自動設定")').first();
};

// プロンプト生成関数（claude-code.tsのbuildSingleSuggestPromptと同じロジック）
type Project = { id: string; name: string; description?: string | null };
function buildSingleSuggestPrompt(message: string, projects: Project[]): string {
  const projectList = projects
    .map((p) => `- id:${p.id} name:${p.name}${p.description ? `: ${p.description}` : ''}`)
    .join('\n');

  return `以下のメッセージを分析し、最も適切なプロジェクトを選択してください。

【メッセージ】
${message}

【プロジェクト候補】
${projectList}

【出力形式】
以下のJSON形式で出力してください（JSONのみ、他の説明は不要）：
\`\`\`json
{
  "projectId": "選択したプロジェクトのID（該当なしの場合はnull）",
  "confidence": 0-100の確信度,
  "reason": "選択理由（日本語で簡潔に）"
}
\`\`\`

【判断基準】
1. メッセージにプロジェクト名が直接含まれている場合は高確信度（80-100）
2. プロジェクトの説明と関連するキーワードがある場合は中確信度（50-79）
3. 明確な関連性がない場合はnullを返す`;
}

test.describe('プロンプト表示機能の確認（モック使用）', () => {
  test('一番上のメッセージの自動設定ボタンを押し、モーダルにプロンプトが正しく表示される', async ({ page }) => {
    // コンソールログを収集
    const consoleLogs: string[] = [];
    page.on('console', (msg) => {
      consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
    });

    // APIリクエストを記録
    let capturedRequest: { ts: string; message: string; projects: Project[] } | null = null;
    let generatedPrompt: string | null = null;

    // APIリクエストをインターセプト（リクエストボディからプロンプトを生成してモックレスポンスを返す）
    await page.route('**/api/projects/suggest-and-apply', async (route) => {
      const request = route.request();
      const postData = request.postDataJSON() as { ts: string; message: string; projects: Project[] };
      capturedRequest = postData;

      // リクエストボディからプロンプトを生成
      generatedPrompt = buildSingleSuggestPrompt(postData.message, postData.projects);

      console.log('APIリクエストをキャプチャ');
      console.log('生成されたプロンプト（先頭200文字）:', generatedPrompt.substring(0, 200));

      // モックレスポンスを返す（プロンプト情報を含む）
      const mockResponse = {
        success: true,
        applied: true,
        projectId: postData.projects[0]?.id || null,
        projectName: postData.projects[0]?.name || null,
        confidence: 75,
        reason: 'E2Eテスト用のモック判定結果です',
        previousProjectId: null,
        prompt: generatedPrompt,
      };

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockResponse),
      });
    });

    // ページにアクセス
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // メッセージ一覧が表示されるまで待機
    try {
      await Promise.race([
        page.waitForSelector('.space-y-4', { timeout: 20000 }),
        page.waitForSelector('text=メッセージがありません', { timeout: 20000 }),
      ]);
    } catch {
      // どちらも表示されない場合はそのまま続行
    }

    // 自動設定ボタンを取得
    const autoAssignButton = getMessageAutoAssignButton(page);
    const isVisible = await autoAssignButton.isVisible().catch(() => false);

    if (!isVisible) {
      console.log('メッセージが存在しないため、テストをスキップします');
      test.skip(true, 'メッセージが存在しないためスキップ');
      return;
    }

    // スクリーンショット：ボタンクリック前
    await page.screenshot({ path: 'reports/e2e-before-click.png', fullPage: true });

    // ボタンをクリック
    console.log('自動設定ボタンをクリックします...');
    await autoAssignButton.click();

    // モーダルの表示を待機
    console.log('モーダルの表示を待機中...');
    const modal = page.locator('text=AI判定結果');
    await expect(modal).toBeVisible({ timeout: 10000 });

    console.log('✅ モーダルが表示されました');

    // スクリーンショット：モーダル表示後
    await page.screenshot({ path: 'reports/e2e-modal-visible.png', fullPage: true });

    // 「送信プロンプト」セクションの存在確認
    const promptSection = page.locator('text=送信プロンプト');
    await expect(promptSection).toBeVisible({ timeout: 5000 });

    // 「送信プロンプト」ボタンをクリックして展開
    const promptToggle = page.locator('button:has-text("送信プロンプト")');
    await promptToggle.click();
    await page.waitForTimeout(500);

    // スクリーンショット：プロンプト展開後
    await page.screenshot({ path: 'reports/e2e-prompt-expanded.png', fullPage: true });

    // プロンプト内容を取得
    const promptContent = page.locator('pre');
    await expect(promptContent).toBeVisible({ timeout: 3000 });

    const promptText = await promptContent.textContent();

    // プロンプト内容をファイルに保存
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportPath = `reports/e2e-prompt-content-${timestamp}.txt`;

    fs.writeFileSync(
      reportPath,
      `=== E2Eテスト結果 ===\n\n` +
      `テスト日時: ${new Date().toLocaleString('ja-JP')}\n\n` +
      `=== APIリクエスト ===\n${JSON.stringify(capturedRequest, null, 2)}\n\n` +
      `=== 生成されたプロンプト（バックエンドで生成されるものと同じ） ===\n${generatedPrompt}\n\n` +
      `=== 画面に表示されたプロンプト ===\n${promptText}\n\n` +
      `=== コンソールログ ===\n${consoleLogs.join('\n')}\n`
    );

    console.log(`レポート保存: ${reportPath}`);
    console.log('\n=== 画面に表示されたプロンプト文字列 ===');
    console.log(promptText);
    console.log('=================================\n');

    // 検証: プロンプトが空でないこと
    expect(promptText).not.toBe('');
    expect(promptText).not.toBeNull();

    // 検証: 生成されたプロンプトと画面表示が一致すること
    if (generatedPrompt) {
      expect(promptText).toBe(generatedPrompt);
      console.log('✅ 生成されたプロンプトと画面表示が一致しています');
    }

    // 検証: 期待されるプロンプト構造を持つこと
    if (promptText) {
      expect(promptText).toContain('メッセージを分析');
      expect(promptText).toContain('【メッセージ】');
      expect(promptText).toContain('【プロジェクト候補】');
      expect(promptText).toContain('【判断基準】');
      console.log('✅ プロンプトは正しい形式で表示されています');
    }
  });
});
