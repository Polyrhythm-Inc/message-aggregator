'use client';

import { useState, useEffect, useRef } from 'react';
import { ExternalProject } from '@/lib/ai-org-projects-client';

type Props = {
  senderName: string;
  senderEmail?: string;
  senderSlackId?: string;
  chatworkRoomId?: string;
  externalProjects: ExternalProject[];
  currentExternalProjectId?: string | null;
};

export default function ContactRegisterButton({
  senderName,
  senderEmail,
  senderSlackId,
  chatworkRoomId,
  externalProjects,
  currentExternalProjectId,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setError(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 成功メッセージを3秒後に消す
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => {
        setSuccess(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  const handleRegister = async (projectId: string) => {
    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/external-projects/${encodeURIComponent(projectId)}/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: senderName,
          email: senderEmail || undefined,
          slackId: senderSlackId || undefined,
          role: 'client',
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '登録に失敗しました');
      }

      setSuccess(true);
      setIsOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '登録に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  // 送信者情報が何もない場合はボタンを表示しない
  if (!senderName && !senderEmail && !senderSlackId && !chatworkRoomId) {
    return null;
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => {
          setIsOpen(!isOpen);
          setError(null);
        }}
        disabled={saving}
        className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors hover:opacity-80 ${
          saving ? 'opacity-50 cursor-wait' : ''
        } ${
          success
            ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 border border-green-300 dark:border-green-700'
            : 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border border-amber-300 dark:border-amber-700'
        }`}
        title="担当者として登録"
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
        </svg>
        <span>{success ? '登録済' : '担当者登録'}</span>
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 left-0 w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg">
          <div className="py-1">
            <div className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
              <div className="font-semibold text-gray-700 dark:text-gray-300 mb-1">
                {senderName || '(名前なし)'}
              </div>
              {senderEmail && (
                <div className="text-gray-500 dark:text-gray-400 truncate">{senderEmail}</div>
              )}
              {senderSlackId && (
                <div className="text-gray-500 dark:text-gray-400">Slack: {senderSlackId}</div>
              )}
              {chatworkRoomId && (
                <div className="text-gray-500 dark:text-gray-400">Chatwork Room: {chatworkRoomId}</div>
              )}
            </div>

            <div className="px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
              登録先プロジェクトを選択
            </div>

            {error && (
              <div className="px-3 py-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border-b border-gray-200 dark:border-gray-700">
                {error}
              </div>
            )}

            <div className="max-h-48 overflow-y-auto">
              {/* 現在割り当てられているプロジェクトを優先表示 */}
              {currentExternalProjectId && (
                <>
                  {externalProjects
                    .filter((p) => p.id === currentExternalProjectId)
                    .map((project) => (
                      <button
                        key={project.id}
                        onClick={() => handleRegister(project.id)}
                        disabled={saving}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 bg-amber-50 dark:bg-amber-900/20"
                      >
                        <span
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: project.color || '#6B7280' }}
                        />
                        <span className="truncate">{project.name}</span>
                        <span className="text-xs text-amber-600 dark:text-amber-400 ml-auto">(現在)</span>
                      </button>
                    ))}
                  <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
                </>
              )}

              {/* その他のプロジェクト */}
              {externalProjects
                .filter((p) => p.id !== currentExternalProjectId)
                .map((project) => (
                  <button
                    key={project.id}
                    onClick={() => handleRegister(project.id)}
                    disabled={saving}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                  >
                    <span
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: project.color || '#6B7280' }}
                    />
                    <span className="truncate">{project.name}</span>
                  </button>
                ))}

              {externalProjects.length === 0 && (
                <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                  プロジェクトがありません
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
