/**
 * ai-org-projects REST API クライアント
 * 外部プロジェクト管理サービスとの連携
 */
import { logger } from './logger';

const AI_ORG_PROJECTS_API_URL = process.env.AI_ORG_PROJECTS_API_URL || 'http://localhost:5210/api/v1';

// API呼び出しのタイムアウト（ミリ秒）
const API_TIMEOUT_MS = 10000;

/**
 * ai-org-projectsのプロジェクト型
 */
export type ExternalProject = {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  createdAt: string;
  updatedAt: string;
  directories?: Array<{
    id: string;
    path: string;
    isPrimary: boolean;
  }>;
  aliases?: Array<{
    id: string;
    alias: string;
    type: string;
  }>;
};

/**
 * ai-org-projectsのプロジェクト担当者型
 */
export type ExternalProjectContact = {
  id: number;
  name: string;
  email: string | null;
  slackId: string | null;
  role: 'client' | 'stakeholder' | 'partner';
  createdAt: number;
  updatedAt: number;
};

/**
 * プロジェクト一覧レスポンス
 */
export type ExternalProjectsResponse = {
  projects: ExternalProject[];
  total: number;
};

/**
 * APIエラー
 */
export class AiOrgProjectsApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly response?: unknown
  ) {
    super(message);
    this.name = 'AiOrgProjectsApiError';
  }
}

/**
 * ai-org-projectsからプロジェクト一覧を取得
 */
export async function fetchExternalProjects(options?: {
  limit?: number;
  offset?: number;
  search?: string;
}): Promise<ExternalProjectsResponse> {
  const params = new URLSearchParams();
  if (options?.limit !== undefined) {
    params.set('limit', String(options.limit));
  }
  if (options?.offset !== undefined) {
    params.set('offset', String(options.offset));
  }
  if (options?.search) {
    params.set('search', options.search);
  }

  const url = `${AI_ORG_PROJECTS_API_URL}/projects${params.toString() ? `?${params.toString()}` : ''}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      logger.error(
        { statusCode: response.status, url, errorBody },
        'ai-org-projects API error'
      );
      throw new AiOrgProjectsApiError(
        `Failed to fetch projects: ${response.status} ${response.statusText}`,
        response.status,
        errorBody
      );
    }

    const data = await response.json();
    // APIレスポンスは { success: true, data: { projects: [...], total: N } } 形式
    if (data.success && data.data) {
      return data.data as ExternalProjectsResponse;
    }
    return data as ExternalProjectsResponse;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof AiOrgProjectsApiError) {
      throw error;
    }

    const err = error as Error;
    const isTimeout = err.name === 'AbortError';
    logger.error(
      { errorMessage: err.message, url, isTimeout },
      isTimeout ? 'ai-org-projects API timeout' : 'Failed to connect to ai-org-projects API'
    );
    throw new AiOrgProjectsApiError(
      isTimeout
        ? `ai-org-projects API timeout after ${API_TIMEOUT_MS}ms`
        : `Failed to connect to ai-org-projects API: ${err.message}`,
      0
    );
  }
}

/**
 * ai-org-projectsから単一プロジェクトを取得
 */
export async function fetchExternalProject(projectId: string): Promise<ExternalProject | null> {
  const url = `${AI_ORG_PROJECTS_API_URL}/projects/${encodeURIComponent(projectId)}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      logger.error(
        { statusCode: response.status, url, errorBody },
        'ai-org-projects API error'
      );
      throw new AiOrgProjectsApiError(
        `Failed to fetch project: ${response.status} ${response.statusText}`,
        response.status,
        errorBody
      );
    }

    const data = await response.json();
    // APIレスポンスは { success: true, data: {...} } 形式
    if (data.success && data.data) {
      return data.data as ExternalProject;
    }
    return data as ExternalProject;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof AiOrgProjectsApiError) {
      throw error;
    }

    const err = error as Error;
    const isTimeout = err.name === 'AbortError';
    logger.error(
      { errorMessage: err.message, url, isTimeout },
      isTimeout ? 'ai-org-projects API timeout' : 'Failed to connect to ai-org-projects API'
    );
    throw new AiOrgProjectsApiError(
      isTimeout
        ? `ai-org-projects API timeout after ${API_TIMEOUT_MS}ms`
        : `Failed to connect to ai-org-projects API: ${err.message}`,
      0
    );
  }
}

