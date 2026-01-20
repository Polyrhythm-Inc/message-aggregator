'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { SlackFile } from '@/types/slack';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  file: SlackFile | null;
};

type FileContent = {
  type: 'image' | 'text' | 'video' | 'audio' | 'pdf' | 'unknown';
  content?: string;
  blobUrl?: string;
  mimeType: string;
};

function getFileType(mimetype: string, filetype: string): FileContent['type'] {
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('video/')) return 'video';
  if (mimetype.startsWith('audio/')) return 'audio';
  if (mimetype === 'application/pdf') return 'pdf';

  // テキストファイルの判定
  const textTypes = ['text/', 'application/json', 'application/javascript', 'application/xml'];
  if (textTypes.some(t => mimetype.startsWith(t))) return 'text';

  const textExtensions = ['txt', 'md', 'json', 'js', 'ts', 'tsx', 'jsx', 'css', 'scss', 'html', 'xml', 'yaml', 'yml', 'sh', 'py', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'hpp', 'sql'];
  if (textExtensions.includes(filetype.toLowerCase())) return 'text';

  return 'unknown';
}

function formatFileSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function SlackFileViewerModal({ isOpen, onClose, file }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<FileContent | null>(null);
  const [copied, setCopied] = useState(false);
  // blob URLのクリーンアップ用ref
  const blobUrlRef = useRef<string | null>(null);

  // ESCキーでモーダルを閉じる
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // モーダル開閉時のbody overflow制御
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  // ファイル内容を取得
  useEffect(() => {
    if (!isOpen || !file) {
      setFileContent(null);
      setLoading(false);
      return;
    }

    // 以前のblob URLをクリーンアップ
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }

    const fetchFile = async () => {
      setLoading(true);
      setError(null);
      setFileContent(null);

      try {
        const fileType = getFileType(file.mimetype, file.filetype);
        const proxyUrl = `/api/slack/files?url=${encodeURIComponent(file.url_private)}`;

        const response = await fetch(proxyUrl);
        if (!response.ok) {
          throw new Error('ファイルの取得に失敗しました');
        }

        if (fileType === 'text') {
          const text = await response.text();
          setFileContent({
            type: 'text',
            content: text,
            mimeType: file.mimetype,
          });
        } else if (fileType === 'image' || fileType === 'video' || fileType === 'audio' || fileType === 'pdf') {
          const blob = await response.blob();
          const blobUrl = URL.createObjectURL(blob);
          // refにblob URLを保存してクリーンアップ可能にする
          blobUrlRef.current = blobUrl;
          setFileContent({
            type: fileType,
            blobUrl,
            mimeType: file.mimetype,
          });
        } else {
          setFileContent({
            type: 'unknown',
            mimeType: file.mimetype,
          });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'エラーが発生しました');
      } finally {
        setLoading(false);
      }
    };

    fetchFile();

    // cleanup: blob URLを解放（refを使用）
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [isOpen, file]);

  const handleCopyContent = useCallback(async () => {
    if (fileContent?.content) {
      await navigator.clipboard.writeText(fileContent.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [fileContent]);

  const handleDownload = useCallback(() => {
    if (file?.permalink) {
      window.open(file.permalink, '_blank');
    }
  }, [file]);

  if (!isOpen || !file) return null;

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <svg className="w-12 h-12 mx-auto text-red-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p className="text-red-500 dark:text-red-400">{error}</p>
          </div>
        </div>
      );
    }

    if (!fileContent) {
      return (
        <div className="flex items-center justify-center h-64">
          <p className="text-gray-500 dark:text-gray-400">ファイルを読み込めませんでした</p>
        </div>
      );
    }

    switch (fileContent.type) {
      case 'image':
        return (
          <div className="flex items-center justify-center overflow-auto max-h-[70vh]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={fileContent.blobUrl}
              alt={file.title}
              className="max-w-full max-h-[70vh] object-contain"
            />
          </div>
        );

      case 'video':
        return (
          <div className="flex items-center justify-center">
            <video
              src={fileContent.blobUrl}
              controls
              autoPlay={false}
              className="max-w-full max-h-[70vh]"
            >
              <source src={fileContent.blobUrl} type={fileContent.mimeType} />
              お使いのブラウザは動画再生に対応していません。
            </video>
          </div>
        );

      case 'audio':
        return (
          <div className="flex items-center justify-center py-8">
            <audio src={fileContent.blobUrl} controls className="w-full max-w-md">
              <source src={fileContent.blobUrl} type={fileContent.mimeType} />
              お使いのブラウザは音声再生に対応していません。
            </audio>
          </div>
        );

      case 'pdf':
        return (
          <div className="h-[70vh]">
            <iframe
              src={fileContent.blobUrl}
              className="w-full h-full border-0"
              title={file.title}
            />
          </div>
        );

      case 'text':
        return (
          <div className="overflow-auto max-h-[70vh]">
            <pre className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg text-sm font-mono whitespace-pre-wrap break-words text-gray-800 dark:text-gray-200">
              {fileContent.content}
            </pre>
          </div>
        );

      default:
        return (
          <div className="flex flex-col items-center justify-center h-64">
            <svg className="w-16 h-16 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              このファイル形式はプレビューできません
            </p>
            <button
              onClick={handleDownload}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              Slackで開く
            </button>
          </div>
        );
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3 min-w-0">
            <svg className="w-5 h-5 text-gray-500 dark:text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <div className="min-w-0">
              <h3 className="font-medium text-gray-900 dark:text-gray-100 truncate">
                {file.title || file.name}
              </h3>
              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <span>{file.filetype.toUpperCase()}</span>
                {file.size && (
                  <>
                    <span>•</span>
                    <span>{formatFileSize(file.size)}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 ml-4 flex-shrink-0">
            {fileContent?.type === 'text' && fileContent.content && (
              <button
                onClick={handleCopyContent}
                className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                title="コピー"
              >
                {copied ? (
                  <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                )}
              </button>
            )}
            <button
              onClick={handleDownload}
              className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
              title="Slackで開く"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
              title="閉じる"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* コンテンツ */}
        <div className="flex-1 overflow-hidden p-4">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}
