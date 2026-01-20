import { WebClient } from '@slack/web-api';
import type { SlackBlock, SlackPostResult, AttachmentUploadRequest } from './types.js';

export class SlackClient {
  private client: WebClient;

  constructor(botToken: string) {
    this.client = new WebClient(botToken);
  }

  async postMessage(
    channelId: string,
    blocks: SlackBlock[],
    text: string
  ): Promise<SlackPostResult> {
    const result = await this.client.chat.postMessage({
      channel: channelId,
      blocks,
      text,
    });

    return {
      ok: result.ok ?? false,
      ts: result.ts,
      channel: result.channel,
      error: result.error,
    };
  }

  async postThreadReply(
    channelId: string,
    threadTs: string,
    blocks: SlackBlock[],
    text: string
  ): Promise<SlackPostResult> {
    const result = await this.client.chat.postMessage({
      channel: channelId,
      thread_ts: threadTs,
      blocks,
      text,
    });

    return {
      ok: result.ok ?? false,
      ts: result.ts,
      channel: result.channel,
      error: result.error,
    };
  }

  async uploadFile(request: AttachmentUploadRequest): Promise<void> {
    await this.client.files.uploadV2({
      channel_id: request.channelId,
      thread_ts: request.threadTs,
      filename: request.filename,
      file: request.content,
    });
  }
}
