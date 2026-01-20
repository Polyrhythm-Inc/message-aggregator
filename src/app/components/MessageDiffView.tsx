'use client';

import { useMemo } from 'react';
import { getDiffLines, DiffLine } from '@/lib/text-diff';

type Props = {
  oldText: string;
  newText: string;
};

export default function MessageDiffView({ oldText, newText }: Props) {
  const diffLines = useMemo(() => {
    return getDiffLines(oldText, newText);
  }, [oldText, newText]);

  // 差分がない場合は何も表示しない
  const hasDiff = diffLines.some(line => line.type !== 'unchanged');
  if (!hasDiff) {
    return null;
  }

  return (
    <div className="font-mono text-sm overflow-x-auto">
      <div className="bg-gray-50 dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-700 p-2">
        {diffLines.map((line, index) => (
          <DiffLineComponent key={index} line={line} />
        ))}
      </div>
    </div>
  );
}

function DiffLineComponent({ line }: { line: DiffLine }) {
  const bgColor = line.type === 'added'
    ? 'bg-green-100 dark:bg-green-900/30'
    : line.type === 'removed'
    ? 'bg-red-100 dark:bg-red-900/30'
    : '';

  const textColor = line.type === 'added'
    ? 'text-green-800 dark:text-green-200'
    : line.type === 'removed'
    ? 'text-red-800 dark:text-red-200'
    : 'text-gray-600 dark:text-gray-400';

  const prefix = line.type === 'added'
    ? '+'
    : line.type === 'removed'
    ? '-'
    : ' ';

  return (
    <div className={`${bgColor} ${textColor} whitespace-pre-wrap break-words`}>
      <span className="select-none mr-2">{prefix}</span>
      {line.content}
    </div>
  );
}
