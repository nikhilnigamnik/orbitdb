/**
 * Exercises the local SQLite driver against a throwaway database.
 *
 * This cannot be a vitest spec: better-sqlite3's binary is rebuilt against
 * Electron's ABI by `electron-builder install-app-deps`, so requiring it from
 * plain node segfaults the runner. The pure logic lives in
 * `src/main/db/sqlite-shared.ts` and is covered by `pnpm test`; this covers the
 * driver's own SQL and wiring.
 *
 * Run with: pnpm verify:sqlite
 */
import { execFileSync } from 'child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { fileURLToPath } from 'url'

const root = join(fileURLToPath(import.meta.url), '..', '..')
const work = mkdtempSync(join(tmpdir(), 'orbitdb-sqlite-'))
const dbPath = join(work, 'fixture.db')
const CONNECTION_ID = 'verify-sqlite'

// The driver resolves connections through the store, which reads a real file in
// userData. Stub it so the harness stays self-contained.
const storeStub = join(work, 'store-stub.js')
writeFileSync(
  storeStub,
  `export function requireConnection() {
     return {
       id: ${JSON.stringify(CONNECTION_ID)},
       name: 'fixture',
       engine: 'sqlite',
       environment: 'dev',
       host: '', port: 0, database: '', user: '', password: '', ssl: false,
       filePath: ${JSON.stringify(dbPath)},
       createdAt: '', updatedAt: ''
     }
   }
   export function getConnection() { return requireConnection() }
   export function listConnections() { return [requireConnection()] }
   export function createConnection() { throw new Error('not used') }
   export function updateConnection() { throw new Error('not used') }
   export function deleteConnection() {}
  `
)

