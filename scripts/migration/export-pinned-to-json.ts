/**
 * auto pinned メモリを community-facts.json に反映する一時スクリプト
 * 既存の manual エントリは保持しつつ、auto pinned を追加する
 *
 * 使い方:
 *   npx tsx scripts/migration/export-pinned-to-json.ts
 */

import { config as dotenvConfig } from 'dotenv';
dotenvConfig();

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { supabase } from '../v2/supabase-client.js';

const FACTS_PATH = resolve(
  import.meta.dirname,
  '../../config/community-facts.json',
);

interface ManualMemory {
  category: string;
  key: string;
  value: string;
}

interface CommunityFactsFile {
  server: ManualMemory[];
  users: Record<string, ManualMemory[]>;
}

async function main() {
  // 既存 JSON を読み込み
  const existing = JSON.parse(
    readFileSync(FACTS_PATH, 'utf-8'),
  ) as CommunityFactsFile;

  // auto pinned メモリを取得
  const { data, error } = await supabase
    .from('memories')
    .select('scope, scope_id, category, key, value, confirmed_count')
    .eq('pinned', true)
    .eq('source', 'auto')
    .order('scope')
    .order('scope_id')
    .order('confirmed_count', { ascending: false });

  if (error) {
    console.error('DB エラー:', error.message);
    process.exit(1);
  }

  if (!data || data.length === 0) {
    console.log('auto pinned メモリなし');
    return;
  }

  console.log(`${data.length}件の auto pinned メモリを検出\n`);

  // 既存の key セットを作成（重複回避）
  const existingServerKeys = new Set(existing.server.map((m) => m.key));
  const existingUserKeys = new Map<string, Set<string>>();
  for (const [userId, mems] of Object.entries(existing.users)) {
    existingUserKeys.set(userId, new Set(mems.map((m) => m.key)));
  }

  let added = 0;

  for (const mem of data) {
    const entry: ManualMemory = {
      category: mem.category,
      key: mem.key,
      value: mem.value,
    };

    if (mem.scope === 'server') {
      if (!existingServerKeys.has(mem.key)) {
        existing.server.push(entry);
        existingServerKeys.add(mem.key);
        added++;
        console.log(`  [server] ${mem.key}: ${mem.value} (confirmed: ${mem.confirmed_count})`);
      }
    } else if (mem.scope === 'user') {
      const userId = String(mem.scope_id);
      if (!existing.users[userId]) {
        existing.users[userId] = [];
        existingUserKeys.set(userId, new Set());
      }
      const keys = existingUserKeys.get(userId)!;
      if (!keys.has(mem.key)) {
        existing.users[userId].push(entry);
        keys.add(mem.key);
        added++;
        console.log(`  [user:${userId}] ${mem.key}: ${mem.value} (confirmed: ${mem.confirmed_count})`);
      }
    }
  }

  // 書き出し
  writeFileSync(FACTS_PATH, JSON.stringify(existing, null, 2) + '\n');
  console.log(`\n${added}件を community-facts.json に追加`);
}

main();
