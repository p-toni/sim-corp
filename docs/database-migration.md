# Database Migration: SQLite to PostgreSQL

## Overview

Sim-Corp services support both SQLite (for local development) and PostgreSQL (for production) through a unified database abstraction layer (`@sim-corp/database`).

## Architecture

### Database Abstraction Layer

The `@sim-corp/database` library provides:
- **Unified Interface**: Same API for both SQLite and PostgreSQL
- **Query Methods**: `query()`, `exec()`, `queryOne()`
- **Transaction Support**: `withTransaction()` for ACID guarantees
- **Migration Framework**: Automatic schema versioning and tracking
- **Connection Pooling**: Configurable for PostgreSQL (min: 2, max: 10)

### Environment Configuration

Services automatically select the database type based on environment variables:

```bash
# PostgreSQL (Production)
DATABASE_TYPE=postgres
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=simcorp
DATABASE_USER=simcorp
DATABASE_PASSWORD=your_password
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=10

# SQLite (Local Development - Default)
DATABASE_TYPE=sqlite
DATABASE_PATH=./var/service.db
# OR use service-specific paths:
KERNEL_DB_PATH=./var/kernel.db
INGESTION_DB_PATH=./var/ingestion.db
COMMAND_DB_PATH=./var/command.db
```

If `DATABASE_TYPE` is not set, services default to SQLite using their legacy path environment variables.

## Migration Status

### ✅ Completed Services

**company-kernel** - Fully migrated
- All repository methods converted to async
- Governor system (config, rate-limiter, engine) async
- Mission store and routes updated
- Tests need async updates

**command** - Partially migrated
- Connection layer uses database abstraction
- Repository layer needs conversion

### ⏳ Pending Services

- **ingestion** - Uses better-sqlite3 directly
- **eval** - Uses better-sqlite3 directly
- **analytics** - May use database
- Other services TBD

## Running with PostgreSQL

### Local Development with Docker

1. **Start PostgreSQL**:
   ```bash
   cd infra/production
   docker-compose up postgres -d
   ```

2. **Configure service**:
   ```bash
   export DATABASE_TYPE=postgres
   export DATABASE_HOST=localhost
   export DATABASE_PORT=5432
   export DATABASE_NAME=simcorp
   export DATABASE_USER=simcorp
   export DATABASE_PASSWORD=simcorp_dev_password
   ```

3. **Run service**:
   ```bash
   pnpm --filter @sim-corp/company-kernel dev
   ```

### Production Deployment

The production Docker Compose stack includes PostgreSQL by default:

```bash
cd infra/production
docker-compose up -d
```

Services automatically connect to the `postgres` service using environment variables from `.env` or defaults.

## Migrations

### How Migrations Work

1. Each service defines its schema in `getSchema()` function
2. On startup, `createDatabaseFromEnv()` runs migrations automatically
3. Migration tracking table (`__migrations`) prevents duplicate runs
4. Migrations use positional parameters (`?`) compatible with both databases

### Schema Differences

**SQLite → PostgreSQL parameter conversion**:
- Named parameters (`@name`) → Positional (`?`)
- Arrays passed directly: `[param1, param2, param3]`

**Data type mapping** (automatic):
- SQLite `TEXT` → PostgreSQL `TEXT`
- SQLite `INTEGER` → PostgreSQL `INTEGER`
- SQLite `REAL` → PostgreSQL `DOUBLE PRECISION`
- ISO timestamps work identically in both

### Running Migrations Manually

Migrations run automatically on service startup. To reset:

```bash
# SQLite - delete database file
rm -rf var/

# PostgreSQL - drop and recreate database
psql -U simcorp -c "DROP DATABASE simcorp;"
psql -U simcorp -c "CREATE DATABASE simcorp;"
```

## Testing

### Test Both Database Types

Services should test against both SQLite and PostgreSQL:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabase } from '@sim-corp/database';

describe('MyService', () => {
  describe('with SQLite', () => {
    let db: Database;

    beforeEach(async () => {
      db = await createDatabase({
        type: 'sqlite',
        path: ':memory:',
        schema: getSchema(),
      });
    });

    it('should work', async () => {
      // test implementation
    });
  });

  describe('with PostgreSQL', () => {
    let db: Database;

    beforeEach(async () => {
      db = await createDatabase({
        type: 'postgres',
        host: process.env.TEST_DB_HOST || 'localhost',
        port: parseInt(process.env.TEST_DB_PORT || '5432'),
        database: process.env.TEST_DB_NAME || 'simcorp_test',
        user: process.env.TEST_DB_USER || 'simcorp',
        password: process.env.TEST_DB_PASSWORD || 'test',
        schema: getSchema(),
      });
    });

    it('should work', async () => {
      // same test implementation
    });
  });
});
```

### CI/CD Integration

GitHub Actions should test both databases:

```yaml
jobs:
  test:
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_DB: simcorp_test
          POSTGRES_USER: simcorp
          POSTGRES_PASSWORD: test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - name: Test with SQLite
        run: pnpm test

      - name: Test with PostgreSQL
        env:
          DATABASE_TYPE: postgres
          DATABASE_HOST: postgres
          DATABASE_PORT: 5432
          DATABASE_NAME: simcorp_test
          DATABASE_USER: simcorp
          DATABASE_PASSWORD: test
        run: pnpm test
