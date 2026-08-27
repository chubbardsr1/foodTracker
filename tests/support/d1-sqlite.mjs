/**
 * A D1 stand-in backed by `node:sqlite`, plus the project's real migrations.
 *
 * D1 is SQLite, and the migrations in `drizzle/` are plain SQL, so running them
 * here exercises the same statements `wrangler d1 execute` runs locally and
 * remotely. Only the small part of the D1 client that `drizzle-orm/d1` calls is
 * implemented: `prepare().bind().run()/all()/raw()` and `batch`.
 */
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS = new URL("../../drizzle/", import.meta.url);

/** Every numbered migration, in order, exactly as Wrangler would apply them. */
export function migrationFiles() {
  return readdirSync(MIGRATIONS)
    .filter(name => name.endsWith(".sql"))
    .sort();
}

/**
 * A fresh in-memory database with every migration applied.
 *
 * `--> statement-breakpoint` begins with `--`, so SQLite reads it as a comment
 * and the whole file can be executed as written.
 */
export function migratedDatabase() {
  const database = new DatabaseSync(":memory:");
  for (const name of migrationFiles()) {
    database.exec(readFileSync(join(MIGRATIONS.pathname.replace(/^\/([A-Za-z]:)/, "$1"), name), "utf8"));
  }
  return database;
}

function toRows(statement, params) {
  return statement.all(...params);
}

export function createD1(database) {
  function prepare(sql) {
    const statement = database.prepare(sql);
    function bound(params) {
      return {
        bind: (...next) => bound(next),
        async run() {
          const info = statement.run(...params);
          return { success: true, results: [], meta: { changes: info.changes, last_row_id: Number(info.lastInsertRowid) } };
        },
        async all() {
          return { success: true, results: toRows(statement, params), meta: {} };
        },
        async raw() {
          return toRows(statement, params).map(row => Object.values(row));
        },
        async first(column) {
          const row = statement.get(...params) ?? null;
          if (row === null) return null;
          return column === undefined ? row : row[column] ?? null;
        },
      };
    }
    return bound([]);
  }

  return {
    prepare,
    async batch(statements) {
      const results = [];
      for (const statement of statements) results.push(await statement.all());
      return results;
    },
    async exec(sql) {
      database.exec(sql);
      return { count: 0, duration: 0 };
    },
  };
}

/** Installs a migrated database as the Worker's `DB` binding. */
export async function openTestDatabase() {
  const { env } = await import("cloudflare:workers");
  const database = migratedDatabase();
  env.DB = createD1(database);
  return database;
}
