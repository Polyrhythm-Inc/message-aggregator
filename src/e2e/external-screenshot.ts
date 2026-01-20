import { chromium } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * 外部URLにアクセスして自動設定モーダルのスクリーンショットを撮影
 */
async function capturePromptDisplayScreenshot() {
  // ローカル環境でテスト（ngrokはバックエンドが起動していない可能性）
  const targetUrl = process.env.TEST_URL || 'http://localhost:5100/';
  const reportsDir = path.join(__dirname, '../../reports');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  // reportsディレクトリがなければ作成
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  console.log('=== E2E テスト開始 ===');
  console.log(`対象URL: ${targetUrl}`);
  console.log(`出力先: ${reportsDir}`);

  // headlessモードで実行（CI環境/QAテスト用）
  const browser = await chromium.launch({
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
  });
  const page = await context.newPage();

  // コンソールログを収集
  const consoleLogs: string[] = [];
  page.on('console', (msg) => {
    const logEntry = `[${msg.type()}] ${msg.text()}`;
    consoleLogs.push(logEntry);
    console.log(`   📝 ${logEntry}`);
  });

  // ネットワークリクエストを監視
  page.on('request', (request) => {
    if (request.url().includes('/api/projects/')) {
      console.log(`   🌐 リクエスト: ${request.method()} ${request.url()}`);
    }
  });

  page.on('response', async (response) => {
    if (response.url().includes('/api/projects/')) {
      const status = response.status();
      console.log(`   📨 レスポンス: ${status} ${response.url()}`);
      if (status !== 200) {
        try {
          const body = await response.text();
          console.log(`   📨 レスポンス本文: ${body.substring(0, 500)}`);
        } catch {
          // ignore
        }
      }
    }
  });

  try {
    // ページにアクセス
    console.log('\n1. ページにアクセス中...');
    await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 });
    console.log('   ✅ ページにアクセス成功');

    // メッセージ一覧が表示されるまで待機
    console.log('\n2. メッセージ一覧の読み込みを待機中...');
    await page.waitForTimeout(3000);

    // 自動設定ボタンを探す（複数のセレクターを試行）
    console.log('\n3. 自動設定ボタンを探索中...');

    // ページ内のすべてのボタンを確認
    const allButtons = await page.locator('button').all();
    console.log(`   ページ内のボタン数: ${allButtons.length}`);

    // 「自動設定」テキストを含むボタンを探す
    const autoButtons = await page.locator('button:has-text("自動設定")').all();
    console.log(`   「自動設定」ボタン数: ${autoButtons.length}`);

    for (let i = 0; i < Math.min(autoButtons.length, 5); i++) {
      const btnText = await autoButtons[i].textContent();
      const isVis = await autoButtons[i].isVisible();
      console.log(`   ボタン${i + 1}: "${btnText?.trim()}" (visible: ${isVis})`);
    }

    // 最初の自動設定ボタンを取得
    const autoAssignButton = page.locator('button:has-text("自動設定")').first();
    const isVisible = await autoAssignButton.isVisible().catch(() => false);

    if (!isVisible) {
      console.log('   ❌ 自動設定ボタンが見つかりません');

      // スクリーンショットを保存（エラー状態）
      const errorScreenshotPath = path.join(reportsDir, `e2e-error-no-button-${timestamp}.png`);
      await page.screenshot({ path: errorScreenshotPath, fullPage: true });
      console.log(`   スクリーンショット保存: ${errorScreenshotPath}`);

      await browser.close();
      return;
    }

    // ボタンの位置とサイズを確認
    const boundingBox = await autoAssignButton.boundingBox();
    console.log(`   ✅ 自動設定ボタンを発見 (位置: x=${boundingBox?.x}, y=${boundingBox?.y}, w=${boundingBox?.width}, h=${boundingBox?.height})`);

    // スクリーンショット1: ボタンクリック前
    const beforeClickPath = path.join(reportsDir, `e2e-before-click-${timestamp}.png`);
    await page.screenshot({ path: beforeClickPath, fullPage: true });
    console.log(`\n4. ボタンクリック前のスクリーンショット: ${beforeClickPath}`);

    // ボタンをクリック（複数の方法を試行）
    console.log('\n5. 自動設定ボタンをクリック中...');

    // スクロールしてビューに表示
    await autoAssignButton.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);

    // ボタンのテキストを取得して確認
    const buttonText = await autoAssignButton.textContent();
    console.log(`   ボタンテキスト: "${buttonText}"`);

    // クリック前にボタンの状態を確認
    const isDisabled = await autoAssignButton.isDisabled();
    console.log(`   ボタン無効化状態: ${isDisabled}`);

    // ボタンの詳細情報を取得
    const buttonInfo = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const autoSettingButtons = buttons.filter(btn => btn.textContent?.trim() === '自動設定');
      return autoSettingButtons.map((btn, i) => ({
        index: i,
        className: btn.className,
        parentClassName: btn.parentElement?.className || '',
        grandparentClassName: btn.parentElement?.parentElement?.className || '',
        outerHTML: btn.outerHTML.substring(0, 200),
      }));
    });
    console.log('   「自動設定」ボタンの詳細:');
    buttonInfo.slice(0, 3).forEach((info, i) => {
      console.log(`   [${i}] class="${info.className}"`);
      console.log(`       parent="${info.parentClassName}"`);
      console.log(`       HTML: ${info.outerHTML}...`);
    });

    // min-w-[100px]クラスを持つ自動設定ボタンを探す
    console.log('   min-w-[100px]クラスを持つボタンを探索...');
    const targetButton = page.locator('button.min-w-\\[100px\\]').first();
    const targetText = await targetButton.textContent();
    console.log(`   ターゲットボタンテキスト: "${targetText}"`);

    // Playwrightでクリック
    console.log('   Playwrightでクリックを実行...');
    await targetButton.click({ timeout: 5000 });
    console.log('   ✅ クリック実行完了');

    // クリック直後に少し待ってからスクリーンショット
    await page.waitForTimeout(500);
    const afterClickPath = path.join(reportsDir, `e2e-after-click-${timestamp}.png`);
    await page.screenshot({ path: afterClickPath, fullPage: true });
    console.log(`   クリック直後のスクリーンショット: ${afterClickPath}`);

    // クリック後のボタン状態を確認
    const buttonTextAfter = await autoAssignButton.textContent();
    console.log(`   クリック後ボタンテキスト: "${buttonTextAfter}"`);

    // モーダル表示を待機（APIレスポンスに時間がかかる可能性があるため長めに設定）
    console.log('\n6. AI判定結果モーダルの表示を待機中（最大120秒）...');
    const modal = page.locator('text=AI判定結果');
    let modalVisible = false;

    // 120秒間、5秒ごとにモーダルの表示を確認
    for (let i = 0; i < 24; i++) {
      await page.waitForTimeout(5000);

      // 分析中かどうかを確認（複数の方法で検出）
      const isLoading1 = await page.locator('text=分析中').isVisible().catch(() => false);
      const isLoading2 = await page.locator('button:has-text("分析中")').isVisible().catch(() => false);
      const isLoading3 = await page.locator('.animate-spin').first().isVisible().catch(() => false);
      const isLoading = isLoading1 || isLoading2 || isLoading3;

      modalVisible = await modal.isVisible().catch(() => false);
      console.log(`   ${(i + 1) * 5}秒経過... モーダル表示: ${modalVisible ? 'Yes' : 'No'}, 分析中: ${isLoading ? 'Yes' : 'No'} (text:${isLoading1}, btn:${isLoading2}, spin:${isLoading3})`);

      if (modalVisible) {
        console.log('   ✅ モーダルが表示されました');
        break;
      }

      // 分析中でもなくモーダルも表示されていない場合（エラーの可能性）- 10回(50秒)以降でチェック
      if (!isLoading && i > 10) {
        console.log('   ⚠️ 処理が完了しましたがモーダルが表示されていません');
        // 画面の状態を確認するためにスクリーンショットを撮影
        const checkPath = path.join(reportsDir, `e2e-check-${timestamp}-${i}.png`);
        await page.screenshot({ path: checkPath, fullPage: true });
        break;
      }
    }

    if (!modalVisible) {
      console.log('   ⚠️ モーダルが表示されませんでした');
    }

    // モーダル表示後のスクリーンショット
    const modalVisiblePath = path.join(reportsDir, `e2e-modal-visible-${timestamp}.png`);
    await page.screenshot({ path: modalVisiblePath, fullPage: true });
    console.log(`\n7. モーダル表示後のスクリーンショット: ${modalVisiblePath}`);

    // モーダルが表示されていない場合は終了
    if (!modalVisible) {
      console.log('\n=== テスト終了（モーダル未表示） ===');
      await browser.close();
      return;
    }

    // 「送信プロンプト」セクションを探す
    console.log('\n8. 「送信プロンプト」セクションを探索中...');
    const promptToggle = page.locator('button:has-text("送信プロンプト")');
    const promptToggleVisible = await promptToggle.isVisible().catch(() => false);

    if (promptToggleVisible) {
      console.log('   ✅ 「送信プロンプト」ボタンを発見');

      // クリックして展開
      await promptToggle.click();
      await page.waitForTimeout(500);

      // プロンプト展開後のスクリーンショット
      const promptExpandedPath = path.join(reportsDir, `e2e-prompt-expanded-${timestamp}.png`);
      await page.screenshot({ path: promptExpandedPath, fullPage: true });
      console.log(`\n9. プロンプト展開後のスクリーンショット: ${promptExpandedPath}`);

      // プロンプト内容を取得
      const promptContent = page.locator('pre');
      const promptText = await promptContent.textContent().catch(() => null);

      if (promptText) {
        // プロンプト内容をテキストファイルに保存
        const promptContentPath = path.join(reportsDir, `e2e-prompt-content-${timestamp}.txt`);
        fs.writeFileSync(promptContentPath, `=== プロンプト表示確認 ===\n\n日時: ${new Date().toLocaleString('ja-JP')}\nURL: ${targetUrl}\n\n=== 表示されたプロンプト ===\n${promptText}\n`);
        console.log(`\n10. プロンプト内容保存: ${promptContentPath}`);
        console.log('\n=== 表示されたプロンプト（先頭500文字） ===');
        console.log(promptText.substring(0, 500));
        console.log('...');
      }
    } else {
      console.log('   ⚠️ 「送信プロンプト」ボタンが見つかりません');
    }

    console.log('\n=== テスト完了 ===');
    console.log('保存されたスクリーンショット:');
    console.log(`  - ${beforeClickPath}`);
    console.log(`  - ${modalVisiblePath}`);
    if (promptToggleVisible) {
      console.log(`  - ${path.join(reportsDir, `e2e-prompt-expanded-${timestamp}.png`)}`);
    }

  } catch (error) {
    console.error('\n❌ エラーが発生しました:', error);

    // エラー時のスクリーンショット
    const errorPath = path.join(reportsDir, `e2e-error-${timestamp}.png`);
    await page.screenshot({ path: errorPath, fullPage: true });
    console.log(`エラー時スクリーンショット: ${errorPath}`);
  } finally {
    await browser.close();
  }
}

capturePromptDisplayScreenshot();
