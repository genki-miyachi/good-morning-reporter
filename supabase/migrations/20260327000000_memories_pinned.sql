-- メモリの恒久化サポート
-- pinned: 確定事実フラグ（migration削除・減衰から除外）
-- source: 'auto'(AI抽出) | 'manual'(JSON同期)
-- confirmed_count: 異なる期間で同じ事実が抽出された回数

ALTER TABLE memories ADD COLUMN pinned BOOLEAN DEFAULT false;
ALTER TABLE memories ADD COLUMN source VARCHAR(10) DEFAULT 'auto';
ALTER TABLE memories ADD COLUMN confirmed_count INT DEFAULT 1;
