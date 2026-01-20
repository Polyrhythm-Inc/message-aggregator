'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import MessageList, { MessageListRef } from './components/MessageList';

export default function Home() {
  const [deleteMode, setDeleteMode] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const messageListRef = useRef<MessageListRef>(null);

  const handleReload = () => {
    messageListRef.current?.reload();
  };

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      {/* 固定ヘッダ */}
      <header className="sticky top-0 z-40 bg-gray-100 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-4xl mx-auto px-4 py-2 flex items-center justify-between">
          <h1 className="text-sm font-medium text-gray-900 dark:text-gray-100">
            Message aggregator
          </h1>
          <div className="flex items-center gap-1">
            <button
              onClick={handleReload}
              className="p-1.5 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md transition-colors"
              title="再読み込み"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            <Link
              href="/projects"
              className="p-1.5 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md transition-colors"
              title="プロジェクト管理"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
            </Link>
            <button
              onClick={() => setDebugMode(!debugMode)}
              className={`px-2 py-1 text-xs rounded-md transition-colors ${
                debugMode
                  ? 'bg-yellow-500 text-white hover:bg-yellow-600'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              }`}
              title="デバッグモード"
            >
              {debugMode ? 'Debug' : 'Debug'}
            </button>
            <button
              onClick={() => setDeleteMode(!deleteMode)}
              className={`px-2 py-1 text-xs rounded-md transition-colors ${
                deleteMode
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              {deleteMode ? '削除ON' : '削除OFF'}
            </button>
          </div>
        </div>
      </header>
      {/* メインコンテンツ */}
      <div className="max-w-4xl mx-auto px-4 py-4">
        <MessageList ref={messageListRef} deleteMode={deleteMode} debugMode={debugMode} />
      </div>
    </div>
  );
}
