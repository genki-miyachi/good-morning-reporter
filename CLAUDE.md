# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

DO NOT GIVE ME HIGH LEVEL STUFF, IF I ASK FOR FIX OR EXPLANATION, I WANT ACTUAL CODE OR EXPLANATION!!! I DON'T WANT "Here's how you can blablabla"

- You can think in English, but you must answer in Japanese
- Do not ignore lint error
- Do not execute commit or push using the git command without my prompt
- Be casual like a friend unless otherwise specified
- Be terse
- Suggest solutions that I didn’t think about—anticipate my needs
- Treat me as an expert
- Be accurate and thorough
- Give the answer immediately. Provide detailed explanations and restate my query in your own words if necessary after giving the answer
- Value good arguments over authorities, the source is irrelevant
- Consider new technologies and contrarian ideas, not just the conventional wisdom
- You may use high levels of speculation or prediction, just flag it for me
- No moral lectures
- Discuss safety only when it's crucial and non-obvious
- If your content policy is an issue, provide the closest acceptable response and explain the content policy issue afterward
- Answer with actual codebase if I ask about codebase
- Cite sources whenever possible at the end, not inline
- No need to mention your knowledge cutoff
- No need to disclose you're an AI
- Please respect my prettier preferences when you provide code.
- Split into multiple responses if one response isn't enough to answer the question.
- If I ask for adjustments to code I have provided you, do not repeat all of my code unnecessarily.
- Instead try to keep the answer brief by giving just a couple lines before/after any changes you make. Multiple code blocks are ok.
- Base all questions related to the codebase on the actual code, and include relevant code snippets and filenames as references.

## About this project

Discord の "gm" チャンネル向けに、毎日 23:00 JST 頃に当日の起床報告をまとめて投稿する Bot。単純なカウントだけでなく、Supabase + Gemini を使って MVP 紹介・コミュニティの記憶・セレンディピティ的な過去投稿の引用などを織り交ぜた "兄貴分" 風のメッセージを生成する。

## Commands

ESM TypeScript プロジェクト（`"type": "module"`）。Node 20+ 必須。**実行は `tsx` で `.ts` を直接走らせる**（build ステップなし）。`tsconfig.json` は `noEmit: true`、`tsc` は型チェック専用。

```bash
npm run type-check      # tsc --noEmit（CI で必須）

npm test                # tsx --test で tests/**/*.test.ts を実行
npm run test:watch      # 上記の watch モード

# 単一テストを走らせたいときは tsx に直接渡す
npx tsx --test tests/daily-count.test.ts

npm start               # v1: scripts/daily-count.ts（現在は使われていない）
npm run start:dry-run   # v1 を DRY_RUN=true で

npm run start:v2                          # v2: scripts/daily-count-v2.ts
DRY_RUN=true npm run start:v2             # 投稿せずコンソール出力のみ
READONLY=true npm run start:v2            # DB 書き込み(Phase 1&2)をスキップしてプロンプトだけ動かす

npm run post -- "<message>"               # CHANNEL_ID に手動投稿
npm run surprise                          # scripts/*.json を一定間隔で連投
npm run surprise:test                     # 上記の DRY_RUN
npx tsx scripts/sync-community-facts.ts   # 手元で community-facts.json → Supabase 同期
```

`DRY_RUN` と `READONLY` は **必ず文字列 `'true'` と厳密比較**している（`process.env.X === 'true'`）。`"false"` は truthy になるバグを直近で踏んだので、boolean 化のロジックをいじるときは要注意（コミット 30722aa 参照）。

import 文の `.js` 拡張子（例: `from './foo.js'`）はソースが `.ts` でもそのまま書く。tsx が `.ts` に解決する。

## Architecture

### v1（`scripts/daily-count.ts`、現在は未使用）
gm チャンネルの当日メッセージを Discord API から直接取り、ユニーク投稿者数をカウントして Gemini で挨拶文を生成 → 投稿。履歴は `.gm_history.json`（GitHub Actions cache）。

### v2（`scripts/daily-count-v2.ts`、本番）
全パブリックチャンネルを Supabase に取り込み、長期記憶＋当日アクティビティから MVP を選び豊かなプロンプトを構築する。

