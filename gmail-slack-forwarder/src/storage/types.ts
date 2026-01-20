export interface ProcessedMail {
  id: number;
  gmailAccount: string;
  gmailMessageId: string;
  slackTs: string | null;
  processedAt: string;
}
