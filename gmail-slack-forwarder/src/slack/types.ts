import type { KnownBlock, Block } from '@slack/web-api';

export type SlackBlock = KnownBlock | Block;

export interface SlackPostResult {
  ok: boolean;
  ts?: string;
  channel?: string;
  error?: string;
}

export interface SlackFormattedMessage {
  blocks: SlackBlock[];
  text: string;
}

export interface AttachmentUploadRequest {
  channelId: string;
  threadTs: string;
  filename: string;
  content: Buffer;
  mimeType?: string;
}
