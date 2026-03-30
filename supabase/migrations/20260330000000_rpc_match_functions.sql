-- ベクトル類似度検索用 RPC 関数

-- 既存関数を削除（return type 変更時に必要）
DROP FUNCTION IF EXISTS match_messages(vector, date, int);
DROP FUNCTION IF EXISTS match_messages(vector, date, int, int);
DROP FUNCTION IF EXISTS match_memories(vector, varchar, bigint[], float, int);

-- match_messages: 過去メッセージからセレンディピティ検索
-- search_months でスキャン範囲を制限（3072次元はインデックス不可のため）
CREATE OR REPLACE FUNCTION match_messages(
  query_embedding vector(3072),
  exclude_date date,
  match_count int DEFAULT 5,
  search_months int DEFAULT 6
)
RETURNS TABLE (
  id bigint,
  channel_id bigint,
  channel_name varchar(100),
  author_name varchar(100),
  content text,
  created_at timestamptz,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    m.id,
    m.channel_id,
    c.name AS channel_name,
    m.author_name,
    m.content,
    m.created_at,
    1 - (m.embedding <=> query_embedding) AS similarity
  FROM messages m
  JOIN channels c ON c.id = m.channel_id
  WHERE m.embedding IS NOT NULL
    AND m.content IS NOT NULL
    AND length(m.content) > 10
    AND m.created_at::date <> exclude_date
    AND m.created_at >= (now() - (search_months || ' months')::interval)
  ORDER BY m.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- match_memories: ユーザーメモリの関連度検索
CREATE OR REPLACE FUNCTION match_memories(
  query_embedding vector(3072),
  scope_filter varchar DEFAULT 'user',
  scope_ids bigint[] DEFAULT '{}',
  min_confidence float DEFAULT 0.5,
  match_count int DEFAULT 50
)
RETURNS TABLE (
  id int,
  scope varchar(20),
  scope_id bigint,
  category varchar(20),
  key varchar(255),
  value text,
  confidence float,
  updated_at timestamptz,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    m.id,
    m.scope,
    m.scope_id,
    m.category,
    m.key,
    m.value,
    m.confidence,
    m.updated_at,
    1 - (m.embedding <=> query_embedding) AS similarity
  FROM memories m
  WHERE m.embedding IS NOT NULL
    AND m.scope = scope_filter
    AND m.scope_id = ANY(scope_ids)
    AND m.confidence >= min_confidence
  ORDER BY m.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- NOTE: pgvector のインデックス (ivfflat/hnsw) は 2000次元が上限のため、
-- 3072次元の embedding にはインデックスを作成できない。
-- データ量が増えて sequential scan が遅くなった場合は、
-- embedding モデルを低次元のものに変更するか、次元削減を検討すること。
