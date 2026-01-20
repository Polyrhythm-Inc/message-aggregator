import { test, expect } from '@playwright/test';

/**
 * 本番環境での添付ファイル表示デバッグテスト
 */
test.describe('本番環境での添付ファイル確認', () => {
  test('添付ファイル付きメッセージの確認', async ({ page }) => {
    // APIレスポンスを監視
    const apiResponses: { url: string; body: unknown }[] = [];

    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('/api/slack/messages')) {
        try {
          const body = await response.json();
          apiResponses.push({ url, body });
          console.log('=== Slack Messages API Response ===');
          console.log('URL:', url);
          console.log('Messages count:', body.messages?.length || 0);

          // filesフィールドがあるメッセージを探す
          const messagesWithFiles = body.messages?.filter((m: { files?: unknown[] }) => m.files && m.files.length > 0) || [];
          console.log('Messages with files:', messagesWithFiles.length);

          if (messagesWithFiles.length > 0) {
            console.log('First message with files:', JSON.stringify(messagesWithFiles[0], null, 2));
          }

          // 「在庫と予約数」を含むメッセージを探す
          const targetMessage = body.messages?.find((m: { text?: string }) => m.text?.includes('在庫と予約数'));
          if (targetMessage) {
            console.log('=== Target Message Found ===');
            console.log('Text:', targetMessage.text?.substring(0, 100));
            console.log('Has files:', !!targetMessage.files);
            console.log('Files:', JSON.stringify(targetMessage.files, null, 2));
          }
        } catch {
          // JSONパースエラーは無視
        }
      }
    });

    // 本番環境にアクセス
    await page.goto('https://msg-agg-poly.au.ngrok.io/');
    await page.waitForLoadState('networkidle');

    // メッセージが読み込まれるまで待機
    await page.waitForTimeout(3000);

    // 「在庫と予約数」を含むメッセージを探す
    const targetText = '在庫と予約数';
    const messageLocator = page.locator(`text=${targetText}`).first();

    // メッセージが存在するか確認
    const messageExists = await messageLocator.count() > 0;
    console.log(`Message containing "${targetText}" exists:`, messageExists);

    if (messageExists) {
      // メッセージ要素の親要素（MessageItem）を探す
      const messageItem = messageLocator.locator('xpath=ancestor::div[contains(@class, "message") or contains(@class, "border")]').first();

      // 添付ファイルボタンを探す
      const fileButtons = messageItem.locator('button:has-text("📄"), button:has-text("🖼️"), button:has-text("📁")');
      const buttonCount = await fileButtons.count();
      console.log('File buttons found:', buttonCount);

      // ページ全体の添付ファイルボタンを探す
      const allFileButtons = page.locator('button:has-text("📄"), button:has-text("🖼️"), button:has-text("📁")');
      const allButtonCount = await allFileButtons.count();
      console.log('All file buttons on page:', allButtonCount);
    }

    // スクリーンショットを保存
    await page.screenshot({ path: 'debug-prod-screenshot.png', fullPage: true });
    console.log('Screenshot saved: debug-prod-screenshot.png');

    // API応答を出力
    console.log('\n=== All API Responses ===');
    for (const resp of apiResponses) {
      console.log('URL:', resp.url);
    }
  });
});
