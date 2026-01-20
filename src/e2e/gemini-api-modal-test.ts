import { chromium } from 'playwright';
import * as fs from 'fs';

/**
 * 実際のGemini APIを使用して自動設定ボタンの動作確認を行うテスト
 *
 * ゴール:
 * - 一番上のメッセージの自動設定ボタンをクリック
 * - APIレスポンス後に表示されるモーダルにプロンプトが正しく表示されることを確認
 * - スクリーンショットを撮影
 */

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 }
  });
  const page = await context.newPage();

  // レポートディレクトリ確保
  if (!fs.existsSync('reports')) {
    fs.mkdirSync('reports', { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = `reports/gemini-modal-test-${timestamp}.txt`;
  const logs: string[] = [];

  const log = (msg: string) => {
    console.log(msg);
    logs.push(msg);
  };

  try {
    log('=== Gemini API モーダル表示テスト ===');
    log(`開始時刻: ${new Date().toLocaleString('ja-JP')}`);
    log('');

    // ページにアクセス
    log('1. ページにアクセス中...');
    await page.goto('http://127.0.0.1:5101/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // スクリーンショット: 初期表示
    await page.screenshot({ path: 'reports/01-initial-page.png', fullPage: true });
    log('   スクリーンショット保存: reports/01-initial-page.png');

    // メッセージ一覧の確認
    log('2. メッセージ一覧を確認中...');
    try {
      await Promise.race([
        page.waitForSelector('.space-y-4', { timeout: 10000 }),
        page.waitForSelector('text=メッセージがありません', { timeout: 10000 }),
      ]);
    } catch {
      log('   警告: メッセージ一覧の確認タイムアウト');
    }

    // 自動設定ボタンを探す
    log('3. 自動設定ボタンを検索中...');
    const autoAssignButton = page.locator('button.min-w-\\[100px\\]:has-text("自動設定")').first();
    const isVisible = await autoAssignButton.isVisible().catch(() => false);

    if (!isVisible) {
      log('   エラー: 自動設定ボタンが見つかりません');
      await page.screenshot({ path: 'reports/error-no-button.png', fullPage: true });
      throw new Error('自動設定ボタンが見つかりません');
    }

    log('   自動設定ボタンを発見しました');

    // スクリーンショット: ボタンクリック前
    await page.screenshot({ path: 'reports/02-before-click.png', fullPage: true });
    log('   スクリーンショット保存: reports/02-before-click.png');

    // ボタンをクリック
    log('4. 自動設定ボタンをクリック...');
    await autoAssignButton.click();

    // APIレスポンスを待機（Gemini APIは時間がかかる可能性あり）
    log('5. APIレスポンスを待機中（最大60秒）...');

    // モーダルの表示を待機
    const modal = page.locator('text=AI判定結果');
    try {
      await modal.waitFor({ state: 'visible', timeout: 60000 });
      log('   ✅ モーダルが表示されました');
    } catch (error) {
      log('   エラー: モーダルが表示されませんでした');
      await page.screenshot({ path: 'reports/error-no-modal.png', fullPage: true });
      throw error;
    }

    // スクリーンショット: モーダル表示後
    await page.screenshot({ path: 'reports/03-modal-visible.png', fullPage: true });
    log('   スクリーンショット保存: reports/03-modal-visible.png');

    // 「送信プロンプト」セクションを確認
    log('6. 送信プロンプトセクションを確認...');
    const promptSection = page.locator('text=送信プロンプト');
    const promptSectionVisible = await promptSection.isVisible().catch(() => false);

    if (promptSectionVisible) {
      log('   送信プロンプトセクションが存在します');

      // 展開ボタンをクリック
      const promptToggle = page.locator('button:has-text("送信プロンプト")');
      if (await promptToggle.isVisible()) {
        log('   送信プロンプトを展開中...');
        await promptToggle.click();
        await page.waitForTimeout(500);
      }
    } else {
      log('   警告: 送信プロンプトセクションが見つかりません');
    }

    // スクリーンショット: プロンプト展開後
    await page.screenshot({ path: 'reports/04-prompt-expanded.png', fullPage: true });
    log('   スクリーンショット保存: reports/04-prompt-expanded.png');

    // プロンプト内容を取得
    log('7. プロンプト内容を取得...');
    const promptContent = page.locator('pre');
    let promptText = '';

    if (await promptContent.isVisible().catch(() => false)) {
      promptText = await promptContent.textContent() || '';
      log('   プロンプト内容を取得しました');
      log('');
      log('=== プロンプト内容 ===');
      log(promptText);
      log('======================');
    } else {
      log('   警告: プロンプト内容が見つかりません');
    }

    // モーダル全体のスクリーンショット（最終）
    await page.screenshot({ path: 'reports/05-final-modal.png', fullPage: true });
    log('');
    log('   最終スクリーンショット保存: reports/05-final-modal.png');

    // 検証
    log('');
    log('=== 検証結果 ===');

    if (promptText && promptText.length > 0) {
      log('✅ プロンプトが表示されています');

      if (promptText.includes('メッセージを分析') || promptText.includes('【メッセージ】')) {
        log('✅ プロンプト形式が正しいです');
      } else {
        log('⚠️ プロンプト形式が想定と異なる可能性があります');
      }
    } else {
      log('❌ プロンプトが空です');
    }

    log('');
    log('=== テスト完了 ===');
    log(`終了時刻: ${new Date().toLocaleString('ja-JP')}`);

  } catch (error) {
    log('');
    log(`エラー: ${error}`);
    await page.screenshot({ path: 'reports/error-screenshot.png', fullPage: true });
  } finally {
    // レポート保存
    fs.writeFileSync(reportPath, logs.join('\n'));
    console.log(`\nレポート保存: ${reportPath}`);

    await browser.close();
  }
}

main().catch(console.error);