```

## Migrating a Service

### Step 1: Add Database Dependency

```json
{
  "dependencies": {
    "@sim-corp/database": "workspace:*"
  }
}
```

### Step 2: Update Connection Module

```typescript
// Before (better-sqlite3)
import Database from 'better-sqlite3';

export function openDatabase(): Database.Database {
  const db = new Database(process.env.SERVICE_DB_PATH || './var/service.db');
  db.exec(getSchema());
  return db;
}

// After (abstraction)
import { createDatabaseFromEnv, type Database } from '@sim-corp/database';

export async function openDatabase(): Promise<Database> {
  if (!process.env.DATABASE_PATH && !process.env.DATABASE_TYPE) {
    process.env.DATABASE_PATH = process.env.SERVICE_DB_PATH || './var/service.db';
  }

  return await createDatabaseFromEnv({
    schema: getSchema(),
  });
}
```

### Step 3: Convert Repository Methods

```typescript
// Before (sync)
class MyRepository {
  getById(id: string): MyRecord | undefined {
    return this.db.prepare('SELECT * FROM my_table WHERE id = @id')
      .get({ id }) as MyRecord;
  }

  insert(record: MyRecord): void {
    this.db.prepare('INSERT INTO my_table (...) VALUES (@a, @b)')
      .run(record);
  }
}

// After (async)
class MyRepository {
  async getById(id: string): Promise<MyRecord | undefined> {
    const result = await this.db.queryOne<MyRecord>(
      'SELECT * FROM my_table WHERE id = ?',
      [id]
    );
    return result;
  }

  async insert(record: MyRecord): Promise<void> {
    await this.db.exec(
      'INSERT INTO my_table (...) VALUES (?, ?)',
      [record.a, record.b]
    );
  }
}
```

### Step 4: Update Consumers

Add `await` keywords to all repository method calls:

```typescript
// Before
const record = repo.getById('123');

// After
const record = await repo.getById('123');
```

### Step 5: Update Tests

```typescript
// Before
const db = new Database(':memory:');
const repo = new MyRepository(db);
const result = repo.getById('123');

// After
const db = await createDatabase({
  type: 'sqlite',
  path: ':memory:',
  schema: getSchema(),
});
const repo = new MyRepository(db);
const result = await repo.getById('123');
```

## Performance Considerations

### Connection Pooling

PostgreSQL uses connection pooling (default: 2-10 connections). Adjust based on load:

```bash
DATABASE_POOL_MIN=5
DATABASE_POOL_MAX=20
```

### Query Performance

- **Prepared Statements**: Both databases cache query plans
- **Indexes**: Defined in schema, work identically
- **Transactions**: Use `db.withTransaction()` for multi-statement operations

### Monitoring

PostgreSQL provides rich metrics via pg_stat_* views. Monitor:
- Connection pool utilization
- Query execution time
- Lock contention
- Cache hit ratio

## Troubleshooting

### Migration Failures

**Error**: `SQLITE_CONSTRAINT_PRIMARYKEY: __migrations`
- **Cause**: Concurrent migration runs
- **Fix**: Migrations need mutex/lock mechanism

**Error**: `relation "__migrations" does not exist`
- **Cause**: Migration table creation failed
- **Fix**: Check database permissions and connection

### Connection Issues

**PostgreSQL**: `ECONNREFUSED`
- Check `DATABASE_HOST` and `DATABASE_PORT`
- Verify PostgreSQL is running: `docker-compose ps postgres`
- Check health: `docker-compose exec postgres pg_isready`

**SQLite**: `SQLITE_CANTOPEN`
- Check `DATABASE_PATH` directory exists
- Verify write permissions

### Type Errors

**Error**: `Property 'prepare' does not exist on type 'Database'`
- **Cause**: Using better-sqlite3 API instead of abstraction
- **Fix**: Convert to `db.query()` / `db.exec()`

## References

- Database Abstraction: `libs/database/README.md`
- PostgreSQL Documentation: https://www.postgresql.org/docs/16/
- Docker Compose: `infra/production/docker-compose.yml`
- T-035 Task: CONTINUITY.md
