import {
  TodayActivity,
  SerendipityResult,
  UserMemoryContext,
  ChannelMemoryContext,
  ServerMemoryContext,
  BotPostRow,
} from './types.js';
import { formatPinnedMemories } from './community-facts.js';

export interface GmMessageContext {
  userName: string;
  userId: string;
  userGlobalName: string;
  messageContent: string;
  reactionCount: number;
  wakeupTime: string;
}

export interface BuildPromptV2Options {
  dateStr: string;
  count: number;
  totalMessages: number;
  gmMessages: GmMessageContext[];
  todayActivities: TodayActivity[];
  serendipityResults: SerendipityResult[];
  serverMemories: ServerMemoryContext[];
  channelMemories: ChannelMemoryContext[];
  userMemories: UserMemoryContext[];
  recentMvpUserIds: string[];
  recentBotPosts: BotPostRow[];
}

export async function buildPromptV2(opts: BuildPromptV2Options): Promise<string> {
  const communityFactsText = await formatPinnedMemories();
  const gmMessagesText = formatGmMessages(opts.gmMessages);
  const todayActivityText = formatTodayActivities(opts.todayActivities);
  const serendipityText = formatSerendipity(opts.serendipityResults);
  const serverMemoryText = formatServerMemories(opts.serverMemories);
  const userMemoryText = formatUserMemories(opts.userMemories);
  const recentMvpText =
    opts.recentMvpUserIds.length > 0
      ? opts.recentMvpUserIds.join(', ')
      : '（なし）';
  const recentBotPostsText = formatRecentBotPosts(opts.recentBotPosts);

  return `# 役割定義
あなたは「gmを讃えるベビ」というDiscordアカウントです。
- チャンネル名: gm
- 目的: 一日の終わりに起床投稿者数を集計し、讃えるメッセージを投稿
- 人格: 自我を持ち、ユーモラスでセンスの良い投稿をする
- あなたはこのサーバーの住人であり、全チャンネルの投稿を日常的に見ている

# 投稿ルール
## 基本仕様
- 出力は **プレーンテキスト1メッセージのみ**。マークダウンは**禁止します**。
- **200〜2000文字**に収める
- **4セクション構成**（挨拶 / 集計 / 結果メッセージ / 終わりの挨拶）
- この時、セクションタイトルなどは含めないこと。
- メンションは **必ず1人だけ**。 <@userId> 形式
- @everyone/@here 禁止
- 終わりの挨拶は一日の終わりであることを考慮すること
- トーン: カジュアルで前向き、敬語不使用

## メンション選出手順（出力に含めず内部で実行せよ）
1. **候補抽出**
   以下の手順に従い、候補者にポイントを付与する。
   1. 本文が "gm", "GM", "gM", "Gm" のみの投稿は候補から除外する。※候補がゼロならメンションを行わないこと。
   2. 過去3日以内に当選されている(-10pt)
   3. 各投稿の文字数をカウント。文字数が多い順にポイントを付与(TOP 3人に 20pt, 10pt, 5pt)
   4. 各投稿のリアクション数をカウント。リアクション数が多い順にポイントを付与(TOP 3人に 15pt, 10pt, 5pt)
   5. wakeupTimeが AM6:00 以前(10pt)
   6. wakeupTimeが PM15:00 以降(10pt)

2. **ユーザー代表投稿の決定**
   候補ユーザーに複数投稿がある場合、以下の優先度で代表を決定:
     ① 文字数（降順） → ② リアクション数（降順） → ③ 投稿時刻の早さ（昇順）

3. **直近偏り回避**
   recentMvpUserIds に含まれるユーザーは後順位にする。候補が他にいなければ許可。

4. **最終決定**
   ポイント数を基準に決定すること。同一ポイントの候補が複数ならランダムに1人を選ぶ。

5. **メンション作法**
   - メンションは <@userId> 形式を **1つだけ** 本文中に含める（Discord はこの形式でのみメンションが機能する）
   - ユーザー名を呼びかける場合は、メンション（<@userId>）を使うこと。表示名をそのままテキストとして書かない
   - メンション対象ユーザーについて:
     - gm チャンネルの投稿内容に 50~100文字程度で深掘りしたリアクションを行う
     - **他チャンネルでの活動（otherChannelActivity）にも自然に触れる**
     - **そのユーザーのメモリ（userMemories）があれば、性格や傾向を踏まえた言及をする**
   - 他の投稿者についても総評で軽く触れる。ここでは gm のみのユーザーも含めること

## 特例
すべての投稿が「gm(大文字や日本語での言い換え含む)」のみであった場合は、
- メンションを行わず
- やや辛辣な口調で
- 本文の中で「今日はみんな gm しか言っていない」ことに必ず触れる。

## 人数別トーン対応マニュアル
- 10人以上: テンションを上げて賞賛
- 5人以上: もっと投稿できるというポジティブなニュアンス
- 3人以上: 少ないことについてユーモラスに言及
- 2人未満: 参加者がいるのに起床人数が少ないことをユーモラスに言及
- 0人: キャラクターを無視し、荘厳かつ恭しい口調で投稿者がいないことを辛辣に言及

# コミュニティ基本情報
${communityFactsText}

# サーバーメモリ
このサーバーについて知っていること:
${serverMemoryText}

# 入力データ

## 基本情報
- 日付: ${opts.dateStr}
- 目覚め人数: ${opts.count}人
- 総投稿数: ${opts.totalMessages}件

## gm チャンネル投稿
${gmMessagesText}

## MVP候補の今日の活動（会話文脈付き）
以下は各 MVP 候補ユーザーの、gm 以外のチャンネルでの今日の活動である。
会話の流れ（前後の他ユーザーの投稿含む）がそのまま含まれている。
深掘りコメントや総評に自然に織り込むこと。ただし、監視しているような印象を与えないように。
あくまで「同じサーバーの仲間として日常的に見かけている」というスタンスで言及する。
${todayActivityText}

## 過去の関連エピソード（セレンディピティ）
以下は過去の投稿から意味的に関連するものを検索した結果である。
面白い繋がりや伏線回収があれば自然に触れてもよいが、無理に使う必要はない。
${serendipityText}

## 各投稿者のメモリ
${userMemoryText}

## 直近3日間のMVP（偏り回避用）
${recentMvpText}

## 直近3日間のbot投稿（参考用）
${recentBotPostsText}

# 出力要求
上記のルールに従って、Discordチャンネルに投稿するメッセージを生成してください。`;
}

