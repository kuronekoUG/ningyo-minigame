import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const scores = sqliteTable(
  'scores',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    score: integer('score').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    index('scores_score_created_idx').on(table.score, table.createdAt),
  ],
);