/**
 * ai-org-projects APIの接続確認
 */
export async function checkAiOrgProjectsConnection(): Promise<boolean> {
  try {
    await fetchExternalProjects({ limit: 1 });
    return true;
  } catch {
    return false;
  }
}

/**
 * 担当者マッチング結果
 */
export type ContactMatchResult = {
  project: ExternalProject;
  contact: ExternalProjectContact;
};

/**
 * 送信者情報から担当者をマッチングしてプロジェクトを取得
 */
export async function matchContactToProject(params: {
  email?: string;
  slackId?: string;
  name?: string;
}): Promise<ContactMatchResult | null> {
  // 少なくとも1つのパラメータが必要
  if (!params.email && !params.slackId && !params.name) {
    return null;
  }

  const url = `${AI_ORG_PROJECTS_API_URL}/projects/contacts/match`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      logger.error(
        { statusCode: response.status, url, errorBody },
        'ai-org-projects API error (contact match)'
      );
      throw new AiOrgProjectsApiError(
        `Failed to match contact: ${response.status} ${response.statusText}`,
        response.status,
        errorBody
      );
    }

    const data = await response.json();
    // APIレスポンスは { success: true, data: { project: {...}, contact: {...} } | null } 形式
    if (data.success && data.data) {
      return data.data as ContactMatchResult;
    }
    return null;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof AiOrgProjectsApiError) {
      throw error;
    }

    const err = error as Error;
    const isTimeout = err.name === 'AbortError';
    logger.error(
      { errorMessage: err.message, url, isTimeout },
      isTimeout ? 'ai-org-projects API timeout' : 'Failed to connect to ai-org-projects API'
    );
    throw new AiOrgProjectsApiError(
      isTimeout
        ? `ai-org-projects API timeout after ${API_TIMEOUT_MS}ms`
        : `Failed to connect to ai-org-projects API: ${err.message}`,
      0
    );
  }
}

/**
 * プロジェクトに担当者を追加
 */
export async function addContactToProject(
  projectId: string,
  contact: {
    name: string;
    email?: string;
    slackId?: string;
    role?: 'client' | 'stakeholder' | 'partner';
  }
): Promise<ExternalProjectContact> {
  const url = `${AI_ORG_PROJECTS_API_URL}/projects/${encodeURIComponent(projectId)}/contacts`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(contact),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      logger.error(
        { statusCode: response.status, url, errorBody },
        'ai-org-projects API error'
      );
      throw new AiOrgProjectsApiError(
        `Failed to add contact: ${response.status} ${response.statusText}`,
        response.status,
        errorBody
      );
    }

    const data = await response.json();
    // APIレスポンスは { success: true, data: {...} } 形式
    if (data.success && data.data) {
      return data.data as ExternalProjectContact;
    }
    return data as ExternalProjectContact;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof AiOrgProjectsApiError) {
      throw error;
    }

    const err = error as Error;
    const isTimeout = err.name === 'AbortError';
    logger.error(
      { errorMessage: err.message, url, isTimeout },
      isTimeout ? 'ai-org-projects API timeout' : 'Failed to connect to ai-org-projects API'
    );
    throw new AiOrgProjectsApiError(
      isTimeout
        ? `ai-org-projects API timeout after ${API_TIMEOUT_MS}ms`
        : `Failed to connect to ai-org-projects API: ${err.message}`,
      0
    );
  }
}
