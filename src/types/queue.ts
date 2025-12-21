/**
 * Slack Queue Item
 * ai-org-slackがポーリングして処理するメッセージキューの型定義
 */
export type SlackQueueItem = {
  id: string;
  channel_id: string;
  thread_ts: string | null;
  user_id: string;
  message_text: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  created_at: string;
  processed_at: string | null;
  error_message: string | null;
};

/**
 * Queue API レスポンス型
 */
export type QueueResponse = {
  success: boolean;
  data?: SlackQueueItem[];
  error?: string;
};

/**
 * Queue 追加リクエスト型
 */
export type QueueAddRequest = {
  channel_id: string;
  thread_ts?: string;
  user_id: string;
  message_text: string;
};

/**
 * Queue ステータス更新リクエスト型
 */
export type QueueUpdateRequest = {
  status: 'processing' | 'completed' | 'failed';
  error_message?: string;
};
