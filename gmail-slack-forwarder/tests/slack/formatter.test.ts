import { describe, it, expect } from 'vitest';
import { SlackFormatter } from '../../src/slack/formatter.js';
import type { ParsedEmail } from '../../src/gmail/types.js';
import type { FormatConfig } from '../../src/config/schema.js';

describe('SlackFormatter', () => {
  const defaultConfig: FormatConfig = {
    includeAccountHeader: true,
    bodyMaxChars: 4000,
    splitLongBodyIntoThread: true,
    includeGmailPermalink: false,
  };

  const createEmail = (overrides: Partial<ParsedEmail> = {}): ParsedEmail => ({
    messageId: 'msg123',
    threadId: 'thread456',
    subject: 'Test Subject',
    from: 'sender@example.com',
    to: 'recipient@example.com',
    date: new Date('2024-01-18T16:22:00Z'),
    body: 'Test body content',
    attachments: [],
    snippet: 'Test body content',
    ...overrides,
  });

  describe('formatEmail', () => {
    it('should include account header when configured', () => {
      const formatter = new SlackFormatter(defaultConfig);
      const email = createEmail();

      const result = formatter.formatEmail(email, 'account@gmail.com');

      expect(result.blocks.length).toBeGreaterThan(0);
      const firstBlock = result.blocks[0];
      expect(firstBlock.type).toBe('section');
      if (firstBlock.type === 'section' && 'text' in firstBlock) {
        expect(firstBlock.text?.text).toContain('[account@gmail.com]');
      }
    });

    it('should not include account header when disabled', () => {
      const config: FormatConfig = { ...defaultConfig, includeAccountHeader: false };
      const formatter = new SlackFormatter(config);
      const email = createEmail();

      const result = formatter.formatEmail(email, 'account@gmail.com');

      const hasAccountHeader = result.blocks.some(block => {
        if (block.type === 'section' && 'text' in block) {
          return block.text?.text?.includes('[account@gmail.com]');
        }
        return false;
      });
      expect(hasAccountHeader).toBe(false);
    });

    it('should include subject', () => {
      const formatter = new SlackFormatter(defaultConfig);
      const email = createEmail({ subject: 'Important Email' });

      const result = formatter.formatEmail(email, 'account@gmail.com');

      const hasSubject = result.blocks.some(block => {
        if (block.type === 'section' && 'text' in block) {
          return block.text?.text?.includes('Important Email');
        }
        return false;
      });
      expect(hasSubject).toBe(true);
    });

    it('should include From/To/Date in context', () => {
      const formatter = new SlackFormatter(defaultConfig);
      const email = createEmail({
        from: 'alice@example.com',
        to: 'bob@example.com',
      });

      const result = formatter.formatEmail(email, 'account@gmail.com');

      const contextBlock = result.blocks.find(b => b.type === 'context');
      expect(contextBlock).toBeDefined();

      if (contextBlock?.type === 'context' && 'elements' in contextBlock) {
        const text = contextBlock.elements?.find(e => 'text' in e);
        if (text && 'text' in text) {
          expect(text.text).toContain('From: alice@example.com');
          expect(text.text).toContain('To: bob@example.com');
          expect(text.text).toContain('Date:');
        }
      }
    });

    it('should include body content', () => {
      const formatter = new SlackFormatter(defaultConfig);
      const email = createEmail({ body: 'Hello, this is the email body.' });

      const result = formatter.formatEmail(email, 'account@gmail.com');

      const hasBody = result.blocks.some(block => {
        if (block.type === 'section' && 'text' in block) {
          return block.text?.text?.includes('Hello, this is the email body.');
        }
        return false;
      });
      expect(hasBody).toBe(true);
    });

    it('should escape special Slack characters', () => {
      const formatter = new SlackFormatter(defaultConfig);
      const email = createEmail({ body: 'Test <script> & "quotes"' });

      const result = formatter.formatEmail(email, 'account@gmail.com');

      const hasEscaped = result.blocks.some(block => {
        if (block.type === 'section' && 'text' in block) {
          return block.text?.text?.includes('&lt;script&gt;');
        }
        return false;
      });
      expect(hasEscaped).toBe(true);
    });

    it('should include attachment info', () => {
      const formatter = new SlackFormatter(defaultConfig);
      const email = createEmail({
        attachments: [
          { attachmentId: 'att1', filename: 'doc.pdf', mimeType: 'application/pdf', size: 1024 },
          { attachmentId: 'att2', filename: 'image.png', mimeType: 'image/png', size: 2048 },
        ],
      });

      const result = formatter.formatEmail(email, 'account@gmail.com');

      const attachmentContext = result.blocks.find(block => {
        if (block.type === 'context' && 'elements' in block) {
          const text = block.elements?.find(e => 'text' in e);
          return text && 'text' in text && text.text?.includes('doc.pdf');
        }
        return false;
      });
      expect(attachmentContext).toBeDefined();
    });

    it('should generate plain text fallback', () => {
      const formatter = new SlackFormatter(defaultConfig);
      const email = createEmail({ subject: 'Test', snippet: 'Preview text' });

      const result = formatter.formatEmail(email, 'account@gmail.com');

      expect(result.text).toContain('[account@gmail.com]');
      expect(result.text).toContain('Subject: Test');
      expect(result.text).toContain('Preview text');
    });

    it('should truncate long body', () => {
      const config: FormatConfig = { ...defaultConfig, bodyMaxChars: 100 };
      const formatter = new SlackFormatter(config);
      const email = createEmail({ body: 'A'.repeat(500) });

      const result = formatter.formatEmail(email, 'account@gmail.com');

      const bodyBlock = result.blocks.find(block => {
        if (block.type === 'section' && 'text' in block) {
          return block.text?.text?.includes('AAAA');
        }
        return false;
      });

      if (bodyBlock?.type === 'section' && 'text' in bodyBlock) {
        expect(bodyBlock.text?.text?.length).toBeLessThan(200);
        expect(bodyBlock.text?.text).toContain('(truncated)');
      }
    });
  });

  describe('formatBodyContinuation', () => {
    it('should format continuation with chunk info', () => {
      const formatter = new SlackFormatter(defaultConfig);

      const result = formatter.formatBodyContinuation('Continued text...', 2, 3);

      expect(result.text).toContain('Continuation (2/3)');

      const contextBlock = result.blocks.find(b => b.type === 'context');
      expect(contextBlock).toBeDefined();

      const bodyBlock = result.blocks.find(block => {
        if (block.type === 'section' && 'text' in block) {
          return block.text?.text?.includes('Continued text...');
        }
        return false;
      });
      expect(bodyBlock).toBeDefined();
    });
  });
});
