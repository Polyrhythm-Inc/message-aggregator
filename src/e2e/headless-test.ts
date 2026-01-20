import { chromium } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Headlessモードで自動設定モーダルのスクリーンショットを撮影
 */
async function capturePromptDisplayScreenshot() {
  const targetUrl = 'https://msg-agg-poly.au.ngrok.io/';
  const reportsDir = path.join(__dirname, '../../reports');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  console.log('=== E2E テスト開始（Headless） ===');
  console.log(`対象URL: ${targetUrl}`);
  console.log(`出力先: ${reportsDir}`);

  const browser = await chromium.launch({
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
  });
  const page = await context.newPage();

  try {
    // ページにアクセス
    console.log('\n1. ページにアクセス中...');
    await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 });
    console.log('   ✅ ページにアクセス成功');

    // メッセージ一覧が表示されるまで待機
    console.log('\n2. メッセージ一覧の読み込みを待機中...');
    await page.waitForTimeout(3000);

    // 初期状態のスクリーンショット
    const initialPath = path.join(reportsDir, `headless-initial-${timestamp}.png`);
    await page.screenshot({ path: initialPath, fullPage: true });
    console.log(`   初期状態のスクリーンショット: ${initialPath}`);

    // 一番上のメッセージ行を特定
    console.log('\n3. 一番上のメッセージ行を探索中...');

    // メッセージ行内の「自動設定」ボタンを探す
    const autoButtons = await page.locator('button:has-text("自動設定")').all();
    console.log(`   「自動設定」ボタン数: ${autoButtons.length}`);

    if (autoButtons.length === 0) {
      console.log('   ❌ 自動設定ボタンが見つかりません');
      const errorPath = path.join(reportsDir, `headless-error-${timestamp}.png`);
      await page.screenshot({ path: errorPath, fullPage: true });
      await browser.close();
      return;
    }

    // 最初の自動設定ボタンをクリック
    const firstAutoButton = autoButtons[0];
    console.log('\n4. 一番上のメッセージの自動設定ボタンをクリック...');
    await firstAutoButton.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await firstAutoButton.click();
    console.log('   ✅ クリック完了');

    // クリック直後のスクリーンショット
    await page.waitForTimeout(1000);
    const afterClickPath = path.join(reportsDir, `headless-after-click-${timestamp}.png`);
    await page.screenshot({ path: afterClickPath, fullPage: true });
    console.log(`   クリック直後: ${afterClickPath}`);

    // AI判定結果モーダルを待機（最大60秒）
    console.log('\n5. AI判定結果モーダルを待機中（最大60秒）...');
    const modal = page.locator('text=AI判定結果');
    let modalVisible = false;

    for (let i = 0; i < 12; i++) {
      await page.waitForTimeout(5000);

      const isLoading = await page.locator('text=分析中').isVisible().catch(() => false);
      modalVisible = await modal.isVisible().catch(() => false);

      console.log(`   ${(i + 1) * 5}秒経過... モーダル: ${modalVisible ? 'Yes' : 'No'}, 分析中: ${isLoading ? 'Yes' : 'No'}`);

      // 途中経過のスクリーンショット
      const progressPath = path.join(reportsDir, `headless-progress-${timestamp}-${i}.png`);
      await page.screenshot({ path: progressPath, fullPage: true });

      if (modalVisible) {
        console.log('   ✅ モーダルが表示されました');
        break;
      }
    }

    // モーダル表示状態のスクリーンショット
    const modalPath = path.join(reportsDir, `headless-modal-${timestamp}.png`);
    await page.screenshot({ path: modalPath, fullPage: true });
    console.log(`\n6. モーダル状態のスクリーンショット: ${modalPath}`);

    if (!modalVisible) {
      console.log('\n⚠️ モーダルが60秒以内に表示されませんでした');
      await browser.close();
      return;
    }

    // 「送信プロンプト」セクションを探す
    console.log('\n7. 「送信プロンプト」セクションを探索中...');
    const promptToggle = page.locator('button:has-text("送信プロンプト")');
    const promptToggleVisible = await promptToggle.isVisible().catch(() => false);

    if (promptToggleVisible) {
      console.log('   ✅ 「送信プロンプト」ボタンを発見');
      await promptToggle.click();
      await page.waitForTimeout(500);

      // プロンプト展開後のスクリーンショット
      const expandedPath = path.join(reportsDir, `headless-prompt-expanded-${timestamp}.png`);
      await page.screenshot({ path: expandedPath, fullPage: true });
      console.log(`\n8. プロンプト展開後: ${expandedPath}`);

      // プロンプト内容を取得
      const promptContent = page.locator('pre');
      const promptText = await promptContent.textContent().catch(() => null);

      if (promptText) {
        console.log('\n=== 表示されたプロンプト（先頭500文字） ===');
        console.log(promptText.substring(0, 500));
        console.log('...');

        // テキストファイルに保存
        const textPath = path.join(reportsDir, `headless-prompt-${timestamp}.txt`);
        fs.writeFileSync(textPath, promptText);
        console.log(`\nプロンプト内容保存: ${textPath}`);
      }
    } else {
      console.log('   ⚠️ 「送信プロンプト」ボタンが見つかりません');
    }

    console.log('\n=== テスト完了 ===');
    console.log('最終スクリーンショット:');
    console.log(`  - ${modalPath}`);

  } catch (error) {
    console.error('\n❌ エラー:', error);
    const errorPath = path.join(reportsDir, `headless-error-${timestamp}.png`);
    await page.screenshot({ path: errorPath, fullPage: true });
  } finally {
    await browser.close();
  }
}

capturePromptDisplayScreenshot();
