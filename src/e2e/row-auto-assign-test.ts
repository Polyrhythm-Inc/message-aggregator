import { chromium } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * メッセージ行の自動設定ボタンをクリックしてモーダルを確認するテスト
 */
async function testRowAutoAssign() {
  const targetUrl = 'https://msg-agg-poly.au.ngrok.io/';
  const reportsDir = path.join(__dirname, '../../reports');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  console.log('=== メッセージ行自動設定ボタンテスト ===');
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

    // 初期状態のスクリーンショット
    const initialPath = path.join(reportsDir, `row-test-initial-${timestamp}.png`);
    await page.screenshot({ path: initialPath, fullPage: true });
    console.log(`   初期状態: ${initialPath}`);

    // メッセージ行を探す
    // メッセージ一覧のコンテナを特定
    console.log('\n2. メッセージ行を探索中...');

    // 各メッセージ行内にある「自動設定」ボタンを探す
    // グローバルのドロップダウンボタンではなく、行内のボタンを探す
    // ProjectAutoAssignButton は min-w-[100px] クラスを持ち、紫色のテキスト
    const rowAutoButtons = await page.locator('button:has-text("自動設定")').all();
    console.log(`   「自動設定」ボタン総数: ${rowAutoButtons.length}`);

    // グローバルボタン（ドロップダウン）は上部にあり、矢印アイコンを含む
    // 行ごとのボタンは矢印アイコンを含まない
    // min-w-[100px] クラスを持つボタンが行ごとのボタン
    const inlineAutoButtons = page.locator('button:has-text("自動設定"):not(:has(svg))');
    const inlineButtonCount = await inlineAutoButtons.count();
    console.log(`   メッセージ行内ボタン数: ${inlineButtonCount}`);

    if (inlineButtonCount === 0) {
      // SVGを含まないボタンがない場合、別の方法で探す
      // 行内ボタンはtext-purple-600クラスを持つ
      const purpleButtons = page.locator('button.text-purple-600:has-text("自動設定"), button.text-purple-400:has-text("自動設定")');
      const purpleCount = await purpleButtons.count();
      console.log(`   紫色テキストボタン数: ${purpleCount}`);

      if (purpleCount > 0) {
        const firstPurpleButton = purpleButtons.first();
        console.log('\n3. 一番上のメッセージの自動設定ボタンをクリック...');
        await firstPurpleButton.scrollIntoViewIfNeeded();
        await page.waitForTimeout(500);
        await firstPurpleButton.click();
        console.log('   ✅ クリック完了');
      }
    } else {
      // メッセージ行内の最初のボタンをクリック
      const firstButton = inlineAutoButtons.first();
      console.log('\n3. 一番上のメッセージの自動設定ボタンをクリック...');
      await firstButton.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      await firstButton.click();
      console.log('   ✅ クリック完了');
    }

    // クリック直後のスクリーンショット
    await page.waitForTimeout(1000);
    const afterClickPath = path.join(reportsDir, `row-test-after-click-${timestamp}.png`);
    await page.screenshot({ path: afterClickPath, fullPage: true });
    console.log(`   クリック直後: ${afterClickPath}`);

    // 分析中状態を確認
    console.log('\n4. AI分析を待機中...');
    const loadingButton = page.locator('button:has-text("分析中")');

    for (let i = 0; i < 24; i++) {
      const isLoading = await loadingButton.isVisible().catch(() => false);
      console.log(`   ${(i + 1) * 5}秒経過... 分析中: ${isLoading ? 'Yes' : 'No'}`);

      if (!isLoading && i > 0) {
        // 分析が完了した可能性
        break;
      }
      await page.waitForTimeout(5000);
    }

    // モーダルを探す（「AI判定結果」テキスト）
    console.log('\n5. AI判定結果モーダルを確認中...');
    const modal = page.locator('text=AI判定結果');
    const modalVisible = await modal.isVisible().catch(() => false);
    console.log(`   モーダル表示: ${modalVisible ? 'Yes' : 'No'}`);

    // モーダル表示状態のスクリーンショット
    const modalPath = path.join(reportsDir, `row-test-modal-${timestamp}.png`);
    await page.screenshot({ path: modalPath, fullPage: true });
    console.log(`   モーダル状態: ${modalPath}`);

    if (!modalVisible) {
      console.log('\n⚠️ モーダルが表示されませんでした');
      // 追加のデバッグ情報
      const pageContent = await page.content();
      if (pageContent.includes('AI判定結果')) {
        console.log('   ページ内にAI判定結果テキストが存在します');
      }
      await browser.close();
      return;
    }

    // 「送信プロンプト」ボタンをクリックして展開
    console.log('\n6. 「送信プロンプト」セクションを展開...');
    const promptToggle = page.locator('button:has-text("送信プロンプト")');
    const promptToggleVisible = await promptToggle.isVisible().catch(() => false);

    if (promptToggleVisible) {
      await promptToggle.click();
      await page.waitForTimeout(500);

      // プロンプト展開後のスクリーンショット
      const expandedPath = path.join(reportsDir, `row-test-prompt-expanded-${timestamp}.png`);
      await page.screenshot({ path: expandedPath, fullPage: true });
      console.log(`   ✅ プロンプト展開後: ${expandedPath}`);

      // プロンプト内容を取得
      const promptPre = page.locator('pre');
      const promptText = await promptPre.textContent().catch(() => null);

      if (promptText && promptText.length > 10) {
        console.log('\n=== プロンプトが正しく表示されています ===');
        console.log(`プロンプト長さ: ${promptText.length}文字`);
        console.log('\n先頭500文字:');
        console.log(promptText.substring(0, 500));

        // テキストファイルに保存
        const textPath = path.join(reportsDir, `row-test-prompt-${timestamp}.txt`);
        fs.writeFileSync(textPath, promptText);
        console.log(`\nプロンプト保存: ${textPath}`);
      } else {
        console.log('   ⚠️ プロンプト内容が空または短すぎます');
      }
    } else {
      console.log('   ⚠️ 「送信プロンプト」ボタンが見つかりません');
    }

    console.log('\n=== テスト完了 ===');
    console.log('最終スクリーンショット:');
    console.log(`  - ${modalPath}`);

  } catch (error) {
    console.error('\n❌ エラー:', error);
    const errorPath = path.join(reportsDir, `row-test-error-${timestamp}.png`);
    await page.screenshot({ path: errorPath, fullPage: true });
  } finally {
    await browser.close();
  }
}

testRowAutoAssign();
