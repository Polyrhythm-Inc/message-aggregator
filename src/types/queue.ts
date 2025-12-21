/**
 * Slack Queue Item
 * ai-org-slackがポーリングして処理するメッセージキューの型定義
 */
export type SlackQueueItem = {
  id: string;
  channel_id: string;
  thread_ts: string | null;
  message_ts: string;
  user_id: string;
  text: string;
  event_type: 'new_goal' | 'thread_reply';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  session_id: string | null;
  created_at: string;
  updated_at: string;
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
  thread_ts?: string | null;
  message_ts: string;
  user_id: string;
  text: string;
  event_type: 'new_goal' | 'thread_reply';
};

/**
 * Queue ステータス更新リクエスト型
 */
export type QueueUpdateRequest = {
  status: 'processing' | 'completed' | 'failed';
  session_id?: string;
};
