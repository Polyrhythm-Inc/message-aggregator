export type ChatworkWebhookEvent = {
  body: string;
  room_id: number;
  message_id: string;
  from_account_id: number;
};

export type ChatworkWebhookInput = {
  chatwork_webhook_signature: string;
  webhook_event?: ChatworkWebhookEvent;
};

export type ChatworkAccountInfo = {
  account_id: number;
  name: string;
  chatwork_id?: string;
  organization_id?: number;
  organization_name?: string;
  department?: string;
  title?: string;
  url?: string;
  introduction?: string;
  mail?: string;
  tel_organization?: string;
  tel_extension?: string;
  tel_mobile?: string;
  skype?: string;
  facebook?: string;
  twitter?: string;
  avatar_image_url?: string;
  login_mail?: string;
};

export type ChatworkRoomInfo = {
  room_id: number;
  name: string;
  type: string;
  role: string;
  sticky: boolean;
  unread_num: number;
  mention_num: number;
  mytask_num: number;
  message_num: number;
  file_num: number;
  task_num: number;
  icon_path: string;
  last_update_time: number;
  description?: string;
}; 