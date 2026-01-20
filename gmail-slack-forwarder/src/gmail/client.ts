import { google, gmail_v1 } from 'googleapis';
import { GmailAuth } from './auth.js';
import type { GmailMessageListItem, GmailMessage } from './types.js';

const SLACK_DONE_LABEL = 'slack_done';

export class GmailClient {
  private gmail: gmail_v1.Gmail | null = null;
  private slackDoneLabelId: string | null = null;

  constructor(
    private auth: GmailAuth,
    private tokenPath: string
  ) {}

  async initialize(): Promise<void> {
    const oauth2Client = await this.auth.getAuthenticatedClient(this.tokenPath);
    this.gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // Ensure the slack_done label exists
    await this.ensureLabel(SLACK_DONE_LABEL);
  }

  private async getGmail(): Promise<gmail_v1.Gmail> {
    if (!this.gmail) {
      await this.initialize();
    }
    return this.gmail!;
  }

  async listMessages(query: string, maxResults: number): Promise<GmailMessageListItem[]> {
    const gmail = await this.getGmail();

    const response = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults,
    });

    return (response.data.messages ?? []) as GmailMessageListItem[];
  }

  async getMessage(messageId: string): Promise<GmailMessage> {
    const gmail = await this.getGmail();

    const response = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    });

    return response.data as GmailMessage;
  }

  async getRawMessage(messageId: string): Promise<Buffer> {
    const gmail = await this.getGmail();

    const response = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'raw',
    });

    const rawData = response.data.raw;
    if (!rawData) {
      throw new Error('Raw message data is empty');
    }

    // Convert URL-safe base64 to buffer
    const base64 = rawData.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(base64, 'base64');
  }

  async getAttachment(messageId: string, attachmentId: string): Promise<Buffer> {
    const gmail = await this.getGmail();

    const response = await gmail.users.messages.attachments.get({
      userId: 'me',
      messageId,
      id: attachmentId,
    });

    const data = response.data.data;
    if (!data) {
      throw new Error('Attachment data is empty');
    }

    // Convert URL-safe base64 to buffer
    const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(base64, 'base64');
  }

  async ensureLabel(labelName: string): Promise<string> {
    const gmail = await this.getGmail();

    // Check if label already exists
    const labelsResponse = await gmail.users.labels.list({
      userId: 'me',
    });

    const existingLabel = labelsResponse.data.labels?.find(
      l => l.name?.toLowerCase() === labelName.toLowerCase()
    );

    if (existingLabel?.id) {
      this.slackDoneLabelId = existingLabel.id;
      return existingLabel.id;
    }

    // Create the label
    const createResponse = await gmail.users.labels.create({
      userId: 'me',
      requestBody: {
        name: labelName,
        labelListVisibility: 'labelShow',
        messageListVisibility: 'show',
      },
    });

    const labelId = createResponse.data.id;
    if (!labelId) {
      throw new Error('Failed to create label');
    }

    this.slackDoneLabelId = labelId;
    return labelId;
  }

  async addLabel(messageId: string, labelName: string): Promise<void> {
    const gmail = await this.getGmail();

    let labelId = this.slackDoneLabelId;
    if (!labelId || labelName !== SLACK_DONE_LABEL) {
      labelId = await this.ensureLabel(labelName);
    }

    await gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: {
        addLabelIds: [labelId],
      },
    });
  }
}
