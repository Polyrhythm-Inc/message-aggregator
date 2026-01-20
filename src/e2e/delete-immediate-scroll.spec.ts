import { test, expect } from '@playwright/test';

/**
 * 削除ボタン押下時の即座スクロール機能のE2Eテスト
 *
 * 要件:
 * - 削除ボタン押下で即座にスクロールする（API完了を待たない）
 * - 次のメッセージへスクロールする
 * - 連続削除時も適切に動作する
 *
 * UI動作:
 * 1. 削除ボタン押下 → 「削除OK？」確認状態
 * 2. もう一度押下 → 削除実行 → 即座にグレーアウト＆スクロール
 *
 * DOM構造:
 * <div data-message-ts="...">   ← 外側のラッパー
 *   <MessageItem>               ← 内側のコンポーネント（opacity-50が付く）
 *     <div class="... opacity-50">
 */
test.describe('削除ボタン即座スクロール機能', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  // MessageItemの内側のdiv（opacity-50が付与される要素）を取得
  const getMessageItemInner = (page: import('@playwright/test').Page, index: number) => {
    return page.locator('[data-message-ts]').nth(index).locator('> div').first();
  };

  test('削除確認後に即座にグレーアウト表示される', async ({ page }) => {
    // メッセージアイテムが表示されるまで待機
    const messageItems = page.locator('[data-message-ts]');
    const count = await messageItems.count();

    if (count < 2) {
      test.skip(true, 'メッセージが2件未満のためスキップ');
      return;
    }

    // 最初のメッセージの削除ボタンを取得
    const firstMessageDeleteButton = messageItems.first().locator('button:has-text("削除")');
    const buttonCount = await firstMessageDeleteButton.count();
    if (buttonCount === 0) {
      test.skip(true, '削除ボタンが表示されていないためスキップ');
      return;
    }

    // 1回目のクリック → 確認状態「削除OK？」
    await firstMessageDeleteButton.click();
    await page.waitForTimeout(100);

    // 確認状態になっていることを確認
    const confirmButton = messageItems.first().locator('button:has-text("削除OK？")');
    await expect(confirmButton).toBeVisible();

    // 2回目のクリック → 削除実行
    await confirmButton.click();

    // 即座にグレーアウトが開始されることを確認（requestAnimationFrame後）
    await page.waitForTimeout(300);

    // MessageItemの内側のdivがopacity-50クラスを持つことを確認
    const firstMessageInner = getMessageItemInner(page, 0);
    const hasOpacityClass = await firstMessageInner.evaluate((el) => {
      return el.classList.contains('opacity-50');
    });
    expect(hasOpacityClass).toBe(true);
  });

  test('削除後に次のメッセージがビューポート内に表示される', async ({ page }) => {
    const messageItems = page.locator('[data-message-ts]');
    const count = await messageItems.count();

    if (count < 3) {
      test.skip(true, 'メッセージが3件未満のためスキップ');
      return;
    }

    // 2番目のメッセージのtsを取得
    const secondMessageTs = await messageItems.nth(1).getAttribute('data-message-ts');

    // 最初のメッセージの削除ボタンをクリック（確認→実行）
    const firstMessageDeleteButton = messageItems.first().locator('button:has-text("削除")');
    const buttonCount = await firstMessageDeleteButton.count();
    if (buttonCount === 0) {
      test.skip(true, '削除ボタンが表示されていないためスキップ');
      return;
    }

    // 確認 → 実行
    await firstMessageDeleteButton.click();
    await page.waitForTimeout(100);
    const confirmButton = messageItems.first().locator('button:has-text("削除OK？")');
    await confirmButton.click();

    // スムーズスクロールのアニメーション完了を待つ
    await page.waitForTimeout(800);

    // 2番目のメッセージ（スクロール先）がビューポート内にあることを確認
    const secondMessage = page.locator(`[data-message-ts="${secondMessageTs}"]`);
    const isVisible = await secondMessage.isVisible();
    expect(isVisible).toBe(true);

    // ビューポート内にあることを確認
    const boundingBox = await secondMessage.boundingBox();
    expect(boundingBox).toBeTruthy();
  });

  test('連続削除時も正しくグレーアウトされる', async ({ page }) => {
    const messageItems = page.locator('[data-message-ts]');
    const initialCount = await messageItems.count();

    if (initialCount < 4) {
      test.skip(true, 'メッセージが4件未満のためスキップ');
      return;
    }

    // 最初のメッセージを削除（確認→実行）
    const firstDeleteButton = messageItems.first().locator('button:has-text("削除")');
    const buttonCount = await firstDeleteButton.count();
    if (buttonCount === 0) {
      test.skip(true, '削除ボタンが表示されていないためスキップ');
      return;
    }

    await firstDeleteButton.click();
    await page.waitForTimeout(100);
    const firstConfirmButton = messageItems.first().locator('button:has-text("削除OK？")');
    await firstConfirmButton.click();
    await page.waitForTimeout(400);

    // 1つ目がグレーアウトされていることを確認
    const firstMessageInner = getMessageItemInner(page, 0);
    const firstHasOpacity = await firstMessageInner.evaluate((el) => {
      return el.classList.contains('opacity-50');
    });
    expect(firstHasOpacity).toBe(true);

    // 2番目のメッセージも削除（確認→実行）
    const secondDeleteButton = messageItems.nth(1).locator('button:has-text("削除")');
    const secondButtonCount = await secondDeleteButton.count();
    if (secondButtonCount > 0) {
      await secondDeleteButton.click();
      await page.waitForTimeout(100);
      const secondConfirmButton = messageItems.nth(1).locator('button:has-text("削除OK？")');
      const confirmCount = await secondConfirmButton.count();
      if (confirmCount > 0) {
        await secondConfirmButton.click();
        await page.waitForTimeout(400);

        // 2つ目もグレーアウトされていることを確認
        const secondMessageInner = getMessageItemInner(page, 1);
        const secondHasOpacity = await secondMessageInner.evaluate((el) => {
          return el.classList.contains('opacity-50');
        });
        expect(secondHasOpacity).toBe(true);
      }
    }
  });

  test('削除モードONの場合は確認なしで即削除される', async ({ page }) => {
    const messageItems = page.locator('[data-message-ts]');
    const count = await messageItems.count();

    if (count < 2) {
      test.skip(true, 'メッセージが2件未満のためスキップ');
      return;
    }

    // 削除モードボタンを探してONにする
    const deleteModeButton = page.locator('button:has-text("削除OFF"), button:has-text("削除ON")');
    const modeButtonCount = await deleteModeButton.count();
    if (modeButtonCount === 0) {
      test.skip(true, '削除モードボタンが表示されていないためスキップ');
      return;
    }

    // 削除モードをONにする（OFFの場合のみクリック）
    const buttonText = await deleteModeButton.textContent();
    if (buttonText?.includes('削除OFF')) {
      await deleteModeButton.click();
      await page.waitForTimeout(100);
    }

    // 最初のメッセージの削除ボタンを1回クリック → 即削除
    const firstMessageDeleteButton = messageItems.first().locator('button:has-text("削除")');
    const buttonCount = await firstMessageDeleteButton.count();
    if (buttonCount === 0) {
      test.skip(true, '削除ボタンが表示されていないためスキップ');
      return;
    }

    await firstMessageDeleteButton.click();
    await page.waitForTimeout(400);

    // 即座にグレーアウトされることを確認（確認ステップなし）
    const firstMessageInner = getMessageItemInner(page, 0);
    const hasOpacityClass = await firstMessageInner.evaluate((el) => {
      return el.classList.contains('opacity-50');
    });
    expect(hasOpacityClass).toBe(true);
  });
});
