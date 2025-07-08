import { ChatworkAccountInfo, ChatworkRoomInfo } from '../types/chatwork';
import { logger } from './logger';

export class ChatworkService {
  private apiToken: string;
  private baseUrl = 'https://api.chatwork.com/v2';

  constructor(apiToken: string) {
    this.apiToken = apiToken;
  }

  async getRoomInfo(roomId: number): Promise<ChatworkRoomInfo> {
    try {
      logger.info('Chatworkルーム情報を取得中', { roomId });
      
      const response = await fetch(`${this.baseUrl}/rooms/${roomId}`, {
        headers: {
          'X-ChatWorkToken': this.apiToken,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to get room info: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      logger.info('Chatworkルーム情報を取得しました', { roomId, name: data.name });
      return data;
    } catch (error) {
      logger.error('Chatworkルーム情報の取得に失敗しました', { 
        roomId, 
        error: error instanceof Error ? error.message : error 
      });
      throw error;
    }
  }

  async getAccountInfo(accountId: number): Promise<ChatworkAccountInfo> {
    try {
      logger.info('Chatworkアカウント情報を取得中', { accountId });
      
      const response = await fetch(`${this.baseUrl}/contacts/${accountId}`, {
        headers: {
          'X-ChatWorkToken': this.apiToken,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to get account info: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      logger.info('Chatworkアカウント情報を取得しました', { accountId, name: data.name });
      return data;
    } catch (error) {
      logger.error('Chatworkアカウント情報の取得に失敗しました', { 
        accountId, 
        error: error instanceof Error ? error.message : error 
      });
      throw error;
    }
  }
} 