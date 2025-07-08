import { SlackWebhook } from '../types/slack';

export const SlackHelper = {
  // Slackウェブフックからテキストを抽出
  textInWebhook: (webhook: SlackWebhook): string => {
    const { event } = webhook;
    
    // メッセージのテキストを取得
    if (event.text) {
      return event.text;
    }
    
    // ブロックからテキストを抽出
    if (event.blocks) {
      const blockTexts = event.blocks.flatMap(block => 
        block.elements?.flatMap(element => 
          element.elements?.map(el => el.text).filter(Boolean)
        ) || []
      );
      if (blockTexts.length > 0) {
        return blockTexts.join(' ');
      }
    }
    
    // 添付ファイルからテキストを抽出
    if (event.attachments) {
      const attachmentTexts = event.attachments.map(attachment => 
        attachment.text || attachment.fallback
      ).filter(Boolean);
      if (attachmentTexts.length > 0) {
        return attachmentTexts.join(' ');
      }
    }
    
    return '';
  },
  
  // SlackメッセージのURLを生成
  buildUrl: (channel: string, ts: string, thread_ts?: string, host?: string): string => {
    const domain = host || 'workspace';
    const timestamp = ts.replace('.', '');
    const channelId = channel.startsWith('#') ? channel.substring(1) : channel;
    
    let url = `https://${domain}.slack.com/archives/${channelId}/p${timestamp}`;
    
    if (thread_ts) {
      const threadTimestamp = thread_ts.replace('.', '');
      url += `?thread_ts=${thread_ts}&cid=${channelId}`;
    }
    
    return url;
  },
  
  // URLからリンクを抽出
  extractUrl: (text: string): string => {
    // Slackのリンク形式 (<URL|表示テキスト>) からURLを抽出
    const linkMatch = text.match(/<([^|>]+)(?:\|[^>]+)?>/);
    if (linkMatch) {
      return linkMatch[1];
    }
    // 通常のURL形式の場合はそのまま返す
    return text.trim();
  },
}; 