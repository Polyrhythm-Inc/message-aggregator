import { chromium } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * クイックテスト: 自動設定ボタンクリック → モーダル確認 → スクリーンショット
 */
async function quickPromptTest() {
  const targetUrl = 'https://msg-agg-poly.au.ngrok.io/';
  const reportsDir = path.join(__dirname, '../../reports');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  console.log('=== クイックE2Eテスト開始 ===');
  console.log(`対象URL: ${targetUrl}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  try {
    // ページアクセス
    console.log('\n1. ページにアクセス中...');
    await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    console.log('   ✅ アクセス完了');

    // 初期スクリーンショット
    const initialPath = path.join(reportsDir, `quick-initial-${timestamp}.png`);
    await page.screenshot({ path: initialPath, fullPage: true });
    console.log(`   初期状態: ${initialPath}`);

    // 自動設定ボタンを探す
    console.log('\n2. 自動設定ボタンを探索中...');
    const autoButtons = await page.locator('button:has-text("自動設定")').all();
    console.log(`   ボタン数: ${autoButtons.length}`);

    if (autoButtons.length === 0) {
      console.log('   ❌ 自動設定ボタンが見つかりません');
      await browser.close();
      return;
    }

    // クリック
    console.log('\n3. 一番上の自動設定ボタンをクリック...');
    await autoButtons[0].click();
    console.log('   ✅ クリック完了');

    // 90秒間待機してモーダル表示を待つ
    console.log('\n4. モーダル表示を待機中（最大90秒）...');
    for (let i = 0; i < 18; i++) {
      await page.waitForTimeout(5000);

      const isLoading = await page.locator('text=分析中').isVisible().catch(() => false);
      const modalVisible = await page.locator('text=AI判定結果').isVisible().catch(() => false);

      console.log(`   ${(i + 1) * 5}秒: 分析中=${isLoading}, モーダル=${modalVisible}`);

      if (modalVisible) {
        console.log('\n   ✅ モーダル表示を確認');

        // モーダルのスクリーンショット
        const modalPath = path.join(reportsDir, `quick-modal-${timestamp}.png`);
        await page.screenshot({ path: modalPath, fullPage: true });
        console.log(`   モーダル表示: ${modalPath}`);

        // プロンプト展開
        const promptToggle = page.locator('button:has-text("送信プロンプト")');
        if (await promptToggle.isVisible().catch(() => false)) {
          await promptToggle.click();
          await page.waitForTimeout(500);

          const expandedPath = path.join(reportsDir, `quick-prompt-expanded-${timestamp}.png`);
          await page.screenshot({ path: expandedPath, fullPage: true });
          console.log(`   プロンプト展開: ${expandedPath}`);

          // プロンプトテキスト取得
          const promptContent = await page.locator('pre').textContent().catch(() => null);
          if (promptContent) {
            console.log('\n=== 送信プロンプト（先頭300文字） ===');
            console.log(promptContent.substring(0, 300) + '...');

            // テキスト保存
            const textPath = path.join(reportsDir, `quick-prompt-${timestamp}.txt`);
            fs.writeFileSync(textPath, promptContent);
            console.log(`\nプロンプト保存: ${textPath}`);
          }
        }

        console.log('\n=== テスト成功 ===');
        await browser.close();
        return;
      }
    }

    // タイムアウト
    console.log('\n⚠️ 90秒経過してもモーダルが表示されませんでした');
    const timeoutPath = path.join(reportsDir, `quick-timeout-${timestamp}.png`);
    await page.screenshot({ path: timeoutPath, fullPage: true });

  } catch (error) {
    console.error('\n❌ エラー:', error);
    const errorPath = path.join(reportsDir, `quick-error-${timestamp}.png`);
    await page.screenshot({ path: errorPath, fullPage: true });
  } finally {
    await browser.close();
  }
}

quickPromptTest();
