const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

async function checkSiteAccess() {
  const targetUrl = 'http://127.0.0.1:5100/';
  const reportsDir = path.join(__dirname, '../reports');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  console.log('=== サイトアクセス確認 ===');
  console.log('対象URL:', targetUrl);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  try {
    console.log('ページにアクセス中...');
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    console.log('✅ ページにアクセス成功');

    // 少し待機してコンテンツが読み込まれるのを待つ
    await page.waitForTimeout(3000);

    // スクリーンショット撮影
    const screenshotPath = path.join(reportsDir, 'site-access-check-' + timestamp + '.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log('スクリーンショット保存:', screenshotPath);

    // ページタイトルを取得
    const title = await page.title();
    console.log('ページタイトル:', title);

    // ボタン数を確認
    const buttonCount = await page.locator('button').count();
    console.log('ボタン数:', buttonCount);

    // 自動設定ボタンの有無を確認
    const autoAssignButtonCount = await page.locator('button:has-text("自動設定")').count();
    console.log('自動設定ボタン数:', autoAssignButtonCount);

  } catch (e) {
    console.error('❌ エラー:', e.message || String(e));
    const errorPath = path.join(reportsDir, 'site-access-error-' + timestamp + '.png');
    await page.screenshot({ path: errorPath, fullPage: true });
    console.log('エラースクリーンショット:', errorPath);
  } finally {
    await browser.close();
  }
}

checkSiteAccess();
