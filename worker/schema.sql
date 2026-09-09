CREATE TABLE IF NOT EXISTS scores (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  score INTEGER NOT NULL,
  eaten INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  run_hash TEXT NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS scores_rank ON scores (score DESC, created_at ASC);
