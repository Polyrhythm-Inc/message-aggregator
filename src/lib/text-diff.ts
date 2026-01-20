import { diffLines, formatLines } from 'unidiff';

export type DiffLine = {
  type: 'added' | 'removed' | 'unchanged';
  content: string;
};

/**
 * 2つのテキストを比較し、差分を計算する
 * @param oldText 古いテキスト（比較対象の基準）
 * @param newText 新しいテキスト
 * @returns 差分のunified diff形式の文字列
 */
export function calculateDiff(oldText: string, newText: string): string {
  const diff = diffLines(oldText, newText);
  return formatLines(diff, { context: 3 });
}

/**
 * 2つのテキストを比較し、行ごとの差分を取得する
 * @param oldText 古いテキスト
 * @param newText 新しいテキスト
 * @returns 差分行の配列
 */
export function getDiffLines(oldText: string, newText: string): DiffLine[] {
  const diff = diffLines(oldText, newText);
  const result: DiffLine[] = [];

  for (const part of diff) {
    const lines = part.value.split('\n');
    // 最後の空文字列を除去（split の結果として末尾に空文字列が入ることがある）
    if (lines.length > 0 && lines[lines.length - 1] === '') {
      lines.pop();
    }

    for (const line of lines) {
      if (part.added) {
        result.push({ type: 'added', content: line });
      } else if (part.removed) {
        result.push({ type: 'removed', content: line });
      } else {
        result.push({ type: 'unchanged', content: line });
      }
    }
  }

  return result;
}

/**
 * 差分があるかどうかを判定する
 * @param oldText 古いテキスト
 * @param newText 新しいテキスト
 * @returns 差分がある場合true
 */
export function hasDiff(oldText: string, newText: string): boolean {
  const diff = diffLines(oldText, newText);
  return diff.some(part => part.added || part.removed);
}
