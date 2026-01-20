import { pino } from 'pino';

export const logger = pino({
  name: 'gmail-slack-forwarder',
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
});

export type Logger = typeof logger;
