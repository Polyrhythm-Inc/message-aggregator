import { chromium } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * 長時間待機テスト - 最大5分待機してモーダル表示を確認
 */
async function longWaitTest() {
  const targetUrl = 'https://msg-agg-poly.au.ngrok.io/';
  const reportsDir = path.join(__dirname, '../../reports');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  console.log('=== 長時間待機テスト（最大5分） ===');
  console.log(`対象URL: ${targetUrl}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
  });
  const page = await context.newPage();

  try {
    // ページにアクセス
    console.log('\n1. ページにアクセス中...');
    await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
    console.log('   ✅ ページ読み込み完了');

    // メッセージ行内の「自動設定」ボタンを探す
    const inlineAutoButtons = page.locator('button:has-text("自動設定"):not(:has(svg))');
    const inlineButtonCount = await inlineAutoButtons.count();
    console.log(`   メッセージ行内ボタン数: ${inlineButtonCount}`);

    if (inlineButtonCount === 0) {
      console.log('   ❌ 自動設定ボタンが見つかりません');
      await browser.close();
      return;
    }

    // 初期状態のスクリーンショット
    const initialPath = path.join(reportsDir, `long-wait-initial-${timestamp}.png`);
    await page.screenshot({ path: initialPath });
    console.log(`   初期状態: ${initialPath}`);

    // 最初のボタンをクリック
    const firstButton = inlineAutoButtons.first();
    console.log('\n2. 一番上のメッセージの自動設定ボタンをクリック...');
    await firstButton.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await firstButton.click();
    console.log('   ✅ クリック完了');

    // 最大5分（300秒）待機
    console.log('\n3. AI判定結果モーダルを待機中（最大5分）...');
    const modal = page.locator('text=AI判定結果');
    let modalVisible = false;

    for (let i = 0; i < 60; i++) {
      await page.waitForTimeout(5000);

      const isLoading = await page.locator('text=分析中').isVisible().catch(() => false);
      modalVisible = await modal.isVisible().catch(() => false);

      console.log(`   ${(i + 1) * 5}秒経過... モーダル: ${modalVisible ? 'Yes' : 'No'}, 分析中: ${isLoading ? 'Yes' : 'No'}`);

      if (modalVisible) {
        console.log('   ✅ モーダルが表示されました！');
        break;
      }

      // 分析中でもない場合（エラーまたは完了）
      if (!isLoading && i > 10) {
        const checkPath = path.join(reportsDir, `long-wait-check-${timestamp}-${i}.png`);
        await page.screenshot({ path: checkPath });
        console.log(`   中間スクリーンショット: ${checkPath}`);

        // ページ内にAI判定結果があるか確認
        const pageContent = await page.content();
        if (pageContent.includes('AI判定結果')) {
          console.log('   ページ内にAI判定結果テキストが存在します');
        }
      }
    }

    // 最終状態のスクリーンショット
    const finalPath = path.join(reportsDir, `long-wait-final-${timestamp}.png`);
    await page.screenshot({ path: finalPath });
    console.log(`\n4. 最終状態: ${finalPath}`);

    if (!modalVisible) {
      console.log('\n⚠️ モーダルが5分以内に表示されませんでした');
      await browser.close();
      return;
    }

    // 「送信プロンプト」セクションを探す
    console.log('\n5. 「送信プロンプト」セクションを探索中...');
    const promptToggle = page.locator('button:has-text("送信プロンプト")');
    const promptToggleVisible = await promptToggle.isVisible().catch(() => false);

    if (promptToggleVisible) {
      console.log('   ✅ 「送信プロンプト」ボタンを発見');
      await promptToggle.click();
      await page.waitForTimeout(500);

      // プロンプト展開後のスクリーンショット
      const expandedPath = path.join(reportsDir, `long-wait-prompt-expanded-${timestamp}.png`);
      await page.screenshot({ path: expandedPath });
      console.log(`\n6. プロンプト展開後: ${expandedPath}`);

      // プロンプト内容を取得
      const promptPre = page.locator('pre');
      const promptText = await promptPre.textContent().catch(() => null);

      if (promptText && promptText.length > 10) {
        console.log('\n=== プロンプトが正しく表示されています ===');
        console.log(`プロンプト長さ: ${promptText.length}文字`);
        console.log('\n先頭500文字:');
        console.log(promptText.substring(0, 500));

        // テキストファイルに保存
        const textPath = path.join(reportsDir, `long-wait-prompt-${timestamp}.txt`);
        fs.writeFileSync(textPath, promptText);
        console.log(`\nプロンプト保存: ${textPath}`);
      }
    }

    console.log('\n=== テスト完了 ===');

  } catch (error) {
    console.error('\n❌ エラー:', error);
    const errorPath = path.join(reportsDir, `long-wait-error-${timestamp}.png`);
    await page.screenshot({ path: errorPath });
  } finally {
    await browser.close();
  }
}

longWaitTest();
