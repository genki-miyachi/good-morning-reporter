-- v2 初期スキーマ
-- NOTE: 既に適用済み。履歴として残す。

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE channels (
  id BIGINT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  last_fetched_message_id BIGINT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE messages (
  id BIGINT PRIMARY KEY,
  channel_id BIGINT NOT NULL,
  author_id BIGINT NOT NULL,
  author_name VARCHAR(100),
  content TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  reaction_count INT DEFAULT 0,
  reply_to_message_id BIGINT,
  conversation_id BIGINT,
  embedding vector(3072),
  fetched_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_messages_channel_id ON messages (channel_id);
CREATE INDEX idx_messages_author_id ON messages (author_id);
CREATE INDEX idx_messages_created_at ON messages (created_at);
CREATE INDEX idx_messages_conversation_id ON messages (conversation_id);
CREATE INDEX idx_messages_reply_to ON messages (reply_to_message_id);

CREATE TABLE memories (
  id SERIAL PRIMARY KEY,
  scope VARCHAR(20) NOT NULL,
  scope_id BIGINT NOT NULL,
  category VARCHAR(20),
  key VARCHAR(255) NOT NULL,
  value TEXT NOT NULL,
  confidence FLOAT DEFAULT 1.0,
  embedding vector(3072),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(scope, scope_id, key)
);

CREATE INDEX idx_memories_scope ON memories (scope, scope_id);
CREATE INDEX idx_memories_category ON memories (scope, category);
CREATE INDEX idx_memories_confidence ON memories (confidence);

CREATE TABLE bot_posts (
  id SERIAL PRIMARY KEY,
  channel_id BIGINT NOT NULL,
  date_label VARCHAR(10) NOT NULL,
  content TEXT NOT NULL,
  mvp_user_id BIGINT,
  posted_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_bot_posts_posted_at ON bot_posts (posted_at);
CREATE INDEX idx_bot_posts_mvp_user_id ON bot_posts (mvp_user_id);
