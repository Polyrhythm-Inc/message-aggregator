import { chromium } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * QA E2Eテスト: Gemini API移行後の動作確認
 *
 * 目的:
 * - メッセージ一覧画面で自動設定ボタンを押す
 * - APIレスポンス後のモーダルにプロンプトが正しく表示されることを確認
 * - スクリーンショットを撮影
 */
async function runQaTest() {
  const targetUrl = 'https://msg-agg-poly.au.ngrok.io/';
  const reportsDir = path.join(__dirname, '../../reports');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  // reportsディレクトリがなければ作成
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  console.log('=== QA E2Eテスト開始 ===');
  console.log(`対象URL: ${targetUrl}`);
  console.log(`タイムスタンプ: ${timestamp}`);

  // ヘッドレスモードでブラウザを起動
  const browser = await chromium.launch({
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
  });
  const page = await context.newPage();

  // テスト結果を記録
  const testResults: {
    step: string;
    status: 'success' | 'failure' | 'warning';
    message: string;
    screenshotPath?: string;
  }[] = [];

  try {
    // ステップ1: ページにアクセス
    console.log('\n1. ページにアクセス中...');
    await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 });
    console.log('   ✅ ページにアクセス成功');
    testResults.push({ step: 'ページアクセス', status: 'success', message: 'ngrok URLに正常にアクセス' });

    // メッセージ一覧が表示されるまで待機
    await page.waitForTimeout(3000);

    // ステップ2: 自動設定ボタンを探す
    console.log('\n2. 自動設定ボタンを探索中...');
    const autoButtons = await page.locator('button:has-text("自動設定")').all();
    console.log(`   「自動設定」ボタン数: ${autoButtons.length}`);

    if (autoButtons.length === 0) {
      // ボタンがない場合のスクリーンショット
      const noButtonPath = path.join(reportsDir, `qa-no-button-${timestamp}.png`);
      await page.screenshot({ path: noButtonPath, fullPage: true });
      testResults.push({
        step: 'ボタン探索',
        status: 'failure',
        message: '自動設定ボタンが見つかりません（メッセージがない可能性）',
        screenshotPath: noButtonPath
      });
      console.log('   ❌ 自動設定ボタンが見つかりません');
      throw new Error('自動設定ボタンが見つかりません');
    }

    testResults.push({ step: 'ボタン探索', status: 'success', message: `${autoButtons.length}個の自動設定ボタンを発見` });

    // 最初の自動設定ボタンを取得
    const autoAssignButton = page.locator('button:has-text("自動設定")').first();

    // ステップ3: ボタンクリック前のスクリーンショット
    const beforeClickPath = path.join(reportsDir, `qa-01-before-click-${timestamp}.png`);
    await page.screenshot({ path: beforeClickPath, fullPage: true });
    console.log(`\n3. ボタンクリック前のスクリーンショット: ${beforeClickPath}`);
    testResults.push({
      step: 'クリック前スクリーンショット',
      status: 'success',
      message: 'ボタンクリック前の画面を撮影',
      screenshotPath: beforeClickPath
    });

    // ステップ4: ボタンをクリック
    console.log('\n4. 自動設定ボタンをクリック中...');

    // APIリクエストを監視
    let apiRequestSent = false;
    let apiResponseReceived = false;
    let apiError: string | null = null;

    page.on('request', (request) => {
      if (request.url().includes('/api/projects/suggest-and-apply')) {
        apiRequestSent = true;
        console.log(`   📤 APIリクエスト送信: ${request.url()}`);
      }
    });

    page.on('response', async (response) => {
      if (response.url().includes('/api/projects/suggest-and-apply')) {
        apiResponseReceived = true;
        const status = response.status();
        console.log(`   📥 APIレスポンス受信: ${status}`);
        if (status !== 200) {
          try {
            const body = await response.json();
            apiError = body.error || `HTTP ${status}`;
            console.log(`   ❌ APIエラー: ${apiError}`);
          } catch {
            apiError = `HTTP ${status}`;
          }
        }
      }
    });

    // ページの一番上にスクロール
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);

    // 一番上のメッセージカード内の自動設定ボタンを取得
    // MessageItem コンポーネントは div.bg-white.rounded-lg 形式
    const firstMessageCard = page.locator('.bg-white.rounded-lg.shadow-sm, .dark\\:bg-gray-800.rounded-lg').first();
    const targetButton = firstMessageCard.locator('button:has-text("自動設定")');

    const isTargetVisible = await targetButton.isVisible().catch(() => false);
    console.log(`   一番上のメッセージ内の自動設定ボタン: ${isTargetVisible ? '発見' : '見つからず'}`);

    if (!isTargetVisible) {
      // フォールバック: 元の方法で一番最初のボタンを取得
      console.log('   フォールバック: 最初の自動設定ボタンを使用');
    }

    const buttonToClick = isTargetVisible ? targetButton : autoAssignButton;
    await buttonToClick.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);

    // ボタンのテキストを確認
    const buttonText = await buttonToClick.textContent();
    console.log(`   ボタンテキスト: "${buttonText?.trim()}"`);

    // ボタンの位置を確認
    const bbox = await buttonToClick.boundingBox();
    console.log(`   ボタン位置: x=${bbox?.x}, y=${bbox?.y}, w=${bbox?.width}, h=${bbox?.height}`);

    // Playwright の force オプションを使用してクリック
    await buttonToClick.click({ force: true });
    console.log('   ✅ クリック完了');

    // クリック直後のスクリーンショット
    await page.waitForTimeout(500);
    const justAfterClickPath = path.join(reportsDir, `qa-just-after-click-${timestamp}.png`);
    await page.screenshot({ path: justAfterClickPath, fullPage: true });
    console.log(`   クリック直後のスクリーンショット: ${justAfterClickPath}`);

    // ローディング状態を確認
    const loadingVisible = await page.locator('text=分析中').isVisible().catch(() => false);
    console.log(`   ローディング状態: ${loadingVisible ? '表示' : '非表示'}`);

    testResults.push({ step: 'ボタンクリック', status: 'success', message: `自動設定ボタンをクリック (ローディング: ${loadingVisible})` });

    // ステップ5: APIレスポンスを待機（Gemini APIは最大30秒タイムアウト）
    console.log('\n5. AI判定結果モーダルの表示を待機中（最大60秒）...');
    const modal = page.locator('text=AI判定結果');
    let modalVisible = false;

    // 60秒間、3秒ごとにモーダルの表示を確認
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(3000);

      // 分析中かどうかを確認
      const isLoading = await page.locator('text=分析中').isVisible().catch(() => false);
      const spinnerVisible = await page.locator('.animate-spin').first().isVisible().catch(() => false);

      modalVisible = await modal.isVisible().catch(() => false);
      console.log(`   ${(i + 1) * 3}秒経過... モーダル: ${modalVisible ? '表示' : '未表示'}, 分析中: ${isLoading || spinnerVisible ? 'はい' : 'いいえ'}`);

      if (modalVisible) {
        console.log('   ✅ モーダルが表示されました');
        break;
      }

      // エラーモーダルの確認
      const errorVisible = await page.locator('text=エラーが発生しました').isVisible().catch(() => false);
      if (errorVisible) {
        const errorPath = path.join(reportsDir, `qa-error-modal-${timestamp}.png`);
        await page.screenshot({ path: errorPath, fullPage: true });

        // エラーメッセージの内容を取得
        const errorMessage = await page.locator('.text-red-600, .text-red-500, [class*="error"]').textContent().catch(() => 'エラー内容不明');
        const modalContent = await page.locator('[role="dialog"], .modal, .fixed.inset-0').textContent().catch(() => '');

        console.log(`   ❌ エラーモーダルが表示されました`);
        console.log(`   エラー内容: ${modalContent?.substring(0, 500)}`);

        testResults.push({
          step: 'エラー検出',
          status: 'failure',
          message: `エラーモーダルが表示: ${errorMessage?.substring(0, 200)}`,
          screenshotPath: errorPath
        });

        // エラー内容をファイルに保存
        const errorContentPath = path.join(reportsDir, `qa-error-content-${timestamp}.txt`);
        fs.writeFileSync(errorContentPath, `=== エラー内容 ===\n\n${modalContent}\n`);

        break;
      }
    }

    // ステップ6: モーダル表示後のスクリーンショット
    const modalVisiblePath = path.join(reportsDir, `qa-02-modal-visible-${timestamp}.png`);
    await page.screenshot({ path: modalVisiblePath, fullPage: true });
    console.log(`\n6. モーダル表示後のスクリーンショット: ${modalVisiblePath}`);

    if (modalVisible) {
      testResults.push({
        step: 'モーダル表示',
        status: 'success',
        message: 'AI判定結果モーダルが正常に表示',
        screenshotPath: modalVisiblePath
      });
    } else {
      testResults.push({
        step: 'モーダル表示',
        status: 'failure',
        message: 'モーダルが60秒以内に表示されませんでした',
        screenshotPath: modalVisiblePath
      });
      throw new Error('モーダルが表示されませんでした');
    }

    // ステップ7: 「送信プロンプト」セクションを探す
    console.log('\n7. 「送信プロンプト」セクションを探索中...');
    const promptToggle = page.locator('button:has-text("送信プロンプト")');
    const promptToggleVisible = await promptToggle.isVisible().catch(() => false);

    if (!promptToggleVisible) {
      testResults.push({
        step: 'プロンプトセクション',
        status: 'failure',
        message: '「送信プロンプト」ボタンが見つかりません'
      });
      throw new Error('送信プロンプトボタンが見つかりません');
    }

    console.log('   ✅ 「送信プロンプト」ボタンを発見');

    // クリックして展開
    await promptToggle.click();
    await page.waitForTimeout(500);

    // ステップ8: プロンプト展開後のスクリーンショット
    const promptExpandedPath = path.join(reportsDir, `qa-03-prompt-expanded-${timestamp}.png`);
    await page.screenshot({ path: promptExpandedPath, fullPage: true });
    console.log(`\n8. プロンプト展開後のスクリーンショット: ${promptExpandedPath}`);
    testResults.push({
      step: 'プロンプト展開',
      status: 'success',
      message: '送信プロンプトセクションを展開',
      screenshotPath: promptExpandedPath
    });

    // ステップ9: プロンプト内容を取得・検証
    console.log('\n9. プロンプト内容を検証中...');
    const promptContent = page.locator('pre');
    const promptText = await promptContent.textContent().catch(() => null);

    if (promptText) {
      // プロンプト内容を検証
      const hasExpectedFormat =
        promptText.includes('メッセージ') &&
        promptText.includes('プロジェクト') &&
        (promptText.includes('JSON') || promptText.includes('json'));

      if (hasExpectedFormat) {
        console.log('   ✅ プロンプトは正しい形式で表示されています');
        testResults.push({
          step: 'プロンプト検証',
          status: 'success',
          message: 'プロンプトが正しい形式で表示されている'
        });
      } else {
        console.log('   ⚠️ プロンプト形式が予期と異なる可能性があります');
        testResults.push({
          step: 'プロンプト検証',
          status: 'warning',
          message: 'プロンプトは表示されているが、形式が異なる可能性'
        });
      }

      // プロンプト内容をテキストファイルに保存
      const promptContentPath = path.join(reportsDir, `qa-prompt-content-${timestamp}.txt`);
      fs.writeFileSync(promptContentPath,
        `=== QAテスト: プロンプト表示確認 ===\n\n` +
        `テスト日時: ${new Date().toLocaleString('ja-JP')}\n` +
        `URL: ${targetUrl}\n\n` +
        `=== 表示されたプロンプト ===\n${promptText}\n`
      );
      console.log(`   プロンプト内容保存: ${promptContentPath}`);
      console.log('\n=== 表示されたプロンプト（先頭500文字） ===');
      console.log(promptText.substring(0, 500));
      if (promptText.length > 500) console.log('...');
    } else {
      testResults.push({
        step: 'プロンプト検証',
        status: 'failure',
        message: 'プロンプト内容を取得できませんでした'
      });
    }

    console.log('\n=== テスト完了 ===');

  } catch (error) {
    console.error('\n❌ エラーが発生しました:', error);
    const errorPath = path.join(reportsDir, `qa-error-${timestamp}.png`);
    await page.screenshot({ path: errorPath, fullPage: true });
    testResults.push({
      step: 'エラー',
      status: 'failure',
      message: `エラー: ${error instanceof Error ? error.message : String(error)}`,
      screenshotPath: errorPath
    });
  } finally {
    await browser.close();
  }

  // テスト結果サマリーを出力
  console.log('\n=== テスト結果サマリー ===');
  let successCount = 0;
  let failureCount = 0;
  let warningCount = 0;

  testResults.forEach((result, index) => {
    const icon = result.status === 'success' ? '✅' : result.status === 'failure' ? '❌' : '⚠️';
    console.log(`${index + 1}. ${icon} ${result.step}: ${result.message}`);
    if (result.status === 'success') successCount++;
    else if (result.status === 'failure') failureCount++;
    else warningCount++;
  });

  console.log(`\n成功: ${successCount}, 失敗: ${failureCount}, 警告: ${warningCount}`);

  // テスト結果をJSONファイルに保存
  const resultPath = path.join(reportsDir, `qa-test-result-${timestamp}.json`);
  fs.writeFileSync(resultPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    url: targetUrl,
    results: testResults,
    summary: { success: successCount, failure: failureCount, warning: warningCount }
  }, null, 2));
  console.log(`テスト結果保存: ${resultPath}`);

  // 終了コード
  if (failureCount > 0) {
    process.exit(1);
  }
}

runQaTest();
