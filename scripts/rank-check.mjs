import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { rankOf } from '../worker/index.ts';

const sqlite = new DatabaseSync(':memory:');
sqlite.exec(`
  CREATE TABLE scores (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    score INTEGER NOT NULL,
    eaten INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    run_hash TEXT NOT NULL UNIQUE,
    player TEXT
  );
`);

const rows = [
  { id: 'b', score: 200, created_at: 10 },
  { id: 'a', score: 200, created_at: 10 },
  { id: 'c', score: 200, created_at: 11 },
  ...Array.from({ length: 12 }, (_, index) => ({
    id: `lower-${index}`,
    score: 190 - index * 10,
    created_at: 20 + index,
  })),
];
const insert = sqlite.prepare(
  'INSERT INTO scores (id, name, score, eaten, created_at, run_hash, player) VALUES (?, ?, ?, 0, ?, ?, ?)',
);
for (const [index, row] of rows.entries()) {
  insert.run(
    row.id,
    `P${index}`,
    row.score,
    row.created_at,
    `hash-${index}`,
    `player-${index}`,
  );
}

const env = {
  DB: {
    prepare(query) {
      const statement = sqlite.prepare(query);
      let values = [];
      return {
        bind(...next) {
          values = next;
          return this;
        },
        async all() {
          return { results: statement.all(...values) };
        },
        async run() {
          return statement.run(...values);
        },
      };
    },
  },
};

const ordered = [...rows].sort(
  (left, right) =>
    right.score - left.score ||
    left.created_at - right.created_at ||
    left.id.localeCompare(right.id),
);
for (const [index, row] of ordered.entries()) {
  assert.equal(await rankOf(env, row), index + 1);
}
assert.ok((await rankOf(env, ordered[10])) > 10);
console.log(
  'PASS: exact ranks, score ties, timestamp ties, and ranks outside the top 10.',
);
