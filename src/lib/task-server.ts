import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from './logger';

const TASK_SERVER_API_URL = 'https://tasks.polyrhythm.tokyo/api/external/tasks';
const PROJECT_MATCH_API_URL =
  process.env.PROJECT_MATCH_API_URL ??
  'https://auth-suite.polyrhythm.tokyo/api/projects/match';

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

type ProjectMatchProject = {
  uuid?: string;
  name?: string;
  displayName?: string | null;
  description?: string | null;
  domainLocal?: string | null;
  domainDevelopment?: string | null;
  domainStaging?: string | null;
  domainProduction?: string | null;
  framework?: string | null;
  githubRepository?: string | null;
  localRelativePath?: string | null;
  localFolderStatus?: string | null;
  allowRegistration?: boolean;
  createdAt?: string;
  updatedAt?: string;
  _count?: {
    users?: number;
    apiKeys?: number;
  };
};

type ProjectMatchAlternative = {
  project?: ProjectMatchProject | null;
  confidence?: number | null;
};

type ProjectMatchResponse = {
  data?: {
    source?: 'gemini' | 'fallback';
    project?: ProjectMatchProject | null;
    confidence?: number | null;
    reason?: string | null;
    alternatives?: ProjectMatchAlternative[];
  };
  meta?: {
    messagePreview?: string;
    requestedAt?: string;
    requestedBy?: {
      application_uuid?: string;
      keyName?: string;
    };
    geminiRawResponse?: string | null;
  };
  error?: string;
  message?: string;
};

type ProjectMatchResult =
  | {
      data: NonNullable<ProjectMatchResponse['data']>;
      meta?: ProjectMatchResponse['meta'];
      error?: undefined;
    }
  | {
      data?: undefined;
      meta?: ProjectMatchResponse['meta'];
      error: string;
    }
  | null;

async function fetchProjectMatch(message: string): Promise<ProjectMatchResult> {
  const apiKey = process.env.AUTH_SUITE_API_KEY;
  if (!apiKey) {
    logger.warn('AUTH_SUITE_API_KEYが未設定のためプロジェクト推測をスキップします');
    return {
      error: 'AUTH_SUITE_API_KEYが未設定のためプロジェクト推測を実行できませんでした。',
    };
  }

  try {
    const response = await fetch(PROJECT_MATCH_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ message }),
    });

    if (!response.ok) {
      logger.warn('プロジェクト推測APIの呼び出しに失敗しました', {
        status: response.status,
        statusText: response.statusText,
      });
      return {
        error: `プロジェクト推測API呼び出しが失敗しました (HTTP ${response.status})`,
      };
    }

    const json = (await response.json()) as ProjectMatchResponse;

    if (!json.data) {
      logger.warn('プロジェクト推測APIからデータが返されませんでした', { response: json });
      return {
        error: 'プロジェクト推測APIから有効な結果が取得できませんでした。',
        meta: json.meta,
      };
    }

    return {
      data: json.data,
      meta: json.meta,
    };
  } catch (error) {
    logger.error('プロジェクト推測API呼び出し中に例外が発生しました', {
      error: error instanceof Error ? error.message : error,
    });
    return {
      error: 'プロジェクト推測API呼び出しでエラーが発生しました。',
    };
  }
}

function formatConfidence(confidence?: number | null): string | undefined {
  if (typeof confidence !== 'number' || Number.isNaN(confidence)) {
    return undefined;
  }
  return `${(confidence * 100).toFixed(1)}%`;
}

export async function buildTaskDescription(context: SlackTaskContext): Promise<string> {
  const lines: string[] = [
    '## Slackメンション内容',
    context.message,
    '',
  ];

  const projectMatch = await fetchProjectMatch(context.message);

  if (projectMatch) {
    lines.push('## プロジェクト推測結果');

    if ('error' in projectMatch && projectMatch.error) {
      lines.push(projectMatch.error, '');
    } else if (projectMatch?.data) {
      const { data, meta } = projectMatch;
      const projectName =
        data.project?.displayName ??
        data.project?.name ??
        data.project?.uuid ??
        '不明';
      const confidenceText = formatConfidence(data.confidence);
      const alternativeLines =
        data.alternatives
          ?.filter((alt) => alt.project)
          .map((alt, index) => {
            const altName =
              alt.project?.displayName ??
              alt.project?.name ??
              alt.project?.uuid ??
              `候補${index + 1}`;
            const altConfidence = formatConfidence(alt.confidence);
            return `- 代替候補${index + 1}: ${altName}${altConfidence ? ` (信頼度: ${altConfidence})` : ''}`;
          }) ?? [];

      lines.push(`- 判定ソース: ${data.source ?? '不明'}`);
      lines.push(`- 推定プロジェクト: ${projectName}`);
      if (confidenceText) {
        lines.push(`- 信頼度: ${confidenceText}`);
      }
      if (data.reason) {
        lines.push(`- 選定理由: ${data.reason}`);
      }
      if (alternativeLines.length > 0) {
        lines.push(...alternativeLines);
      }
      if (meta?.requestedAt) {
        lines.push(`- 推測実行時刻: ${meta.requestedAt}`);
      }
      if (meta?.requestedBy?.application_uuid || meta?.requestedBy?.keyName) {
        const uuid = meta.requestedBy.application_uuid
          ? `UUID: ${meta.requestedBy.application_uuid}`
          : undefined;
        const keyName = meta.requestedBy.keyName
          ? `キー名: ${meta.requestedBy.keyName}`
          : undefined;
        lines.push(
          `- リクエスト情報: ${[uuid, keyName].filter(Boolean).join(', ')}`,
        );
      }
      lines.push('');
    }
  }

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
