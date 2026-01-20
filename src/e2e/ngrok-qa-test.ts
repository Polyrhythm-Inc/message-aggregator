import { chromium } from 'playwright';
import * as fs from 'fs';

/**
 * QAテスト: ngrok経由で自動設定ボタンの動作確認
 *
 * ゴール:
 * - https://msg-agg-poly.au.ngrok.io/ でメッセージ一覧画面を表示
 * - 一番上のメッセージの自動設定ボタンをクリック
 * - APIレスポンス後に表示されるモーダルにプロンプトが正しく表示されることを確認
 * - スクリーンショットを撮影
 */

const NGROK_URL = 'https://msg-agg-poly.au.ngrok.io/';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    ignoreHTTPSErrors: true // ngrok HTTPS対応
  });
  const page = await context.newPage();

  // レポートディレクトリ確保
  if (!fs.existsSync('reports')) {
    fs.mkdirSync('reports', { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = `reports/ngrok-qa-test-${timestamp}.txt`;
  const logs: string[] = [];

  const log = (msg: string) => {
    console.log(msg);
    logs.push(msg);
  };

  try {
    log('=== QA E2Eテスト: ngrok経由 自動設定ボタン動作確認 ===');
    log(`開始時刻: ${new Date().toLocaleString('ja-JP')}`);
    log(`対象URL: ${NGROK_URL}`);
    log('');

    // ページにアクセス
    log('1. ページにアクセス中...');
    await page.goto(NGROK_URL);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // スクリーンショット: 初期表示
    await page.screenshot({ path: 'reports/qa-01-initial-page.png', fullPage: true });
    log('   スクリーンショット保存: reports/qa-01-initial-page.png');

    // ページタイトル取得
    const title = await page.title();
    log(`   ページタイトル: ${title}`);

    // メッセージ一覧の確認
    log('2. メッセージ一覧を確認中...');
    try {
      await Promise.race([
        page.waitForSelector('.space-y-4', { timeout: 15000 }),
        page.waitForSelector('text=メッセージがありません', { timeout: 15000 }),
      ]);
      log('   メッセージ一覧を検出しました');
    } catch {
      log('   警告: メッセージ一覧の確認タイムアウト');
    }

    // 自動設定ボタンを探す
    log('3. 自動設定ボタンを検索中...');
    const autoAssignButton = page.locator('button.min-w-\\[100px\\]:has-text("自動設定")').first();
    const isVisible = await autoAssignButton.isVisible().catch(() => false);

    if (!isVisible) {
      log('   エラー: 自動設定ボタンが見つかりません');
      await page.screenshot({ path: 'reports/qa-error-no-button.png', fullPage: true });
      throw new Error('自動設定ボタンが見つかりません');
    }

    log('   ✅ 自動設定ボタンを発見しました');

    // スクリーンショット: ボタンクリック前
    await page.screenshot({ path: 'reports/qa-02-before-click.png', fullPage: true });
    log('   スクリーンショット保存: reports/qa-02-before-click.png');

    // ボタンをクリック
    log('4. 自動設定ボタンをクリック...');
    await autoAssignButton.click();

    // APIレスポンスを待機（Gemini APIは時間がかかる可能性あり）
    log('5. APIレスポンスを待機中（最大120秒）...');

    // モーダルの表示を待機
    const modal = page.locator('text=AI判定結果');
    try {
      await modal.waitFor({ state: 'visible', timeout: 120000 });
      log('   ✅ モーダルが表示されました');
    } catch (error) {
      log('   エラー: モーダルが表示されませんでした');
      await page.screenshot({ path: 'reports/qa-error-no-modal.png', fullPage: true });
      throw error;
    }

    // スクリーンショット: モーダル表示後
    await page.screenshot({ path: 'reports/qa-03-modal-visible.png', fullPage: true });
    log('   スクリーンショット保存: reports/qa-03-modal-visible.png');

    // モーダル内の情報を取得
    log('6. モーダル内の情報を確認...');

    // プロジェクト名
    const projectNameElem = page.locator('.text-lg.font-bold').first();
    if (await projectNameElem.isVisible().catch(() => false)) {
      const projectName = await projectNameElem.textContent();
      log(`   プロジェクト名: ${projectName}`);
    }

    // 確信度
    const confidenceText = await page.locator('text=/確信度|Confidence/i').first().textContent().catch(() => '');
    if (confidenceText) {
      log(`   確信度情報: ${confidenceText}`);
    }

    // 理由
    const reasonSection = page.locator('text=判定理由').first();
    if (await reasonSection.isVisible().catch(() => false)) {
      log('   判定理由セクションが表示されています');
    }

    // 「送信プロンプト」セクションを確認
    log('7. 送信プロンプトセクションを確認...');
    const promptSection = page.locator('text=送信プロンプト');
    const promptSectionVisible = await promptSection.isVisible().catch(() => false);

    if (promptSectionVisible) {
      log('   ✅ 送信プロンプトセクションが存在します');

      // 展開ボタンをクリック
      const promptToggle = page.locator('button:has-text("送信プロンプト")');
      if (await promptToggle.isVisible()) {
        log('   送信プロンプトを展開中...');
        await promptToggle.click();
        await page.waitForTimeout(500);
      }
    } else {
      log('   ⚠️ 送信プロンプトセクションが見つかりません');
    }

    // スクリーンショット: プロンプト展開後
    await page.screenshot({ path: 'reports/qa-04-prompt-expanded.png', fullPage: true });
    log('   スクリーンショット保存: reports/qa-04-prompt-expanded.png');

    // プロンプト内容を取得
    log('8. プロンプト内容を取得...');
    const promptContent = page.locator('pre');
    let promptText = '';

    if (await promptContent.isVisible().catch(() => false)) {
      promptText = await promptContent.textContent() || '';
      log('   ✅ プロンプト内容を取得しました');
      log('');
      log('=== プロンプト内容（先頭500文字） ===');
      log(promptText.substring(0, 500));
      if (promptText.length > 500) {
        log('... (省略)');
      }
      log('======================================');
    } else {
      log('   ⚠️ プロンプト内容が見つかりません');
    }

    // モーダル全体のスクリーンショット（最終）
    await page.screenshot({ path: 'reports/qa-05-final-modal.png', fullPage: true });
    log('');
    log('   最終スクリーンショット保存: reports/qa-05-final-modal.png');

    // 検証
    log('');
    log('=== 検証結果 ===');

    let testPassed = true;
    const issues: string[] = [];

    // プロンプト表示の検証
    if (promptText && promptText.length > 0) {
      log('✅ プロンプトが表示されています');

      if (promptText.includes('メッセージを分析') || promptText.includes('【メッセージ】')) {
        log('✅ プロンプト形式が正しいです');
      } else {
        log('⚠️ プロンプト形式が想定と異なる可能性があります');
        issues.push('プロンプト形式が想定と異なる');
      }

      if (promptText.includes('【プロジェクト候補】')) {
        log('✅ プロジェクト候補が含まれています');
      } else {
        log('⚠️ プロジェクト候補セクションが見つかりません');
        issues.push('プロジェクト候補セクションがない');
      }

      if (promptText.includes('【判断基準】')) {
        log('✅ 判断基準が含まれています');
      } else {
        log('⚠️ 判断基準セクションが見つかりません');
        issues.push('判断基準セクションがない');
      }
    } else {
      log('❌ プロンプトが空です');
      testPassed = false;
      issues.push('プロンプトが表示されていない');
    }

    log('');
    log('=== テスト結果サマリー ===');
    if (testPassed && issues.length === 0) {
      log('✅ テスト合格: プロンプトが正しく表示されています');
    } else if (testPassed && issues.length > 0) {
      log('⚠️ テスト条件付き合格: 軽微な問題あり');
      issues.forEach(issue => log(`   - ${issue}`));
    } else {
      log('❌ テスト不合格');
      issues.forEach(issue => log(`   - ${issue}`));
    }

    log('');
    log('=== テスト完了 ===');
    log(`終了時刻: ${new Date().toLocaleString('ja-JP')}`);

  } catch (error) {
    log('');
    log(`❌ エラー: ${error}`);
    await page.screenshot({ path: 'reports/qa-error-screenshot.png', fullPage: true });
  } finally {
    // レポート保存
    fs.writeFileSync(reportPath, logs.join('\n'));
    console.log(`\nレポート保存: ${reportPath}`);

    await browser.close();
  }
}

main().catch(console.error);
