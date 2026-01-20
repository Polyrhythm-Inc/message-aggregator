// リアクションイベント用の型定義
export type SlackReactionEvent = {
  type: 'reaction_added' | 'reaction_removed';
  user: string;
  reaction: string; // 絵文字名（':'なし）
  item_user?: string; // リアクションされたメッセージの投稿者
  item: {
    type: 'message';
    channel: string;
    ts: string;
  };
  event_ts: string;
};

export type SlackEvent = {
  client_msg_id?: string;
  type: string;
  subtype?: string;
  text?: string;
  user?: string;
  ts: string;
  team?: string;
  channel: string;
  channel_type: string;
  event_ts: string;
  thread_ts?: string;
  parent_user_id?: string;
  // 編集メッセージの場合に含まれる情報
  message?: {
    type: string;
    user: string;
    text?: string;
    ts: string;
    edited?: {
      user: string;
      ts: string;
    };
    blocks?: {
      type: string;
      block_id: string;
      elements?: {
        type: string;
        elements?: {
          type?: string;
          text?: string;
          user_id?: string;
        }[];
      }[];
    }[];
  };
  previous_message?: {
    type: string;
    user: string;
    text?: string;
    ts: string;
  };
  blocks?: {
    type: string;
    block_id: string;
    elements?: {
      type: string;
      elements?: {
        type?: string;
        text?: string;
        user_id?: string;
      }[];
    }[];
  }[];
  attachments?: {
    id: number;
    color?: string;
    title: string;
    text: string;
    fallback: string;
  }[];
  files?: {
    id: string;
    name: string;
    title: string;
    mimetype: string;
    url_private: string;
    permalink: string;
  }[];
};

export type SlackWebhook = {
  token: string;
  team_id: string;
  context_team_id: string;
  context_enterprise_id: string | null;
  api_app_id: string;
  event: SlackEvent | SlackReactionEvent;
  type: string;
  challenge?: string;
  event_id: string;
  event_time: number;
  authorizations: {
    enterprise_id: null;
    team_id: string;
    user_id: string;
    is_bot: boolean;
    is_enterprise_install: boolean;
  }[];
  is_ext_shared_channel: boolean;
  event_context: string;
};

// 型ガード関数
export function isReactionEvent(event: SlackEvent | SlackReactionEvent): event is SlackReactionEvent {
  return event.type === 'reaction_added' || event.type === 'reaction_removed';
}

export function isMessageEvent(event: SlackEvent | SlackReactionEvent): event is SlackEvent {
  return !isReactionEvent(event);
}

// メール添付ファイル用の型
export type SlackEmailFile = {
  filetype: string;
  subject?: string;
  plain_text?: string;
  from?: { address: string; name: string }[];
};

// Block要素の型定義（詳細）
export type SlackBlock = {
  type: string;
  block_id?: string;
  text?: {
    type: string;
    text: string;
    emoji?: boolean;
    verbatim?: boolean;
  };
  elements?: Array<{
    type: string;
    text?: string;
    verbatim?: boolean;
  }>;
};

// 添付ファイルの型定義
export type SlackFile = {
  id: string;
  name: string;
  title: string;
  mimetype: string;
  filetype: string;
  url_private: string;
  permalink: string;
  size?: number;
  thumb_64?: string;
  thumb_80?: string;
  thumb_360?: string;
  thumb_480?: string;
};

// メッセージ一覧表示用の型
export type SlackMessage = {
  ts: string;
  text: string;
  user?: string;
  userName?: string;
  subtype?: string;
  bot_id?: string;
  blocks?: SlackBlock[];
  email?: {
    subject: string;
    body: string;
    from: string;
    to?: string;
  };
  files?: SlackFile[];
  external_project_id?: string | null;
};

export type MessagesResponse = {
  messages: SlackMessage[];
  hasMore: boolean;
};

// Slack返信APIのリクエスト型
export type SlackReplyRequest = {
  workspace: string;
  channelId: string;
  threadTs: string;
  text: string;
};

// Slack返信APIのレスポンス型
export type SlackReplyResponse = {
  success: boolean;
  error?: string;
  messageTs?: string;
};

// Slackリアクションリクエストの型
export type SlackReactionRequest = {
  channelId: string;
  messageTs: string;
  name: string; // 絵文字名（':'なし。例: 'thumbsup', 'heart'）
};

// Slackリアクションレスポンスの型
export type SlackReactionResponse = {
  success: boolean;
  error?: string;
}; 