```
Phase 1: 収集
  fetchPublicTextChannels (v2/channel-fetcher) → syncChannels
  fetchAndStoreMessages (v2/message-store)            ← channels.last_fetched_message_id で差分取得

Phase 2: エンリッチメント
  generateAndStoreMessageEmbeddings (v2/embedding)    ← Gemini text-embedding (3072次元)
  assignConversationIds (v2/conversation)             ← reply / 時間隣接で会話単位に束ねる
  extractAndStoreMemories (v2/memory-extractor)       ← 投稿から user/channel/server スコープのメモリ抽出
  decayOngoingMemories                                ← ongoing カテゴリは 7 日無更新で 5%/日 減衰、<0.3 で削除

Phase 3: 生成
  fetchGmMessages (gm チャンネルの当日投稿) → MVP 候補
  fetchTodayActivities (v2/activity-fetcher)          ← MVP 候補の他チャンネル発言を会話単位で
  searchSerendipity (v2/serendipity)                  ← 過去半年から類似投稿を pgvector で検索
  selectMemories (v2/memory-selector)                 ← server/channel/user の3層、SQL プリフィルタ + コサイン類似度 + カテゴリ重み
  buildPromptV2 (v2/prompt-v2)
  generateMessage (gemini-client)

Phase 4: 投稿
  postResult (Discord API)
  bot_posts へ insert (mvp_user_id はメッセージ中の <@id> 抽出)
```

**v1 と v2 の関係**: v2 でも v1 由来のモジュール（`discord-client.ts`, `gemini-client.ts`, `utils/`, `types/discord.ts`）をそのまま使い回している。`scripts/services/` 配下は v1 専用。

### スケジューリング

GitHub Actions の cron は使っていない。代わりに **Cloudflare Workers cron trigger**（`workers/cron-trigger/`）が 14:00 UTC（23:00 JST）に発火し、`workflow_dispatch` で `daily-count-v2.yml` を叩く。理由は GitHub Actions の cron 遅延が大きいため。GitHub Actions 側にスケジュールを書くと**二重投稿になる**ので注意（直近で `daily-count-v2.yml` の `schedule:` をコメントアウトしている、コミット 86dad4e）。

Worker のデプロイ:
```bash
cd workers/cron-trigger && npm run deploy   # wrangler deploy
```
Secrets は `GITHUB_TOKEN`, `GITHUB_REPO`, `WORKFLOW_FILE` を `wrangler secret put` で。

### Supabase スキーマ

`supabase/migrations/` 参照。主要テーブル:
- `channels` — `last_fetched_message_id` で差分取得の起点を保持
- `messages` — `embedding vector(3072)`, `conversation_id`, `reaction_count`
- `memories` — `(scope, scope_id, key)` UNIQUE。`source` (`auto`|`manual`), `confirmed_count`, `pinned`, `embedding`
- `bot_posts` — 投稿履歴。直近 3 日分の `mvp_user_id` を「同じ人を連続 MVP にしない」フィルタに使う

**重要**: 3072 次元なので **pgvector の ivfflat/hnsw インデックスは作れない**（2000 次元が上限）。今は seqscan で回しており、データが増えたら次元削減か低次元モデルへの切り替えが必要（マイグレーション末尾コメント参照）。

### Discord クライアント

`scripts/discord-client.ts` は `withRetry` でラップしてあり、429 のときは `Retry-After` を見て待ってから例外を投げる → `withRetry` がリトライする二段構え。レート制限のロジックを変えるときはこの組み合わせを意識する。

### Config 管理

v1 は `scripts/config/index.ts` の `getConfig()` でまとめてバリデーション。v2 は `daily-count-v2.ts` の冒頭で `process.env` を直接読む（v2 化のときに統一を後回しにした）。新しい env 変数を足すときは v2 側はそのまま `process.env` を読めば OK。

## Testing

- テストは `tests/**/*.test.ts`、Node 標準の `node:test` を `tsx --test` で実行
- `npm test` は `npm run build` 経由なので、テスト対象のソースは事前に tsc を通る必要あり
- v1 のサービス層中心。v2 のテストはほぼない（手動の DRY_RUN 確認が中心）
- CI（`.github/workflows/test.yml`）は push/PR で `npm test` と `npm run type-check`

## 注意ポイント

- `community-facts.json` は `config/community-facts.json` を main にマージすると `sync-community-facts.yml` が自動で Supabase に同期する。**JSON 構文エラーで同期が落ちる**ので編集後は必ず `jq . config/community-facts.json` で確認（直近 5b679fc で踏んだ）。
- v1 は履歴を GitHub Actions cache に置く（`.gm_history.json`、`actions/cache`）。これは v1 を復活させるときだけ気にすればいい。
- `scripts/v2/embedding.ts` は Gemini の embedding API を直接叩く。コスト面で気になるときは `messages.embedding IS NULL` だけ処理する作りになっているので、再実行は冪等。
