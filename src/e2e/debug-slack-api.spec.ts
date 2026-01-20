import { test } from '@playwright/test';

/**
 * Slack APIの生レスポンスを確認するデバッグテスト
 */
test.describe('Slack APIデバッグ', () => {
  test('Slack APIの生レスポンスを確認', async ({ request }) => {
    // 本番環境のSlack APIを直接呼び出し
    const response = await request.get('https://msg-agg-poly.au.ngrok.io/api/slack/messages?limit=100');
    const data = await response.json();

    console.log('=== API Response Summary ===');
    console.log('Total messages:', data.messages?.length || 0);

    // 「在庫と予約数」を含むメッセージを探す
    const targetMessage = data.messages?.find((m: { text?: string }) => m.text?.includes('在庫と予約数'));
    if (targetMessage) {
      console.log('\n=== Target Message ===');
      console.log('ts:', targetMessage.ts);
      console.log('text (first 200 chars):', targetMessage.text?.substring(0, 200));
      console.log('files:', targetMessage.files);
      console.log('Full message object:', JSON.stringify(targetMessage, null, 2));
    }

    // filesフィールドを持つメッセージを探す
    const messagesWithFiles = data.messages?.filter((m: { files?: unknown[] }) => m.files && m.files.length > 0) || [];
    console.log('\n=== Messages with files ===');
    console.log('Count:', messagesWithFiles.length);
    if (messagesWithFiles.length > 0) {
      console.log('First one:', JSON.stringify(messagesWithFiles[0], null, 2));
    }

    // 各メッセージのfilesフィールドの存在を確認
    console.log('\n=== Files field check ===');
    const filesCheck = data.messages?.map((m: { ts?: string; text?: string; files?: unknown[] }) => ({
      ts: m.ts,
      hasFiles: !!m.files,
      filesCount: m.files?.length || 0,
      textPreview: m.text?.substring(0, 50),
    }));
    console.log(JSON.stringify(filesCheck?.slice(0, 20), null, 2));
  });
});
