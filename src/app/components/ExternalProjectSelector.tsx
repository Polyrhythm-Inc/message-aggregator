'use client';

import { useState, useEffect, useRef } from 'react';
import { ExternalProject } from '@/lib/ai-org-projects-client';

type Props = {
  messageTs: string;
  currentExternalProjectId: string | null;
  // 担当者マッチングで検出されたプロジェクトID（DB未設定時のデフォルト表示用）
  suggestedExternalProjectId?: string | null;
  // 担当者マッチングで検出された担当者名（ツールチップ表示用）
  suggestedContactName?: string | null;
  externalProjects: ExternalProject[];
  onExternalProjectChange: (externalProjectId: string | null) => void;
};

export default function ExternalProjectSelector({
  messageTs,
  currentExternalProjectId,
  suggestedExternalProjectId,
  suggestedContactName,
  externalProjects,
  onExternalProjectChange,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 表示用プロジェクト: DB設定値 > 担当者マッチング結果
  const effectiveProjectId = currentExternalProjectId || suggestedExternalProjectId || null;
  const currentProject = externalProjects.find((p) => p.id === effectiveProjectId) || null;
  // 担当者マッチングで自動検出されたかどうか（DB未設定かつsuggestedがある場合）
  const isAutoDetected = !currentExternalProjectId && !!suggestedExternalProjectId;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = async (externalProjectId: string | null) => {
    if (externalProjectId === currentExternalProjectId) {
      setIsOpen(false);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/slack/messages/${encodeURIComponent(messageTs)}/external-project`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ external_project_id: externalProjectId }),
      });

      if (res.ok) {
        onExternalProjectChange(externalProjectId);
      }
    } catch (error) {
      console.error('外部プロジェクト割り当てに失敗しました', error);
    } finally {
      setSaving(false);
      setIsOpen(false);
    }
  };

  const projectColor = currentProject?.color || '#6366F1';

  // ツールチップテキスト
  const tooltipText = isAutoDetected && suggestedContactName
    ? `担当者「${suggestedContactName}」から自動検出`
    : 'ai-org-projects連携';

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={saving}
        className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors hover:opacity-80 ${saving ? 'opacity-50 cursor-wait' : ''}`}
        style={{
          backgroundColor: currentProject ? `${projectColor}20` : '#6366F120',
          color: currentProject ? projectColor : '#6366F1',
          border: `1px solid ${currentProject ? `${projectColor}40` : '#6366F140'}`,
        }}
        title={tooltipText}
      >
        {/* 自動検出の場合は担当者アイコン、そうでない場合はリンクアイコン */}
        {isAutoDetected ? (
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        ) : (
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
        )}
        <span>{currentProject ? currentProject.name : '外部連携'}</span>
        <svg
          className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 left-0 w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg max-h-64 overflow-y-auto">
          <div className="py-1">
            <div className="px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900">
              ai-org-projects
            </div>

            {/* プロジェクト未設定オプション */}
            <button
              onClick={() => handleSelect(null)}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${
                !currentExternalProjectId
                  ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                  : 'text-gray-600 dark:text-gray-400'
              }`}
            >
              <span className="text-gray-400">(なし)</span>
            </button>

            {externalProjects.length > 0 && (
              <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
            )}

            {/* プロジェクト一覧 */}
            {externalProjects.map((project) => (
              <button
                key={project.id}
                onClick={() => handleSelect(project.id)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 ${
                  currentExternalProjectId === project.id
                    ? 'bg-gray-100 dark:bg-gray-700'
                    : ''
                }`}
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
      )}
    </div>
  );
}
