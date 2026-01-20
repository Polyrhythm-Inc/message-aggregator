import type { ParsedEmail } from '../gmail/types.js';
import type { SlackBlock, SlackFormattedMessage } from './types.js';
import type { FormatConfig } from '../config/schema.js';
import { truncateBody } from '../gmail/message-parser.js';

function escapeSlackText(text: string): string {
  // Escape special Slack characters
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatDate(date: Date): string {
  // Format as YYYY-MM-DD HH:mm
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export class SlackFormatter {
  constructor(private formatConfig: FormatConfig) {}

  formatEmail(email: ParsedEmail, accountDisplayName: string): SlackFormattedMessage {
    const blocks: SlackBlock[] = [];

    // Account header
    if (this.formatConfig.includeAccountHeader) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `:email: *[${escapeSlackText(accountDisplayName)}]*`,
        },
      });
    }

    // Subject
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${escapeSlackText(email.subject)}*`,
      },
    });

    // Metadata (From, To, Date)
    const metaLines = [
      `From: ${escapeSlackText(email.from)}`,
      `To: ${escapeSlackText(email.to)}`,
      `Date: ${formatDate(email.date)}`,
    ];

    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: metaLines.join('\n'),
        },
      ],
    });

    // Divider
    blocks.push({
      type: 'divider',
    });

    // Body - escape first, then truncate to ensure final length is within limit
    const body = email.body || email.snippet || '(No content)';
    const escapedBody = escapeSlackText(body);
    const truncatedBody = truncateBody(escapedBody, this.formatConfig.bodyMaxChars);

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: truncatedBody,
      },
    });

    // Attachment info (if any)
    if (email.attachments.length > 0) {
      const attachmentInfo = email.attachments
        .map(a => `:paperclip: ${escapeSlackText(a.filename)} (${formatFileSize(a.size)})`)
        .join('\n');

      blocks.push({
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: attachmentInfo,
          },
        ],
      });
    }

    // Generate plain text fallback
    const plainText = this.generatePlainText(email, accountDisplayName);

    return {
      blocks,
      text: plainText,
    };
  }

  private generatePlainText(email: ParsedEmail, accountDisplayName: string): string {
    const lines = [
      `[${accountDisplayName}]`,
      `Subject: ${email.subject}`,
      `From: ${email.from}`,
      `To: ${email.to}`,
      `Date: ${formatDate(email.date)}`,
      '',
      email.snippet || '(No content)',
    ];

    if (email.attachments.length > 0) {
      lines.push('');
      lines.push(`Attachments: ${email.attachments.map(a => a.filename).join(', ')}`);
    }

    return lines.join('\n');
  }

  formatBodyContinuation(body: string, chunkNumber: number, totalChunks: number): SlackFormattedMessage {
    // Escape and truncate to ensure within Slack's 3000 char limit
    const escapedBody = escapeSlackText(body);
    const truncatedBody = truncateBody(escapedBody, 2900); // Leave room for header

    const blocks: SlackBlock[] = [
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `:page_facing_up: *Continuation (${chunkNumber}/${totalChunks})*`,
          },
        ],
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: truncatedBody,
        },
      },
    ];

    return {
      blocks,
      text: `Continuation (${chunkNumber}/${totalChunks}): ${body.substring(0, 100)}...`,
    };
  }
}
