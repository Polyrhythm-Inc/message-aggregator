import pino from 'pino';

export const logger = pino({
  name: 'message-aggregator',
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
}); 