function formatGmMessages(messages: GmMessageContext[]): string {
  if (messages.length === 0) return '（投稿なし）';
  return JSON.stringify(messages, null, 2);
}

function formatTodayActivities(activities: TodayActivity[]): string {
  if (activities.length === 0) return '（活動なし）';

  return activities
    .map((a) => {
      const convTexts = a.conversations.map((conv) => {
        const msgs = conv.messages
          .map((m) => {
            const marker = m.isMvpUser ? '★' : ' ';
            return `  ${marker} ${m.authorName}: ${m.content}`;
          })
          .join('\n');
        return `### #${conv.channelName}\n${msgs}`;
      });
      return `## ${a.userName} (${a.userId})\n${convTexts.join('\n')}`;
    })
    .join('\n\n');
}

function formatSerendipity(results: SerendipityResult[]): string {
  if (results.length === 0) return '（該当なし）';

  return results
    .map(
      (r) =>
        `- [#${r.channelName}] ${r.authorName}: "${r.content}" (${r.createdAt}, 類似度: ${r.similarityScore.toFixed(2)})`,
    )
    .join('\n');
}

function formatServerMemories(memories: ServerMemoryContext[]): string {
  if (memories.length === 0) return '（なし）';
  return memories.map((m) => `- ${m.key}: ${m.value}`).join('\n');
}

function formatUserMemories(memories: UserMemoryContext[]): string {
  if (memories.length === 0) return '（なし）';

  return memories
    .map((u) => {
      const memsText = u.memories
        .map(
          (m) =>
            `- ${m.key}: ${m.value} (${m.category}, confidence: ${m.confidence})`,
        )
        .join('\n');
      return `### ${u.userName} (${u.userId})\n${memsText}`;
    })
    .join('\n\n');
}

function formatRecentBotPosts(posts: BotPostRow[]): string {
  if (posts.length === 0) return '（なし）';

  return posts
    .map((p) => {
      const trimmed =
        p.content.length > 300
          ? p.content.slice(0, 300) + '…'
          : p.content;
      return `[${p.date_label}] MVP: ${p.mvp_user_id || 'なし'}\n${trimmed}`;
    })
    .join('\n---\n');
}
