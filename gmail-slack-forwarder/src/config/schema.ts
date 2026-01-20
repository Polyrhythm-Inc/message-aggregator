import { z } from 'zod';

export const AccountSchema = z.object({
  name: z.string().min(1),
  displayName: z.string().min(1),
  tokenPath: z.string().min(1),
});

export const SlackConfigSchema = z.object({
  botTokenEnv: z.string().default('SLACK_BOT_TOKEN'),
  postChannelId: z.string().min(1),
});

export const FormatConfigSchema = z.object({
  includeAccountHeader: z.boolean().default(true),
  bodyMaxChars: z.number().min(100).max(3000).default(3000),
  splitLongBodyIntoThread: z.boolean().default(true),
  includeGmailPermalink: z.boolean().default(false),
});

export const AttachmentConfigSchema = z.object({
  enabled: z.boolean().default(true),
  uploadAsThreadReply: z.boolean().default(true),
});

export const DedupeConfigSchema = z.object({
  sqlitePath: z.string().default('~/.gmail-slack-forwarder/state.db'),
  retentionDays: z.number().min(1).max(365).default(7),
});

export const ConfigSchema = z.object({
  pollIntervalSeconds: z.number().min(10).max(300).default(30),
  maxMessagesPerPoll: z.number().min(1).max(100).default(20),
  gmailQuery: z.string().default('in:inbox -label:slack_done'),
  credentialsPath: z.string().default('~/.gmail-slack-forwarder/credentials.json'),
  slack: SlackConfigSchema,
  accounts: z.array(AccountSchema).min(1),
  format: FormatConfigSchema.default({}),
  attachments: AttachmentConfigSchema.default({}),
  dedupe: DedupeConfigSchema.default({}),
});

export type Account = z.infer<typeof AccountSchema>;
export type SlackConfig = z.infer<typeof SlackConfigSchema>;
export type FormatConfig = z.infer<typeof FormatConfigSchema>;
export type AttachmentConfig = z.infer<typeof AttachmentConfigSchema>;
export type DedupeConfig = z.infer<typeof DedupeConfigSchema>;
export type Config = z.infer<typeof ConfigSchema>;
