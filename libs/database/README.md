# @sim-corp/database

Database abstraction layer for Sim-Corp services, supporting both SQLite (local development) and PostgreSQL (production) with a unified interface.

## Features

- **Dual Database Support**: SQLite for local dev, PostgreSQL for production
- **Unified API**: Same code works with both databases
- **Connection Pooling**: Built-in PostgreSQL connection pooling
- **Transaction Support**: Full ACID transaction support
- **Health Checks**: Built-in health check for monitoring
- **Type-Safe**: Full TypeScript support
- **Async/Await**: Modern Promise-based API

## Installation

```bash
pnpm add @sim-corp/database
```

## Usage

### Basic Usage

```typescript
import { createDatabase } from '@sim-corp/database';
import * as fs from 'node:fs';

// SQLite (local development)
const db = await createDatabase({
  type: 'sqlite',
  path: './data/mydb.db',
  schema: fs.readFileSync('./schema.sql', 'utf-8'),
});

// PostgreSQL (production)
const db = await createDatabase({
  type: 'postgres',
  host: 'localhost',
  port: 5432,
  database: 'mydb',
  user: 'myuser',
  password: 'mypass',
  poolMin: 2,
  poolMax: 10,
  schema: fs.readFileSync('./schema.sql', 'utf-8'),
});
```

### Environment-Based Configuration

```typescript
import { createDatabaseFromEnv } from '@sim-corp/database';

// Reads DATABASE_TYPE, DATABASE_PATH, DATABASE_HOST, etc. from env
const db = await createDatabaseFromEnv({
  schema: schemaSQL,
  migrate: async (db) => {
    // Run migrations
  },
});
```

### Queries

```typescript
// Query with results
const result = await db.query('SELECT * FROM users WHERE id = ?', [userId]);
console.log(result.rows); // Array of user objects
console.log(result.rowCount); // Number of rows

// Execute with changes
const exec = await db.exec('INSERT INTO users (name) VALUES (?)', ['Alice']);
console.log(exec.changes); // Number of affected rows
console.log(exec.lastInsertId); // Last inserted ID (SQLite only)
```

### Transactions

```typescript
// Manual transaction control
const tx = await db.transaction();
try {
  await tx.exec('INSERT INTO users (name) VALUES (?)', ['Bob']);
  await tx.exec('UPDATE accounts SET balance = balance + 100');
  await tx.commit();
} catch (error) {
  await tx.rollback();
  throw error;
}

// Automatic transaction (recommended)
await db.withTransaction(async (tx) => {
  await tx.exec('INSERT INTO users (name) VALUES (?)', ['Bob']);
  await tx.exec('UPDATE accounts SET balance = balance + 100');
  // Automatically commits on success, rolls back on error
});
```

### Health Checks

```typescript
const health = await db.healthCheck();
if (health.healthy) {
  console.log(`Database healthy (latency: ${health.latency}ms)`);
} else {
  console.error(`Database unhealthy: ${health.error}`);
}
```

## Environment Variables

When using `createDatabaseFromEnv()`:

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `DATABASE_TYPE` | Database type (`sqlite` or `postgres`) | No | `sqlite` |
| `DATABASE_PATH` | SQLite file path | Yes (SQLite) | - |
| `DATABASE_HOST` | PostgreSQL host | Yes (Postgres) | - |
| `DATABASE_PORT` | PostgreSQL port | No | `5432` |
| `DATABASE_NAME` | PostgreSQL database name | Yes (Postgres) | - |
| `DATABASE_USER` | PostgreSQL username | No | - |
| `DATABASE_PASSWORD` | PostgreSQL password | No | - |
| `DATABASE_SSL` | Enable SSL for PostgreSQL | No | `false` |
| `DATABASE_POOL_MIN` | Minimum pool connections | No | `2` |
| `DATABASE_POOL_MAX` | Maximum pool connections | No | `10` |

## Migration from better-sqlite3

If you're migrating from direct better-sqlite3 usage:

### Before
```typescript
import Database from 'better-sqlite3';

const db = new Database('./data/mydb.db');
db.pragma('journal_mode = WAL');

const rows = db.prepare('SELECT * FROM users').all();
db.prepare('INSERT INTO users (name) VALUES (?)').run('Alice');
```

### After
```typescript
import { createDatabase } from '@sim-corp/database';

const db = await createDatabase({
  type: 'sqlite',
  path: './data/mydb.db',
});

const result = await db.query('SELECT * FROM users');
await db.exec('INSERT INTO users (name) VALUES (?)', ['Alice']);
```

## Schema Differences

When writing portable SQL, be aware of these differences:

| Feature | SQLite | PostgreSQL |
|---------|--------|------------|
| Auto-increment | `AUTOINCREMENT` | `SERIAL` or `GENERATED ALWAYS AS IDENTITY` |
| Boolean | `INTEGER` (0/1) | `BOOLEAN` |
| Timestamp | `TEXT` (ISO 8601) | `TIMESTAMP` or `TIMESTAMPTZ` |
| JSON | `TEXT` | `JSON` or `JSONB` |
| Parameter placeholder | `?` | `$1`, `$2`, etc. (auto-converted by adapter) |

The abstraction layer handles parameter placeholders automatically - you can use `?` for both databases.

## License

Proprietary - Sim-Corp