const harness = join(work, 'harness.js')
writeFileSync(
  harness,
  `import { app } from 'electron'
   import Database from 'better-sqlite3'
   import { sqliteDriver } from ${JSON.stringify(join(root, 'src/main/db/drivers/sqlite.ts'))}

   const CONNECTION_ID = ${JSON.stringify(CONNECTION_ID)}
   const failures = []
   function check(label, actual, expected) {
     const ok = JSON.stringify(actual) === JSON.stringify(expected)
     if (!ok) failures.push(label + '\\n        got  ' + JSON.stringify(actual) + '\\n        want ' + JSON.stringify(expected))
     console.log((ok ? 'PASS  ' : 'FAIL  ') + label)
   }

   app.whenReady().then(async () => {
     try {
       // Seed a database with the shapes that have caused trouble before:
       // a text primary key, a composite foreign key, and a nullable column.
       const seed = new Database(${JSON.stringify(dbPath)})
       seed.exec(\`
         create table authors (id text primary key, name text not null, retired_at text);
         create table books (
           id integer primary key,
           author_id text references authors(id),
           title text not null
         );
         create unique index books_title_idx on books (title);
         insert into authors (id, name, retired_at) values ('a1', 'Woolf', null), ('a2', 'Borges', '1986');
         insert into books (author_id, title) values ('a1', 'The Waves'), ('a2', 'Ficciones');
       \`)
       seed.close()

       const opts = { connectionId: CONNECTION_ID, schema: 'main' }

       const tables = await sqliteDriver.listTables(CONNECTION_ID, 'main')
       check('lists both tables', tables.map((t) => t.name), ['authors', 'books'])

       const authors = await sqliteDriver.tableDetails(CONNECTION_ID, 'main', 'authors')
       check('reads the text primary key', authors.primaryKey, ['id'])
       // pragma notnull reports only an explicit NOT NULL declaration — never
       // the implicit constraint on a primary key. So a key column reads as
       // nullable, which is what an insert form wants: you may omit it and let
       // SQLite assign one. 'name text not null' is the one that reads false.
       check('reads declared nullability', authors.columns.map((c) => c.isNullable), [true, false, true])
       check(
         'a primary key reads as nullable unless declared otherwise',
         (await sqliteDriver.tableDetails(CONNECTION_ID, 'main', 'books')).columns
           .filter((c) => c.isPrimaryKey)
           .map((c) => c.isNullable),
         [true]
       )

       const books = await sqliteDriver.tableDetails(CONNECTION_ID, 'main', 'books')
       check('reads the foreign key', books.foreignKeys.map((f) => [f.columns, f.referencedTable]), [[['author_id'], 'authors']])
       check('reads the unique index', books.indexes.filter((i) => i.isUnique).map((i) => i.name), ['books_title_idx'])

       const rows = await sqliteDriver.getRows({ ...opts, table: 'authors', limit: 10, offset: 0 })
       check('returns rows', rows.rows.map((r) => r.name), ['Woolf', 'Borges'])

       check('counts everything', await sqliteDriver.countRows({ ...opts, table: 'authors' }), 2)
       check(
         'counts with a filter',
         await sqliteDriver.countRows({ ...opts, table: 'authors', filters: [{ column: 'retired_at', operator: 'is null' }] }),
         1
       )

       // The bug this mirrors from D1: a text primary key must be read back by
       // rowid, since lastInsertRowid is not the key.
       const inserted = await sqliteDriver.insertRow({ ...opts, table: 'authors', values: { id: 'a3', name: 'Calvino' } })
       check('reads back a text-keyed insert', inserted.name, 'Calvino')

       const updated = await sqliteDriver.updateRow({ ...opts, table: 'authors', pk: { id: 'a3' }, values: { name: 'Italo' } })
       check('updates by primary key', updated.name, 'Italo')
       check('deletes by primary key', await sqliteDriver.deleteRow({ ...opts, table: 'authors', pk: { id: 'a3' } }), { deleted: 1 })

       const distinct = await sqliteDriver.getColumnDistinct({ ...opts, table: 'authors', column: 'name', limit: 10 })
       check('lists distinct values', distinct.sort(), ['Borges', 'Woolf'])

       const select = await sqliteDriver.runQuery({ connectionId: CONNECTION_ID, sql: 'select count(*) as n from books' })
       check('runs a select', select.rows, [{ n: 2 }])

       const write = await sqliteDriver.runQuery({ connectionId: CONNECTION_ID, sql: "insert into books (author_id, title) values ('a1', 'Orlando')" })
       check('runs a write and reports changes', write.rowCount, 1)

       const bad = await sqliteDriver.runQuery({ connectionId: CONNECTION_ID, sql: 'select * from nope' })
       check('reports a bad query without throwing', bad.success, false)

       await sqliteDriver.executeDdl({ ...opts, table: 'books', operation: { kind: 'add-column', name: 'isbn', dataType: 'TEXT', isNullable: true } })
       const afterDdl = await sqliteDriver.tableDetails(CONNECTION_ID, 'main', 'books')
       check('DDL applies and invalidates the cache', afterDdl.columns.map((c) => c.name).includes('isbn'), true)

       const graph = await sqliteDriver.getSchemaGraph(CONNECTION_ID, 'main')
       check('builds the schema graph edge', graph.edges.map((e) => [e.from.table, e.to.table]), [['books', 'authors']])

       await sqliteDriver.disconnectPool(CONNECTION_ID)
       const missing = await sqliteDriver.tableDetails(CONNECTION_ID, 'main', 'ghost').then(() => 'no error').catch((e) => e.message)
       check('reports a missing table clearly', missing, 'Table ghost not found')
     } catch (err) {
       failures.push('threw: ' + (err && err.stack ? err.stack : err))
       console.log('FAIL  harness threw')
     }

     console.log(failures.length === 0 ? '\\nall checks passed' : '\\n' + failures.length + ' failed:\\n' + failures.join('\\n'))
     app.exit(failures.length === 0 ? 0 : 1)
   })
  `
)

// The bundle keeps better-sqlite3 external, so it has to sit inside the project
// for node to resolve it — a temp dir resolves against the wrong tree.
const cacheDir = join(root, 'node_modules', '.cache')
mkdirSync(cacheDir, { recursive: true })
const bundle = join(cacheDir, 'verify-sqlite-driver.cjs')
// esbuild's --alias only rewrites bare package names, and the driver imports the
// store by relative path — so the redirect has to happen in a resolve plugin.
const { build } = await import('esbuild')
await build({
  entryPoints: [harness],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['electron', 'better-sqlite3'],
  outfile: bundle,
  plugins: [
    {
      name: 'stub-connections-store',
      setup(pluginBuild) {
        pluginBuild.onResolve({ filter: /store\/connections-store$/ }, () => ({ path: storeStub }))
      }
    }
  ]
})

let code = 0
try {
  execFileSync('pnpm', ['exec', 'electron', bundle], { cwd: root, stdio: 'inherit' })
} catch {
  code = 1
} finally {
  rmSync(work, { recursive: true, force: true })
  rmSync(bundle, { force: true })
}
process.exit(code)
