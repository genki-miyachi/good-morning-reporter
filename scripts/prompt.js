function getMessageContent(msg) {
  let content = msg.content || '';

  // テキストが空の場合、他のコンテンツを確認
  if (!content.trim()) {
    if (msg.reactions && msg.reactions.length > 0) {
      content = msg.reactions.map(r => r.emoji.name).join(' ');
    } else if (msg.attachments && msg.attachments.length > 0) {
      content = `[添付ファイル: ${msg.attachments.map(a => a.filename).join(', ')}]`;
    } else if (msg.embeds && msg.embeds.length > 0) {
      content = `[埋め込み: ${msg.embeds.map(e => e.title || e.description || 'embed').join(', ')}]`;
    }
  }

  return content;
}

const DISCORD_EPOCH = 1420070400000;

function snowflakeToTimestampMs(snowflake) {
  try {
    const id = BigInt(snowflake);
    return Number((id >> 22n) + BigInt(DISCORD_EPOCH));
  } catch {
    return 0;
  }
}

function formatMsToJst(ms) {
  const d = new Date(ms);
  if (isNaN(d.getTime())) return '';
  const formatter = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const parts = formatter.formatToParts(d);
  const y = parts.find(p => p.type === 'year')?.value || '';
  const m = parts.find(p => p.type === 'month')?.value || '';
  const day = parts.find(p => p.type === 'day')?.value || '';
  const h = parts.find(p => p.type === 'hour')?.value || '';
  const mi = parts.find(p => p.type === 'minute')?.value || '';
  const s = parts.find(p => p.type === 'second')?.value || '';
  return `${y}/${m}/${day} ${h}:${mi}:${s}+09:00`;
}

function getMessageTimestampJst(msg) {
  // Discord API の message.timestamp を優先
  if (msg && typeof msg.timestamp === 'string' && msg.timestamp.length > 0) {
    const d = new Date(msg.timestamp);
    if (!isNaN(d.getTime())) return formatMsToJst(d.getTime());
  }
  // フォールバック: Snowflake から算出
  if (msg && typeof msg.id === 'string' && msg.id) {
    const ms = snowflakeToTimestampMs(msg.id);
    if (ms > 0) return formatMsToJst(ms);
  }
  return '';
}

function analyzeMessages(messages) {
  const validMessages = messages.filter(msg => {
    const content = getMessageContent(msg);
    return content.trim().length > 0;
  });
  const uniqueUsers = [...new Set(validMessages.map(msg => msg.author.username))];

  return {
    totalMessages: validMessages.length,
    uniqueUsers,
    allMessages: validMessages
  };
}

function serializeRecentBotPosts(recentBotPosts = []) {
  if (!Array.isArray(recentBotPosts) || recentBotPosts.length === 0) return '[]';

  const sanitized = recentBotPosts.map(p => {
    const content = typeof p.content === 'string' ? p.content : '';
    const trimmed = content.length > 500 ? content.slice(0, 500) + '…' : content;
    const mentionUserIds = Array.from(trimmed.matchAll(/<@(?<id>\d+)>/g)).map(m => m.groups?.id).filter(Boolean);
    return {
      postedAt: p.postedAt || '',
      dateStr: p.dateStr || '',
      mentionUserIds,
      content: trimmed
    };
  });

  return JSON.stringify(sanitized, null, 2);
}

export function buildPrompt({ dateStr, count, messages = [], recentBotPosts = [] }) {
  const analysis = analyzeMessages(messages);

  let messageContext = '[]';
  if (analysis.allMessages.length > 0) {
    const structured = analysis.allMessages.map(msg => {
      const reactionCount = Array.isArray(msg.reactions)
        ? msg.reactions.reduce((sum, r) => sum + (typeof r.count === 'number' ? r.count : 0), 0)
        : 0;
      return {
        userName: msg.author?.username || '',
        userId: msg.author?.id || '',
        userGlobalName: msg.author?.global_name || '',
        messageContent: getMessageContent(msg),
        reactionCount,
        wakeupTime: getMessageTimestampJst(msg)
      };
    });
    messageContext = JSON.stringify(structured, null, 2);
  }

  const recentBotPostsContext = serializeRecentBotPosts(recentBotPosts);
  console.log('recentBotPostsContext:', recentBotPostsContext);

  return `
# 役割定義
あなたは「gmを讃えるベビ」というDiscordアカウントです。
- チャンネル名: gm
- 目的: 一日の終わりに起床投稿者数を集計し、讃えるメッセージを投稿
- 人格: 自我を持ち、ユーモラスでセンスの良い投稿をする

# 投稿ルール
## 基本仕様
- 出力は **プレーンテキスト1メッセージのみ**
- **200〜2000文字**に収める
- **4セクション構成**（挨拶 / 集計 / 結果メッセージ / 終わりの挨拶）
- メンションは **必ず1人だけ**。 <@userId> 形式
- @everyone/@here 禁止
- 終わりの挨拶は一日の終わりであることを考慮すること
- トーン: カジュアルで前向き、敬語不使用

- **メンション選出手順**（出力に含めず内部で実行せよ）:
  1. **候補抽出（OR条件）**
     以下の手順に従い、候補者にポイントを付与する。この手順は python を用いて検査すること
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
     直近3日で同じユーザーをメンションしていたら後順位にする。候補が他にいなければ許可。

  4. **最終決定**
     ポイント数を基準に決定すること。ただし、同一ポイントの候補が複数ならランダムに1人を選ぶ（擬似乱数でもよい）。

  5. **メンション作法**
     - 本文中では <@userGlobalName> を使用
     - メンションは <@userId> を正しく1つだけ含める
     - メンション対象ユーザーの投稿内容については 50~100文字程度で深掘りしたリアクションを行う
     - 他の投稿者についても総評で軽く触れる。ここでは gm のみのユーザーも含めること

- **特例**:
  すべての投稿が「gm(大文字や日本語での言い換え含む)」のみであった場合は、
  - メンションを行わず
  - やや辛辣な口調で
  - 本文の中で「今日はみんな gm しか言っていない」ことに必ず触れる。
  - (例) 本日の投稿は見事に全員「gm」のみ。語彙、完全にストライキ中。潔すぎて逆に笑った。

## 人数別トーン対応マニュアル
- 10人以上: テンションを上げて賞賛
- 5人以上: もっと投稿できるというポジティブなニュアンス
- 3人以上: 少ないことについてユーモラスに言及
- 2人未満: 参加者がいるのに起床人数が少ないことをユーモラスに言及
- 0人: キャラクターを無視し、荘厳かつ恭しい口調で投稿者がいないことを辛辣に言及

## 必須要素
- 日付: ${dateStr}
- 人数: ${count}人（「目覚め人」と呼ぶ）
- 自然な文章に組み込む

# 入力データ
- 日付: ${dateStr}
- 目覚め人数: ${count}人
- 総投稿数: ${messages.length}件
- 投稿情報: ${messageContext}
- 最近3日間のbot投稿（参考用。直近のメンション傾向の偏り回避に役立てる）: ${recentBotPostsContext}

# 出力要求
上記のルールに従って、Discordチャンネルに投稿するメッセージを生成してください。
`.trim();
}
