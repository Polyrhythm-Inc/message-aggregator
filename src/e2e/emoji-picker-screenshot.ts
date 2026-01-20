import { chromium } from '@playwright/test';

async function takeEmojiPickerScreenshot() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  console.log('Accessing message-aggregator...');

  // ローカル環境にアクセス（ポート5100）
  try {
    await page.goto('http://localhost:5101/', { timeout: 15000, waitUntil: 'domcontentloaded' });
  } catch (e) {
    console.log('Goto timeout, continuing anyway...');
  }

  // ページ読み込み完了を待機
  console.log('Waiting for page content...');
  await page.waitForTimeout(8000);

  // ページ全体のスクリーンショット
  await page.screenshot({ path: '/tmp/emoji-picker-1-page.png', fullPage: true });
  console.log('Page screenshot saved');

  // リアクションボタンを探す
  const reactionButton = page.locator('button[title="リアクションを追加"]').first();
  const buttonCount = await page.locator('button[title="リアクションを追加"]').count();
  console.log(`Found ${buttonCount} reaction buttons`);

  if (buttonCount === 0) {
    // 返信ボタンも探してみる
    const replyButtons = await page.locator('button:has-text("返信")').count();
    console.log(`Found ${replyButtons} reply buttons`);

    // すべてのボタンを列挙
    const allButtons = await page.locator('button').all();
    console.log(`Total buttons: ${allButtons.length}`);
    for (let i = 0; i < Math.min(allButtons.length, 10); i++) {
      const text = await allButtons[i].textContent();
      const title = await allButtons[i].getAttribute('title');
      console.log(`Button ${i}: text="${text}", title="${title}"`);
    }

    await browser.close();
    return;
  }

  console.log('Clicking reaction button...');
  await reactionButton.click();
  await page.waitForTimeout(1000);

  // スクリーンショットを撮影
  await page.screenshot({ path: '/tmp/emoji-picker-2-open.png', fullPage: false });
  console.log('Emoji picker screenshot saved');

  // 絵文字ピッカーのCSSクラスを確認
  const pickerElement = page.locator('.absolute.z-50').first();
  const pickerVisible = await pickerElement.isVisible().catch(() => false);
  console.log(`Emoji picker visible: ${pickerVisible}`);

  if (pickerVisible) {
    const classList = await pickerElement.evaluate(el => el.className);
    console.log(`Picker classes: ${classList}`);

    const boundingBox = await pickerElement.boundingBox();
    console.log(`Picker bounding box:`, boundingBox);
  }

  await browser.close();
  console.log('Done!');
}

takeEmojiPickerScreenshot().catch(console.error);
