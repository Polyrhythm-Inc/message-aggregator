'use client';

import { useState } from 'react';
import MessageList from './components/MessageList';

export default function Home() {
  const [deleteMode, setDeleteMode] = useState(false);

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              タスク管理メッセージ
            </h1>
            <button
              onClick={() => setDeleteMode(!deleteMode)}
              className={`px-4 py-2 text-sm rounded-md transition-colors ${
                deleteMode
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              {deleteMode ? '削除モード ON' : '削除モード OFF'}
            </button>
          </div>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            _タスク管理チャンネルの直近のメッセージ
          </p>
        </header>
        <MessageList deleteMode={deleteMode} />
      </div>
    </div>
  );
}
