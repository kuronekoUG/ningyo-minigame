CREATE TABLE IF NOT EXISTS scores (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  score INTEGER NOT NULL,
  eaten INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  run_hash TEXT NOT NULL UNIQUE,
  player TEXT
);
CREATE INDEX IF NOT EXISTS scores_rank ON scores (score DESC, created_at ASC);
-- 同じ人の行を探すためだけの索引。player はブラウザが覚えている
-- 乱数の印で、誰かを示すものではない。
CREATE INDEX IF NOT EXISTS scores_player ON scores (player);
-- 進んだ回のうち、名前をつけてボードにのせるのは一握りだけなので、
-- 合計はこちらで数える。run_hash が主キーなので、同じ回は二度数えない。
CREATE TABLE IF NOT EXISTS runs (
  run_hash TEXT PRIMARY KEY,
  eaten INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
