import { describe, it, expect } from 'vitest';
import { parseGmailMessage, truncateBody, splitBody } from '../../src/gmail/message-parser.js';
import type { GmailMessage } from '../../src/gmail/types.js';

describe('parseGmailMessage', () => {
  it('should parse a simple email message', () => {
    const message: GmailMessage = {
      id: 'msg123',
      threadId: 'thread456',
      snippet: 'This is a preview',
      internalDate: '1705589520000',
      payload: {
        headers: [
          { name: 'Subject', value: 'Test Email' },
          { name: 'From', value: 'sender@example.com' },
          { name: 'To', value: 'recipient@example.com' },
          { name: 'Date', value: 'Thu, 18 Jan 2024 16:22:00 +0000' },
        ],
        mimeType: 'text/plain',
        body: {
          data: Buffer.from('Hello, World!').toString('base64'),
        },
      },
    };

    const result = parseGmailMessage(message);

    expect(result.messageId).toBe('msg123');
    expect(result.threadId).toBe('thread456');
    expect(result.subject).toBe('Test Email');
    expect(result.from).toBe('sender@example.com');
    expect(result.to).toBe('recipient@example.com');
    expect(result.body).toBe('Hello, World!');
    expect(result.attachments).toHaveLength(0);
  });

  it('should parse email with name in From header', () => {
    const message: GmailMessage = {
      id: 'msg123',
      threadId: 'thread456',
      payload: {
        headers: [
          { name: 'Subject', value: 'Test' },
          { name: 'From', value: 'John Doe <john@example.com>' },
          { name: 'To', value: 'Jane <jane@example.com>' },
        ],
        mimeType: 'text/plain',
        body: { data: '' },
      },
    };

    const result = parseGmailMessage(message);

    expect(result.from).toBe('John Doe <john@example.com>');
    expect(result.to).toBe('Jane <jane@example.com>');
  });

  it('should handle missing subject', () => {
    const message: GmailMessage = {
      id: 'msg123',
      threadId: 'thread456',
      payload: {
        headers: [
          { name: 'From', value: 'sender@example.com' },
        ],
        mimeType: 'text/plain',
        body: { data: '' },
      },
    };

    const result = parseGmailMessage(message);

    expect(result.subject).toBe('(No Subject)');
  });

  it('should parse multipart message', () => {
    const message: GmailMessage = {
      id: 'msg123',
      threadId: 'thread456',
      payload: {
        mimeType: 'multipart/alternative',
        headers: [
          { name: 'Subject', value: 'Multipart Test' },
          { name: 'From', value: 'sender@example.com' },
          { name: 'To', value: 'recipient@example.com' },
        ],
        parts: [
          {
            mimeType: 'text/plain',
            body: {
              data: Buffer.from('Plain text version').toString('base64'),
            },
          },
          {
            mimeType: 'text/html',
            body: {
              data: Buffer.from('<p>HTML version</p>').toString('base64'),
            },
          },
        ],
      },
    };

    const result = parseGmailMessage(message);

    expect(result.body).toBe('Plain text version');
  });

  it('should extract attachments', () => {
    const message: GmailMessage = {
      id: 'msg123',
      threadId: 'thread456',
      payload: {
        mimeType: 'multipart/mixed',
        headers: [
          { name: 'Subject', value: 'With Attachment' },
          { name: 'From', value: 'sender@example.com' },
          { name: 'To', value: 'recipient@example.com' },
        ],
        parts: [
          {
            mimeType: 'text/plain',
            body: {
              data: Buffer.from('Message body').toString('base64'),
            },
          },
          {
            filename: 'document.pdf',
            mimeType: 'application/pdf',
            body: {
              attachmentId: 'att123',
              size: 12345,
            },
          },
        ],
      },
    };

    const result = parseGmailMessage(message);

    expect(result.body).toBe('Message body');
    expect(result.attachments).toHaveLength(1);
    expect(result.attachments[0]).toEqual({
      attachmentId: 'att123',
      filename: 'document.pdf',
      mimeType: 'application/pdf',
      size: 12345,
    });
  });
});

describe('truncateBody', () => {
  it('should not truncate short body', () => {
    const body = 'Short text';
    const result = truncateBody(body, 100);

    expect(result).toBe(body);
  });

  it('should truncate long body', () => {
    const body = 'A'.repeat(200);
    const result = truncateBody(body, 100);

    expect(result.length).toBeLessThanOrEqual(120); // With truncation message
    expect(result).toContain('(truncated)');
  });

  it('should truncate at newline boundary when possible', () => {
    const body = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5';
    const result = truncateBody(body, 20);

    expect(result).toContain('(truncated)');
  });
});

describe('splitBody', () => {
  it('should not split short body', () => {
    const body = 'Short text';
    const result = splitBody(body, 100);

    expect(result).toEqual([body]);
  });

  it('should split long body into chunks', () => {
    const body = 'A'.repeat(250);
    const result = splitBody(body, 100);

    expect(result.length).toBeGreaterThan(1);
    result.forEach(chunk => {
      expect(chunk.length).toBeLessThanOrEqual(100);
    });
  });

  it('should split at paragraph boundaries when possible', () => {
    const body = 'Paragraph 1\n\nParagraph 2\n\nParagraph 3';
    const result = splitBody(body, 20);

    expect(result.length).toBeGreaterThan(1);
  });
});
