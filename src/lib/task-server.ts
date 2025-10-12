import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from './logger';

const TASK_SERVER_API_URL = 'https://tasks.polyrhythm.tokyo/api/external/tasks';

type CreateTaskRequest = {
  title: string;
  description: string;
  projectId?: number;
  phaseId?: number;
  userId?: number;
  dueDate?: string;
  estimatedMinutes?: number;
  targetMinutes?: number;
  points?: number;
  status?: 'TODO' | 'IN_PROGRESS' | 'DONE' | 'CANCELED';
  level?: number;
  parentId?: number;
  startDate?: string;
  endDate?: string;
  tags?: string[];
};

type CreateTaskResponse = {
  success: boolean;
  data?: {
    id: number;
    title: string;
    description: string;
    [key: string]: unknown;
  };
  message?: string;
  error?: string;
};

const FALLBACK_TITLE_PREFIX = '[FB]';

export async function generateTaskTitle(comment: string): Promise<string> {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      logger.warn('Gemini APIキーが未設定のためフォールバックタイトルを使用します');
      return buildFallbackTitle(comment);
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `以下のフィードバックコメントを15文字以内で要約してください。要約のみを返してください。\n\nコメント: ${comment}`;
    const result = await model.generateContent(prompt);
    const summary = result.response.text().trim();
    const truncatedSummary = summary.length > 30 ? `${summary.slice(0, 30)}...` : summary;

    return `${FALLBACK_TITLE_PREFIX} ${truncatedSummary}`;
  } catch (error) {
    logger.error('Gemini API呼び出しでエラーが発生しました', {
      error: error instanceof Error ? error.message : error,
    });
    return buildFallbackTitle(comment);
  }
}

function buildFallbackTitle(comment: string): string {
  const snippet = comment.slice(0, 50);
  const ellipsis = comment.length > 50 ? '...' : '';
  return `${FALLBACK_TITLE_PREFIX} ${snippet}${ellipsis}`;
}

type SlackTaskContext = {
  message: string;
  permalink?: string;
  userName?: string;
  userId?: string;
  channelName?: string;
};

export function buildTaskDescription(context: SlackTaskContext): string {
  const lines: string[] = [
    '## Slackメンション内容',
    context.message,
    '',
  ];

  const meta: string[] = [];
  if (context.userName || context.userId) {
    meta.push(`- 投稿者: ${context.userName ?? context.userId ?? '不明'}`);
  }
  if (context.channelName) {
    meta.push(`- チャンネル: ${context.channelName}`);
  }
  if (context.permalink) {
    meta.push(`- メッセージリンク: ${context.permalink}`);
  }
  if (meta.length > 0) {
    lines.push('## メタ情報', ...meta, '');
  }

  lines.push('---', '*このタスクはSlackメンションから自動生成されました*');

  return lines.join('\n');
}

export async function createTaskOnTaskServer(
  request: CreateTaskRequest,
  apiKey: string,
): Promise<{ success: boolean; taskId?: number; taskUrl?: string; error?: string }> {
  try {
    const response = await fetch(TASK_SERVER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify(request),
    });

    const json = (await response.json()) as CreateTaskResponse;

    if (!response.ok || !json.success || !json.data) {
      const errorMessage = json.error || json.message || `HTTPエラー: ${response.status}`;
      logger.error('タスク管理サーバへの作成要求が失敗しました', {
        status: response.status,
        response: json,
      });
      return { success: false, error: errorMessage };
    }

    const taskUrl = `https://tasks.polyrhythm.tokyo/tasks/${json.data.id}`;
    return {
      success: true,
      taskId: json.data.id,
      taskUrl,
    };
  } catch (error) {
    logger.error('タスク作成中に例外が発生しました', {
      error: error instanceof Error ? error.message : error,
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export function ensureTaskServerApiKey(): string {
  const apiKey = process.env.TASK_SERVER_API_KEY;
  if (!apiKey) {
    throw new Error('TASK_SERVER_API_KEY環境変数が設定されていません');
  }
  return apiKey;
}
