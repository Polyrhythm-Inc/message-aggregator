'use client';

import { useState, useRef, useEffect } from 'react';

// よく使われるリアクションのプリセット
const PRESET_EMOJIS = [
  { name: 'thumbsup', emoji: '👍', label: 'いいね' },
  { name: 'thumbsdown', emoji: '👎', label: 'よくない' },
  { name: 'heart', emoji: '❤️', label: 'ハート' },
  { name: 'eyes', emoji: '👀', label: '確認中' },
  { name: 'white_check_mark', emoji: '✅', label: '完了' },
  { name: 'x', emoji: '❌', label: 'NG' },
  { name: 'pray', emoji: '🙏', label: 'お願い' },
  { name: 'tada', emoji: '🎉', label: '祝' },
  { name: 'thinking_face', emoji: '🤔', label: '考え中' },
  { name: 'fire', emoji: '🔥', label: '素晴らしい' },
  { name: 'rocket', emoji: '🚀', label: 'リリース' },
  { name: 'warning', emoji: '⚠️', label: '注意' },
];

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (emojiName: string) => void;
  loading?: boolean;
};

export default function EmojiPicker({ isOpen, onClose, onSelect, loading }: Props) {
  const [selectedEmoji, setSelectedEmoji] = useState<string | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  // 外側クリックで閉じる
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        onClose();
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  // ESCキーで閉じる
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleEmojiClick = (emojiName: string) => {
    setSelectedEmoji(emojiName);
    onSelect(emojiName);
  };

  return (
    <div
      ref={pickerRef}
      className="absolute right-0 top-full mt-1 z-50 min-w-[200px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3"
    >
      <div className="grid grid-cols-4 gap-2 w-[184px]">
        {PRESET_EMOJIS.map((item) => (
          <button
            key={item.name}
            onClick={() => handleEmojiClick(item.name)}
            disabled={loading}
            className={`w-10 h-10 flex items-center justify-center text-xl hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              selectedEmoji === item.name && loading ? 'bg-blue-100 dark:bg-blue-900' : ''
            }`}
            title={item.label}
          >
            {item.emoji}
          </button>
        ))}
      </div>
      {loading && (
        <div className="text-center text-sm text-gray-500 dark:text-gray-400 mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
          送信中...
        </div>
      )}
    </div>
  );
}
