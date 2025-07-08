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
  event: SlackEvent;
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