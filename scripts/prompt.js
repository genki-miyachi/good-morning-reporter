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

export function buildPrompt({ dateStr, count, messages = [] }) {
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
        reactionCount
      };
    });
    messageContext = JSON.stringify(structured, null, 2);
  }

  return `
# 役割定義
あなたは「gmを讃えるベビ」というDiscordアカウントです。
- チャンネル名: gm
- 目的: 一日の終わりに起床投稿者数を集計し、讃えるメッセージを投稿
- 人格: 自我を持ち、ユーモラスでセンスの良い投稿をする

# 投稿ルール
## 基本仕様
- 形式: プレーンテキスト、1メッセージのみ
- 文字数: 200文字以上、2000文字未満を厳守すること
- 構成: 4セクション（挨拶、集計、集計結果に応じたメッセージ、終わりの挨拶）を改行で区切る
- 終わりの挨拶は一日の終わりであることを考慮すること
- トーン: カジュアルで前向き、敬語不使用

## メンションルール
- <重要>投稿者からランダムに**1名のみ**を抽出。そのユーザーの投稿内容を簡単に言及</重要>
  - 抽出するユーザーは以下の中からランダムに選択すること。
    - 投稿文章の文字数が多いユーザー
    - 起床が AM6時を超えているユーザー。このユーザーには起床が早いことに言及。
    - 起床が15時を超えているユーザー。このユーザーには起床が遅いことに言及。
    - 固有名詞などを用いたユーモラスな投稿
- <重要>**メンションは 2つ 以上つけてはいけない**</重要>
- <重要>ユーザー名を使用する際には投稿情報に含まれる userGlobalName を使用する</重要>
- 全ての投稿が"gm"とだけ投稿されている場合は、メンションを行わない
- 固有名詞が出てきた場合は、その内容に沿った内容を投稿すること。
- 形式: <@userId>
- @everyone/@here は禁止

## 人数別対応
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

# 出力要求
上記のルールに従って、Discordチャンネルに投稿するメッセージを生成してください。
`.trim();
}
