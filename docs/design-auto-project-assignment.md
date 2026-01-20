# メッセージへのプロジェクト自動設定機能 設計書

## 1. 概要

### 1.1 目的
メッセージ一覧画面において、Claude Codeを使用してメッセージ内容を分析し、適切なプロジェクトを自動的に設定する機能を追加する。

### 1.2 スコープ
- メッセージ内容のAI分析によるプロジェクト推定
- 自動設定結果の画面表示
- ユーザーによる確認・修正フロー
- **自動実行トリガー**（画面表示直後・定期読み込み後）
- **設定済みメッセージのスキップ**（DBに既存設定がある場合）

---

## 2. 現状分析

### 2.1 既存データ構造

#### プロジェクト（projects テーブル）
```sql
CREATE TABLE projects (
  id UUID PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  color VARCHAR(7) DEFAULT '#6B7280',
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

#### メッセージ-プロジェクト関連（message_projects テーブル）
```sql
CREATE TABLE message_projects (
  message_ts VARCHAR(50) PRIMARY KEY,
  project_id UUID REFERENCES projects(id),
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

#### メッセージ型（SlackMessage）
```typescript
type SlackMessage = {
  ts: string;
  text: string;
  user?: string;
  userName?: string;
  project_id?: string | null;  // 既に存在
  // ...
};
```

### 2.2 既存画面フロー
1. `MessageList` がメッセージ一覧を取得
2. 各 `MessageItem` に `ProjectSelector` が組み込まれている
3. ユーザーが手動でプロジェクトを選択・設定

---

## 3. 実行トリガー設計

### 3.1 トリガー一覧

| トリガー | 動作 | 対象 | 確認モーダル |
|---------|------|------|-------------|
| 画面表示直後 | 自動実行 | 未設定メッセージのみ | あり |
| 定期自動読み込み完了後 | 自動実行 | 未設定メッセージのみ | あり |
| 「自動設定」ボタン | ユーザー操作 | 選択に応じる | あり |
| 「プロジェクト自動設定」ボタン（個別） | ユーザー操作 | 単一メッセージ | **なし（即時適用）** |

### 3.2 自動実行トリガーのシーケンス

#### 3.2.1 画面表示直後の自動実行

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  User    │     │ Frontend │     │  API     │     │  Claude  │     │    DB    │
└────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘
     │                │                │                │                │
     │ 画面アクセス   │                │                │                │
     │───────────────>│                │                │                │
     │                │                │                │                │
     │                │ GET /api/slack/messages         │                │
     │                │───────────────>│                │                │
     │                │                │ メッセージ取得  │                │
     │                │                │───────────────────────────────>│
     │                │                │<───────────────────────────────│
     │                │<───────────────│                │                │
     │                │                │                │                │
     │ メッセージ一覧表示              │                │                │
     │<───────────────│                │                │                │
     │                │                │                │                │
     │                │ 【自動】未設定メッセージを抽出   │                │
     │                │ (project_id === null)           │                │
     │                │                │                │                │
     │                │ 未設定が0件の場合→処理終了      │                │
     │                │                │                │                │
     │                │ 未設定が1件以上の場合            │                │
     │                │ POST /api/projects/auto-assign  │                │
     │                │───────────────>│                │                │
     │                │                │                │                │
     │ ローディング表示│                │ Claude Code    │                │
     │ 「AI分析中...」│                │───────────────>│                │
     │<───────────────│                │<───────────────│                │
     │                │                │                │                │
     │                │<───────────────│                │                │
     │                │                │                │                │
     │ プレビューモーダル自動表示      │                │                │
     │<───────────────│                │                │                │
     │                │                │                │                │
```

#### 3.2.2 定期自動読み込み完了後の自動実行

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│ Frontend │     │  API     │     │  Claude  │     │    DB    │
└────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘
     │                │                │                │
     │ 【定期ポーリング/手動リフレッシュ】              │
     │ GET /api/slack/messages         │                │
     │───────────────>│                │                │
     │                │───────────────────────────────>│
     │                │<───────────────────────────────│
     │<───────────────│                │                │
     │                │                │                │
     │ 新規メッセージがある場合        │                │
     │ → 未設定のものを抽出            │                │
     │ (project_id === null)           │                │
     │                │                │                │
     │ 未設定が1件以上の場合            │                │
     │ POST /api/projects/auto-assign  │                │
     │───────────────>│                │                │
     │                │                │                │
     │                │ Claude Code    │                │
     │                │───────────────>│                │
     │                │<───────────────│                │
     │<───────────────│                │                │
     │                │                │                │
     │ プレビューモーダル表示          │                │
     │ （既存モーダルがある場合は追加） │                │
     │                │                │                │
```

### 3.3 スキップ条件

#### 3.3.1 スキップ対象

以下の条件に該当するメッセージは自動設定の対象からスキップする：

1. **DBに既にプロジェクトが設定されている**
   - `message_projects` テーブルに `project_id` が設定済み
   - フロントエンド側: `message.project_id !== null`

2. **分析中のメッセージ**
   - 現在AI分析が進行中のメッセージ

#### 3.3.2 スキップ判定フロー

```typescript
function shouldSkipMessage(message: SlackMessage): boolean {
  // DBに既にプロジェクトが設定されている場合はスキップ
  if (message.project_id !== null && message.project_id !== undefined) {
    return true;
  }
  return false;
}

function getMessagesForAutoAssign(messages: SlackMessage[]): SlackMessage[] {
  return messages.filter(m => !shouldSkipMessage(m));
}
```

#### 3.3.3 API側のスキップ処理

```typescript
// /api/projects/auto-assign
async function POST(req: Request) {
  const { messages, projects } = await req.json();

  // DB確認: 既に設定済みのメッセージをフィルタリング
  const existingAssignments = await db.query(
    'SELECT message_ts FROM message_projects WHERE message_ts = ANY($1)',
    [messages.map(m => m.ts)]
  );
  const existingSet = new Set(existingAssignments.rows.map(r => r.message_ts));

  // 未設定のメッセージのみ処理対象
  const targetMessages = messages.filter(m => !existingSet.has(m.ts));

  if (targetMessages.length === 0) {
    return Response.json({ suggestions: [], skipped: messages.length });
  }

  // Claude Code呼び出し...
}
```

---

## 4. シーケンス設計

### 3.1 自動プロジェクト設定フロー（メイン）

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  User    │     │ Frontend │     │  API     │     │  Claude  │     │    DB    │
│          │     │ (React)  │     │ (Next.js)│     │  Code    │     │(Postgres)│
└────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘
     │                │                │                │                │
     │ 画面表示       │                │                │                │
     │───────────────>│                │                │                │
     │                │                │                │                │
     │                │ GET /api/slack/messages         │                │
     │                │───────────────>│                │                │
     │                │                │ メッセージ取得  │                │
     │                │                │───────────────────────────────>│
     │                │                │<───────────────────────────────│
     │                │<───────────────│                │                │
     │                │                │                │                │
     │ メッセージ一覧表示              │                │                │
     │<───────────────│                │                │                │
     │                │                │                │                │
     │ 「自動設定」ボタン              │                │                │
     │ クリック       │                │                │                │
     │───────────────>│                │                │                │
     │                │                │                │                │
     │                │ POST /api/projects/auto-assign  │                │
     │                │ {messages: [...], projects: [...]}               │
     │                │───────────────>│                │                │
     │                │                │                │                │
     │ ローディング表示│                │                │                │
     │<───────────────│                │                │                │
     │                │                │                │                │
     │                │                │ Claude Code CLI呼び出し         │
     │                │                │ (メッセージ分析)│                │
     │                │                │───────────────>│                │
     │                │                │                │                │
     │                │                │                │ プロジェクト推定│
     │                │                │<───────────────│                │
     │                │                │                │                │
     │                │<───────────────│                │                │
     │                │ {suggestions: [{ts, projectId, confidence}]}     │
     │                │                │                │                │
     │ 推定結果をプレビュー表示        │                │                │
     │<───────────────│                │                │                │
     │                │                │                │                │
     │ 「適用」ボタン  │                │                │                │
     │ クリック       │                │                │                │
     │───────────────>│                │                │                │
     │                │                │                │                │
     │                │ POST /api/projects/bulk-assign  │                │
     │                │ {assignments: [{ts, projectId}]}│                │
     │                │───────────────>│                │                │
     │                │                │                │                │
     │                │                │ 一括更新       │                │
     │                │                │───────────────────────────────>│
     │                │                │<───────────────────────────────│
     │                │<───────────────│                │                │
     │                │                │                │                │
     │ 更新完了表示   │                │                │                │
     │<───────────────│                │                │                │
     │                │                │                │                │
```

### 4.2 個別メッセージ自動設定フロー（即時適用）

**特徴:**
- 確認モーダルなし（クリック即適用）
- 既存のプロジェクト設定がある場合も上書きOK
- ボタン名: 「プロジェクト自動設定」

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  User    │     │ Frontend │     │  API     │     │  Claude  │     │    DB    │
└────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘
     │                │                │                │                │
     │ 「プロジェクト │                │                │                │
     │  自動設定」    │                │                │                │
     │  ボタンクリック│                │                │                │
     │───────────────>│                │                │                │
     │                │                │                │                │
     │                │ POST /api/projects/suggest-and-apply             │
     │                │ {ts: "...", message: "...", projects: [...]}     │
     │                │───────────────>│                │                │
     │                │                │                │                │
     │ ローディング   │                │ Claude Code    │                │
     │ (ボタン上に    │                │───────────────>│                │
     │  スピナー表示) │                │<───────────────│                │
     │<───────────────│                │                │                │
     │                │                │                │                │
     │                │                │ 推定成功時、即座にDB更新        │
     │                │                │───────────────────────────────>│
     │                │                │<───────────────────────────────│
     │                │                │                │                │
     │                │<───────────────│                │                │
     │                │ {success, projectId, projectName, reason}        │
     │                │                │                │                │
     │ プロジェクト設定│                │                │                │
     │ が即座に反映   │                │                │                │
     │ (トースト通知) │                │                │                │
     │<───────────────│                │                │                │
     │                │                │                │                │
```

**注意点:**
- 既存のプロジェクト設定がある場合も上書きする
- 推定結果がnull（該当なし）の場合は設定しない
- トースト通知で結果を表示（「〇〇に設定しました」または「該当プロジェクトが見つかりませんでした」）

---

## 5. API設計

### 5.1 単一メッセージ即時適用API（新規・推奨）

#### `POST /api/projects/suggest-and-apply`

単一メッセージに対するプロジェクト推定と**即時適用**。確認モーダルなし。

**特徴:**
- 推定と適用を1回のAPIコールで実行
- 既存のプロジェクト設定がある場合も**上書きOK**
- 推定結果がnullの場合は適用せず、その旨を返却

**Request:**
```typescript
type SuggestAndApplyRequest = {
  ts: string;                // メッセージのタイムスタンプ
  message: string;           // メッセージ本文
  projects: Project[];       // 候補プロジェクト一覧
};
```

**Response:**
```typescript
type SuggestAndApplyResponse = {
  success: boolean;          // 適用成功かどうか
  applied: boolean;          // 実際に適用されたか（nullの場合false）
  projectId: string | null;  // 推定されたプロジェクトID
  projectName: string | null; // プロジェクト名（表示用）
  confidence: number;        // 確信度 0-100
  reason: string;            // 推定理由
  previousProjectId: string | null; // 上書き前のプロジェクトID（あれば）
};
```

**エラーケース:**
- Claude Code呼び出し失敗: `{ success: false, error: "AI分析に失敗しました" }`
- DB更新失敗: `{ success: false, error: "保存に失敗しました" }`

### 5.2 プロジェクト推定API（推定のみ）

#### `POST /api/projects/suggest`

単一メッセージに対するプロジェクト推定（適用は別途）

**Request:**
```typescript
type SuggestRequest = {
  message: string;           // メッセージ本文
  projects: Project[];       // 候補プロジェクト一覧
};
```

**Response:**
```typescript
type SuggestResponse = {
  projectId: string | null;  // 推定されたプロジェクトID（該当なしの場合null）
  confidence: number;        // 確信度 0-100
  reason: string;            // 推定理由
};
```

#### `POST /api/projects/auto-assign`

複数メッセージの一括プロジェクト推定

**特徴:**
- **DBに既に設定済みのメッセージは自動でスキップ**
- スキップされた件数をレスポンスに含める

**Request:**
```typescript
type AutoAssignRequest = {
  messages: {
    ts: string;              // メッセージのタイムスタンプ
    text: string;            // メッセージ本文
  }[];
  projects: Project[];       // 候補プロジェクト一覧
};
```

**Response:**
```typescript
type AutoAssignResponse = {
  suggestions: {
    ts: string;              // メッセージのタイムスタンプ
    projectId: string | null;
    confidence: number;
    reason: string;
  }[];
  skipped: number;           // スキップされた件数（DB設定済み）
  processed: number;         // 処理された件数
};
```

### 4.2 一括適用API

#### `POST /api/projects/bulk-assign`

推定結果の一括適用

**Request:**
```typescript
type BulkAssignRequest = {
  assignments: {
    ts: string;              // メッセージのタイムスタンプ
    projectId: string | null;
  }[];
};
```

**Response:**
```typescript
type BulkAssignResponse = {
  success: boolean;
  updatedCount: number;
};
```

---

## 5. 画面設計

### 5.1 メッセージ一覧ヘッダー

```
┌─────────────────────────────────────────────────────────────────┐
│  タスク管理メッセージ                                           │
│                                                                 │
│  [プロジェクト管理] [自動設定 ▼] [削除モード OFF]              │
│                      ├─ すべて自動設定                         │
│                      ├─ 未設定のみ自動設定                      │
│                      └─ 選択したメッセージを自動設定            │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 自動設定プレビューモーダル

```
┌─────────────────────────────────────────────────────────────────┐
│  プロジェクト自動設定 プレビュー                    [×]         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ ■ メッセージ1: "XXXプロジェクトの進捗..."                  │ │
│  │   推定: [ProjectA ●] (確信度: 85%)                        │ │
│  │   理由: プロジェクト名が本文に含まれているため             │ │
│  │   [変更 ▼] [除外]                                         │ │
│  ├───────────────────────────────────────────────────────────┤ │
│  │ ■ メッセージ2: "本日のタスク..."                           │ │
│  │   推定: [なし] (確信度: 30%)                              │ │
│  │   理由: 特定のプロジェクトに関連付けられませんでした       │ │
│  │   [変更 ▼] [除外]                                         │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  処理対象: 5件 / 除外: 1件                                      │
│                                                                 │
│                              [キャンセル] [適用する]            │
└─────────────────────────────────────────────────────────────────┘
```

### 6.3 メッセージアイテム内の「プロジェクト自動設定」ボタン

**ボタン名**: 「プロジェクト自動設定」（既存のAIボタンを活用）

```
┌─────────────────────────────────────────────────────────────────┐
│  2024/12/25 10:30  [プロジェクト未設定 ▼] [🤖 自動設定] [返信] │
│                                                                 │
│  本日のミーティングについて...                                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**ボタン押下時（確認モーダルなし・即時適用）:**
```
┌─────────────────────────────────────────────────────────────────┐
│  2024/12/25 10:30  [プロジェクト未設定 ▼] [⏳ 分析中...] [返信]│
│                                                                 │
│  本日のミーティングについて...                                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
       ↓ (AI分析完了後、即座に反映)
┌─────────────────────────────────────────────────────────────────┐
│  2024/12/25 10:30  [ProjectA ● ▼] [🤖 自動設定] [返信]         │
│                     ↑ 即座に更新（ハイライトアニメーション）    │
│                                                                 │
│  本日のミーティングについて...                                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
       + トースト通知: 「ProjectA に設定しました」
```

**該当プロジェクトなしの場合:**
```
トースト通知: 「該当するプロジェクトが見つかりませんでした」
（プロジェクト設定は変更されない）
```

**既存設定がある場合も上書きOK:**
```
┌─────────────────────────────────────────────────────────────────┐
│  2024/12/25 10:30  [ProjectA ● ▼] [🤖 自動設定] [返信]         │
│                                                                 │
│  本日のミーティングについて...                                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
       ↓ (ボタンクリック→AI分析→即座に上書き)
┌─────────────────────────────────────────────────────────────────┐
│  2024/12/25 10:30  [ProjectB ● ▼] [🤖 自動設定] [返信]         │
│                                                                 │
│  本日のミーティングについて...                                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
       + トースト通知: 「ProjectB に変更しました（以前: ProjectA）」
```

---

## 6. Claude Code連携設計

### 6.1 呼び出し方式

**方式: Node.js child_process.spawn によるCLI呼び出し**

```typescript
import { spawn } from 'child_process';

async function callClaudeCode(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const claude = spawn('claude', [
      '-p', prompt,
      '--output-format', 'json'
    ]);

    let stdout = '';
    let stderr = '';

    claude.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    claude.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    claude.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`Claude Code exited with code ${code}: ${stderr}`));
      }
    });
  });
}
```

### 6.2 プロンプト設計

#### 単一メッセージ推定プロンプト

```
以下のメッセージを分析し、最も適切なプロジェクトを選択してください。

【メッセージ】
${message.text}

【プロジェクト候補】
${projects.map(p => `- ${p.name}: ${p.description || '説明なし'}`).join('\n')}

【出力形式】
以下のJSON形式で出力してください：
{
  "projectId": "選択したプロジェクトのID（該当なしの場合はnull）",
  "confidence": 0-100の確信度,
  "reason": "選択理由（日本語で簡潔に）"
}

【判断基準】
1. メッセージにプロジェクト名が直接含まれている場合は高確信度
2. プロジェクトの説明と関連するキーワードがある場合は中確信度
3. 明確な関連性がない場合はnullを返す
```

#### 一括推定プロンプト

```
以下のメッセージ群を分析し、それぞれに最も適切なプロジェクトを設定してください。

【メッセージ一覧】
${messages.map((m, i) => `[${i+1}] ts:${m.ts}\n${m.text}`).join('\n\n')}

【プロジェクト候補】
${projects.map(p => `- id:${p.id} name:${p.name}: ${p.description || '説明なし'}`).join('\n')}

【出力形式】
以下のJSON配列形式で出力してください：
{
  "suggestions": [
    {
      "ts": "メッセージのタイムスタンプ",
      "projectId": "選択したプロジェクトのID（該当なしの場合はnull）",
      "confidence": 0-100の確信度,
      "reason": "選択理由（日本語で簡潔に）"
    }
  ]
}
```

### 6.3 エラーハンドリング

```typescript
type ClaudeCodeError = {
  type: 'TIMEOUT' | 'PARSE_ERROR' | 'PROCESS_ERROR' | 'RATE_LIMIT';
  message: string;
};

// タイムアウト設定: 30秒
const CLAUDE_TIMEOUT_MS = 30000;

// リトライ設定
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;
```

---

## 7. 状態管理設計

### 7.1 React状態

```typescript
// MessageList.tsx に追加
type AutoAssignState = {
  mode: 'idle' | 'selecting' | 'analyzing' | 'previewing' | 'applying';
  selectedMessages: Set<string>;  // 選択されたメッセージts
  suggestions: Map<string, Suggestion>;  // ts -> 推定結果
  excludedMessages: Set<string>;  // 除外されたメッセージts
  error: string | null;
};

type Suggestion = {
  projectId: string | null;
  confidence: number;
  reason: string;
  modified?: boolean;  // ユーザーが変更したか
};
```

### 7.2 フロー状態遷移

```
    ┌──────┐
    │ idle │
    └──┬───┘
       │ 「自動設定」クリック
       ▼
  ┌──────────┐
  │selecting │ ← 対象選択（すべて/未設定のみ/選択）
  └────┬─────┘
       │ 対象確定
       ▼
  ┌──────────┐
  │analyzing │ ← Claude Code呼び出し中
  └────┬─────┘
       │ 分析完了
       ▼
  ┌───────────┐
  │previewing │ ← プレビューモーダル表示
  └─────┬─────┘
        │
   ┌────┴────┐
   │         │
   ▼         ▼
┌──────┐  ┌────────┐
│ idle │  │applying│ ← 一括適用中
└──────┘  └────┬───┘
               │ 適用完了
               ▼
           ┌──────┐
           │ idle │
           └──────┘
```

---

## 8. テスト戦略

### 8.1 フレームワーク
- ユニットテスト: Vitest
- E2Eテスト: Playwright

### 8.2 カバレッジ目標
- 全体: 80%以上
- ビジネスロジック: 90%以上

### 8.3 テスト種別と対象

#### ユニットテスト

1. **Claude Code連携モジュール**
   - プロンプト生成ロジック
   - レスポンスパース処理
   - エラーハンドリング
   - タイムアウト処理

2. **API エンドポイント**
   - `/api/projects/suggest`: 正常系・異常系
   - `/api/projects/auto-assign`: 複数メッセージ処理
   - `/api/projects/bulk-assign`: 一括更新

3. **React コンポーネント**
   - `AutoAssignButton`: ドロップダウン表示・選択
   - `AutoAssignPreviewModal`: プレビュー表示・編集・除外
   - `AiSuggestButton`: 個別推定ボタン

#### 統合テスト

1. メッセージ取得 → 自動設定 → プレビュー → 適用のフロー
2. 個別メッセージのAI推定 → 適用フロー
3. エラー発生時のフォールバック動作

#### E2Eテスト

1. 「自動設定」→「すべて自動設定」→ プレビュー確認 → 適用
2. 個別メッセージの「AI」ボタン → 推定結果確認 → 適用

---

## 9. 実装方針

### 9.1 ファイル構成（追加・変更）

```
src/
├── app/
│   ├── api/
│   │   └── projects/
│   │       ├── suggest/
│   │       │   └── route.ts          # 新規: 単一推定API（推定のみ）
│   │       ├── suggest-and-apply/
│   │       │   └── route.ts          # 新規: 単一推定+即時適用API ★
│   │       ├── auto-assign/
│   │       │   └── route.ts          # 新規: 一括推定API（スキップ対応）
│   │       └── bulk-assign/
│   │           └── route.ts          # 新規: 一括適用API
│   └── components/
│       ├── MessageList.tsx           # 変更: 自動設定状態管理追加、自動トリガー追加
│       ├── MessageItem.tsx           # 変更: 「プロジェクト自動設定」ボタン追加
│       ├── AutoAssignButton.tsx      # 新規: 自動設定ドロップダウン
│       ├── AutoAssignPreviewModal.tsx # 新規: プレビューモーダル
│       └── ProjectAutoAssignButton.tsx # 新規: 個別「プロジェクト自動設定」ボタン
├── hooks/
│   └── useAutoProjectAssign.ts       # 新規: 自動設定トリガー管理フック
├── lib/
│   └── claude-code.ts                # 新規: Claude Code連携モジュール
└── types/
    └── auto-assign.ts                # 新規: 自動設定関連型定義
```

### 9.2 実装優先順位

1. **Phase 1: 基盤構築**
   - Claude Code連携モジュール (`lib/claude-code.ts`)
   - 型定義 (`types/auto-assign.ts`)

2. **Phase 2: API実装**
   - `/api/projects/suggest`
   - `/api/projects/auto-assign`
   - `/api/projects/bulk-assign`

3. **Phase 3: UI実装**
   - `AutoAssignButton` コンポーネント
   - `AutoAssignPreviewModal` コンポーネント
   - `MessageList` への状態管理追加

4. **Phase 4: 個別推定機能**
   - `AiSuggestButton` コンポーネント
   - `MessageItem` への組み込み

5. **Phase 5: テスト・調整**
   - ユニットテスト
   - E2Eテスト
   - UXチューニング

---

## 10. 非機能要件

### 10.1 パフォーマンス
- 一括推定: 最大20メッセージを1回のAPI呼び出しで処理
- タイムアウト: 30秒（ユーザーにはプログレス表示）
- キャッシュ: 同一メッセージの再推定は1分間キャッシュ

### 10.2 セキュリティ
- Claude Code呼び出しはサーバーサイドのみ
- ユーザー入力のサニタイズ
- APIレート制限（1分間に10回まで）

### 10.3 可用性
- Claude Code障害時のフォールバック（手動設定に戻る）
- 部分的な失敗時の継続処理

---

## 11. 今後の拡張案

1. **学習機能**: ユーザーの修正履歴から精度向上
2. **ルールベース併用**: 頻出パターンのルール化
3. **リアルタイム推定**: メッセージ受信時の自動推定
4. **確信度閾値設定**: ユーザーが閾値を設定可能に

---

## 12. まとめ

本設計により、以下を実現する：

1. **ユーザビリティ向上**: 手動設定の手間を削減
2. **柔軟なフロー**: 一括/個別、プレビュー/即時適用の選択
3. **透明性**: AI推定の理由を表示
4. **安全性**: プレビュー確認後に適用

---

**設計者**: アーキテクト
**作成日**: 2024-12-25
**バージョン**: 1.1

---

## 変更履歴

| バージョン | 日付 | 変更内容 |
|-----------|------|----------|
| 1.0 | 2024-12-25 | 初版作成 |
| 1.1 | 2024-12-25 | 追加要件反映: (1) 実行トリガー追加（画面表示直後・定期読み込み後）、(2) DB設定済みメッセージのスキップ、(3) 単一メッセージAPI即時適用（確認なし・上書きOK）、(4) ボタン名「プロジェクト自動設定」に変更 |
