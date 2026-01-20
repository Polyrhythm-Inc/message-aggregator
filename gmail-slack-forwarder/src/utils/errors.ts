export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export class GmailError extends Error {
  constructor(
    message: string,
    public readonly accountName?: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'GmailError';
  }
}

export class SlackError extends Error {
  constructor(
    message: string,
    public readonly slackError?: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'SlackError';
  }
}

export class StorageError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'StorageError';
  }
}

export function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const message = error.message.toLowerCase();
  const retryablePatterns = [
    'econnreset',
    'etimedout',
    'econnrefused',
    'rate_limited',
    'ratelimited',
    'service_unavailable',
    'internal_error',
    'timeout',
    'network',
    'socket hang up',
  ];

  return retryablePatterns.some(pattern => message.includes(pattern));
}
