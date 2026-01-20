import type { GmailMessage, GmailMessagePart, GmailHeader, GmailAttachmentInfo, ParsedEmail } from './types.js';

function decodeBase64Url(data: string): string {
  // Replace URL-safe base64 characters with standard base64 characters
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  const buffer = Buffer.from(base64, 'base64');
  return buffer.toString('utf-8');
}

function getHeader(headers: GmailHeader[] | undefined, name: string): string {
  if (!headers) return '';
  const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
  return header?.value ?? '';
}

function parseEmailAddress(address: string): string {
  // Handle formats like "Name <email@example.com>" or just "email@example.com"
  const match = address.match(/<([^>]+)>/);
  if (match) {
    return address; // Return full format with name
  }
  return address.trim();
}

function parseDate(dateStr: string, internalDate?: string): Date {
  // Try to parse the Date header first
  if (dateStr) {
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  // Fall back to internal date (milliseconds since epoch)
  if (internalDate) {
    const timestamp = parseInt(internalDate, 10);
    if (!isNaN(timestamp)) {
      return new Date(timestamp);
    }
  }

  return new Date();
}

function extractBody(part: GmailMessagePart | undefined, preferHtml: boolean = false): string {
  if (!part) return '';

  // If this part has direct body content
  if (part.body?.data) {
    const mimeType = part.mimeType ?? '';
    if (mimeType === 'text/plain' && !preferHtml) {
      return decodeBase64Url(part.body.data);
    }
    if (mimeType === 'text/html' && preferHtml) {
      return stripHtml(decodeBase64Url(part.body.data));
    }
  }

  // If this part has sub-parts, recursively search
  if (part.parts) {
    // First try to find text/plain
    for (const subPart of part.parts) {
      if (subPart.mimeType === 'text/plain' && subPart.body?.data) {
        return decodeBase64Url(subPart.body.data);
      }
    }

    // If no text/plain, try text/html
    for (const subPart of part.parts) {
      if (subPart.mimeType === 'text/html' && subPart.body?.data) {
        return stripHtml(decodeBase64Url(subPart.body.data));
      }
    }

    // Recursively check multipart parts
    for (const subPart of part.parts) {
      if (subPart.mimeType?.startsWith('multipart/')) {
        const body = extractBody(subPart, preferHtml);
        if (body) return body;
      }
    }
  }

  return '';
}

function stripHtml(html: string): string {
  // Remove HTML tags and decode entities
  return html
    // Remove style and script tags with content
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    // Replace block elements with newlines
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    // Remove all remaining tags
    .replace(/<[^>]+>/g, '')
    // Decode common HTML entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    // Clean up multiple newlines
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractAttachments(part: GmailMessagePart | undefined): GmailAttachmentInfo[] {
  const attachments: GmailAttachmentInfo[] = [];

  if (!part) return attachments;

  // Check if this part is an attachment
  if (part.filename && part.body?.attachmentId) {
    attachments.push({
      attachmentId: part.body.attachmentId,
      filename: part.filename,
      mimeType: part.mimeType ?? 'application/octet-stream',
      size: part.body.size ?? 0,
    });
  }

  // Recursively check sub-parts
  if (part.parts) {
    for (const subPart of part.parts) {
      attachments.push(...extractAttachments(subPart));
    }
  }

  return attachments;
}

export function parseGmailMessage(message: GmailMessage): ParsedEmail {
  const headers = message.payload?.headers;

  const subject = getHeader(headers, 'Subject') || '(No Subject)';
  const from = parseEmailAddress(getHeader(headers, 'From'));
  const to = parseEmailAddress(getHeader(headers, 'To'));
  const dateStr = getHeader(headers, 'Date');

  const body = extractBody(message.payload);
  const attachments = extractAttachments(message.payload);

  return {
    messageId: message.id,
    threadId: message.threadId,
    subject,
    from,
    to,
    date: parseDate(dateStr, message.internalDate),
    body,
    attachments,
    snippet: message.snippet ?? '',
  };
}

export function truncateBody(body: string, maxChars: number): string {
  const suffix = '...';
  const effectiveMax = maxChars - suffix.length;

  if (body.length <= maxChars) return body;

  // Try to truncate at a newline boundary within safe range
  const truncated = body.substring(0, effectiveMax);
  const lastNewline = truncated.lastIndexOf('\n');

  if (lastNewline > effectiveMax * 0.7) {
    return truncated.substring(0, lastNewline).trimEnd() + suffix;
  }

  // Otherwise truncate at word boundary
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > effectiveMax * 0.7) {
    return truncated.substring(0, lastSpace) + suffix;
  }

  return truncated + suffix;
}

export function splitBody(body: string, maxChars: number): string[] {
  if (body.length <= maxChars) return [body];

  const chunks: string[] = [];
  let remaining = body;

  while (remaining.length > 0) {
    if (remaining.length <= maxChars) {
      chunks.push(remaining);
      break;
    }

    // Try to split at paragraph boundary
    const chunk = remaining.substring(0, maxChars);
    const lastParagraph = chunk.lastIndexOf('\n\n');

    if (lastParagraph > maxChars * 0.5) {
      chunks.push(chunk.substring(0, lastParagraph));
      remaining = remaining.substring(lastParagraph + 2);
      continue;
    }

    // Try to split at newline
    const lastNewline = chunk.lastIndexOf('\n');
    if (lastNewline > maxChars * 0.5) {
      chunks.push(chunk.substring(0, lastNewline));
      remaining = remaining.substring(lastNewline + 1);
      continue;
    }

    // Split at word boundary
    const lastSpace = chunk.lastIndexOf(' ');
    if (lastSpace > maxChars * 0.5) {
      chunks.push(chunk.substring(0, lastSpace));
      remaining = remaining.substring(lastSpace + 1);
      continue;
    }

    // Hard split
    chunks.push(chunk);
    remaining = remaining.substring(maxChars);
  }

  return chunks;
}
