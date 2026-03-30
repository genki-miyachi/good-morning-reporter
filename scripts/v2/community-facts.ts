import { readFileSync } from 'fs';
import { resolve } from 'path';
import { info, warn } from '../utils/logger.js';
import { supabase } from './supabase-client.js';
import { generateEmbedding } from './embedding.js';

interface ManualMemory {
  category: string;
  key: string;
  value: string;
}

interface CommunityFactsFile {
  server: ManualMemory[];
  users: Record<string, ManualMemory[]>;
}

const GUILD_ID = process.env.GUILD_ID!;

function loadFactsFile(): CommunityFactsFile {
  const filePath = resolve(
    import.meta.dirname,
    '../../config/community-facts.json',
  );
  return JSON.parse(readFileSync(filePath, 'utf-8')) as CommunityFactsFile;
}

/**
 * community-facts.json を memories テーブルに同期する
 * source='manual', pinned=true で upsert
 */
export async function syncCommunityFacts(): Promise<number> {
  const facts = loadFactsFile();

  // JSON にないエントリを DB から削除するため、manual メモリの key セットを構築
  const jsonKeys = new Set<string>();
  for (const mem of facts.server) {
    jsonKeys.add(`server:${GUILD_ID}:${mem.key}`);
  }
  for (const [userId, memories] of Object.entries(facts.users)) {
    for (const mem of memories) {
      jsonKeys.add(`user:${userId}:${mem.key}`);
    }
  }

  // DB の manual メモリを取得
  const { data: existingManual } = await supabase
    .from('memories')
    .select('id, scope, scope_id, key')
    .eq('source', 'manual');

  // JSON から削除されたエントリを DB から削除
  let deleted = 0;
  for (const row of existingManual || []) {
    const compositeKey = `${row.scope}:${row.scope_id}:${row.key}`;
    if (!jsonKeys.has(compositeKey)) {
      await supabase.from('memories').delete().eq('id', row.id);
      deleted++;
    }
  }
  if (deleted > 0) {
    info('Deleted stale manual memories', { deleted });
  }

  // upsert
  let count = 0;

  for (const mem of facts.server) {
    const ok = await upsertManualMemory('server', GUILD_ID, mem);
    if (ok) count++;
  }

  for (const [userId, memories] of Object.entries(facts.users)) {
    for (const mem of memories) {
      const ok = await upsertManualMemory('user', userId, mem);
      if (ok) count++;
    }
  }

  info('Synced community facts', { count, deleted });
  return count;
}

async function upsertManualMemory(
  scope: string,
  scopeId: string,
  mem: ManualMemory,
): Promise<boolean> {
  try {
    const embedding = await generateEmbedding(mem.value);

    const { error } = await supabase.from('memories').upsert(
      {
        scope,
        scope_id: scopeId,
        category: mem.category,
        key: mem.key,
        value: mem.value,
        confidence: 1.0,
        pinned: true,
        source: 'manual',
        embedding,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'scope,scope_id,key' },
    );

    if (error) {
      warn('Failed to upsert manual memory', { key: mem.key, error });
      return false;
    }
    return true;
  } catch (error) {
    warn('Failed to process manual memory', { key: mem.key, error });
    return false;
  }
}

/**
 * プロンプト用: memories テーブルの pinned メモリをフォーマット
 * (community-facts.json 直読みではなく DB 経由)
 */
export async function formatPinnedMemories(): Promise<string> {
  const { data } = await supabase
    .from('memories')
    .select('scope, scope_id, category, key, value')
    .eq('pinned', true)
    .order('scope')
    .order('category');

  if (!data || data.length === 0) return '（なし）';

  const serverFacts = data.filter((m) => m.scope === 'server');
  const userFacts = data.filter((m) => m.scope === 'user');

  const sections: string[] = [];

  if (serverFacts.length > 0) {
    const lines = serverFacts.map((f) => `- ${f.key}: ${f.value}`);
    sections.push(`## コミュニティ\n${lines.join('\n')}`);
  }

  if (userFacts.length > 0) {
    const byUser = new Map<number, typeof data>();
    for (const f of userFacts) {
      const list = byUser.get(f.scope_id) || [];
      list.push(f);
      byUser.set(f.scope_id, list);
    }
    for (const [, facts] of byUser) {
      const lines = facts.map((f) => `- ${f.key}: ${f.value}`);
      sections.push(lines.join('\n'));
    }
  }

  return sections.join('\n\n');
}
