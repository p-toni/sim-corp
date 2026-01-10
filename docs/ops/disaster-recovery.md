# Disaster Recovery Playbook

## Overview

This document provides step-by-step procedures for recovering from various disaster scenarios in the Sim-Corp production environment.

**Recovery Targets:**
- **RTO (Recovery Time Objective):** <1 hour
- **RPO (Recovery Point Objective):** <15 minutes

## Backup Architecture

### Automated Backup System

The backup service runs continuously in production and performs:

1. **Hourly Backups** (default)
   - Full PostgreSQL database dump
   - Compressed with gzip
   - Stored locally and optionally in S3/GCS
   - Retention: 30 days (configurable)

2. **Daily Backups** (2 AM UTC)
   - Full database backup
   - Long-term retention
   - Verified automatically

3. **Weekly Backups** (optional)
   - Full backup for compliance
   - Extended retention

### Backup Components

- **Backup Scripts:** `/infra/backup/*.sh`
  - `backup.sh` - Main backup script
  - `restore.sh` - Restore script
  - `verify-backup.sh` - Verification script
  - `scheduler.sh` - Backup scheduler

- **Backup Service:** Docker container (`sim-backup-prod`)
  - Runs continuously
  - Monitors PostgreSQL health
  - Automatic retry on failure

- **Storage:**
  - **Local:** `/backups` volume (backup-data)
  - **S3:** `s3://${S3_BUCKET}/backups/` (optional)
  - **GCS:** `gs://${GCS_BUCKET}/backups/` (optional)

### Backup Format

```
simcorp_full_20260110_143000.sql.gz       # Compressed backup
simcorp_full_20260110_143000.sql.gz.sha256  # Checksum
simcorp_full_20260110_143000.sql.gz.meta     # Metadata
```

**Metadata Example:**
```json
{
  "backup_name": "simcorp_full_20260110_143000",
  "backup_type": "full",
  "timestamp": "20260110_143000",
  "database": "simcorp",
  "host": "postgres",
  "size_bytes": 1234567,
  "checksum": "abc123...",
  "compression": "gzip",
  "encryption": false,
  "duration_seconds": 45
}
```

## Disaster Scenarios

### Scenario 1: Database Corruption (Minor)

**Symptoms:**
- Specific table or data corruption
- Service errors querying specific data
- Partial data loss

**Recovery Steps:**

1. **Identify affected data:**
   ```bash
   docker-compose exec postgres psql -U simcorp -d simcorp
   \dt  # List tables
   SELECT * FROM missions WHERE id = 'corrupted-id';
   ```

2. **Find latest backup:**
   ```bash
   docker-compose exec backup ls -lh /backups/simcorp_full_*.sql.gz
   ```

3. **Restore to test database:**
   ```bash
   docker-compose exec backup bash
   export BACKUP_FILE=simcorp_full_20260110_143000.sql.gz
   export TEST_POSTGRES_HOST=postgres
   export TEST_POSTGRES_DB=simcorp_recovery
   /usr/local/bin/restore
   ```

4. **Extract specific data:**
   ```bash
   psql -U simcorp -d simcorp_recovery -c "SELECT * FROM missions WHERE id = 'corrupted-id';"
   ```

5. **Restore specific rows:**
   ```bash
   psql -U simcorp -d simcorp << EOF
   INSERT INTO missions SELECT * FROM simcorp_recovery.missions WHERE id = 'corrupted-id';
   EOF
   ```

**Expected Recovery Time:** 15-30 minutes

---

### Scenario 2: Complete Database Loss

**Symptoms:**
- PostgreSQL container crashed
- Data volume corrupted
- All data inaccessible

**Recovery Steps:**

1. **Stop all services:**
   ```bash
   cd infra/production
   docker-compose down
   ```

2. **Verify backup availability:**
   ```bash
   docker-compose up -d backup
   docker-compose exec backup ls -lh /backups/
   ```

   Or check S3/GCS:
   ```bash
   aws s3 ls s3://${S3_BUCKET}/backups/
   gsutil ls gs://${GCS_BUCKET}/backups/
   ```

3. **Start fresh PostgreSQL:**
   ```bash
   docker volume rm sim-prod_postgres-data  # DANGER: Destroys data
   docker-compose up -d postgres
   ```

4. **Wait for PostgreSQL to be ready:**
   ```bash
   docker-compose exec postgres pg_isready -U simcorp -d postgres
   ```

5. **Restore from latest backup:**
   ```bash
   docker-compose exec backup bash
   export BACKUP_FILE=simcorp_full_20260110_143000.sql.gz
   export FORCE_RESTORE=true  # Skip confirmation
   /usr/local/bin/restore
   ```

6. **Verify restore:**
   ```bash
   docker-compose exec postgres psql -U simcorp -d simcorp -c "SELECT COUNT(*) FROM missions;"
   docker-compose exec postgres psql -U simcorp -d simcorp -c "SELECT COUNT(*) FROM sessions;"
   ```

7. **Restart services:**
   ```bash
   docker-compose up -d
   ```

8. **Verify service health:**
   ```bash
   docker-compose ps
   curl http://localhost:3000/ready  # company-kernel
   curl http://localhost:4001/ready  # ingestion
   ```

**Expected Recovery Time:** 30-60 minutes

---

### Scenario 3: Complete Infrastructure Failure

**Symptoms:**
- Server crashed
- Cloud region outage
- Complete data center loss

**Recovery Steps:**

1. **Provision new infrastructure:**
   - Spin up new VM/container host
   - Install Docker and Docker Compose
   - Configure networking

2. **Clone repository:**
   ```bash
   git clone https://github.com/your-org/sim-corp.git
   cd sim-corp/infra/production
   ```

3. **Configure environment:**
   ```bash
   cp .env.example .env
   vim .env  # Set POSTGRES_PASSWORD, etc.
   ```

4. **Start PostgreSQL only:**
   ```bash
   docker-compose up -d postgres
   ```

5. **Download backup from offsite storage:**
   ```bash
   docker-compose up -d backup

   # If using S3
   docker-compose exec backup bash
   aws s3 cp s3://${S3_BUCKET}/backups/simcorp_full_LATEST.sql.gz /backups/

   # If using GCS
   gsutil cp gs://${GCS_BUCKET}/backups/simcorp_full_LATEST.sql.gz /backups/
   ```

6. **Restore database:**
   ```bash
   docker-compose exec backup bash
   export BACKUP_FILE=simcorp_full_LATEST.sql.gz
   export FORCE_RESTORE=true
   /usr/local/bin/restore
   ```

7. **Start all services:**
   ```bash
   docker-compose up -d
   ```

8. **Verify full stack:**
   ```bash
   docker-compose ps
   docker-compose logs -f --tail=100
   ```

9. **Test critical paths:**
   - Create test mission
   - Ingest test telemetry
   - Verify reporting works

**Expected Recovery Time:** 1-2 hours (depending on infrastructure provisioning)

---

### Scenario 4: Accidental Data Deletion

**Symptoms:**
- User accidentally deleted critical data
- Admin ran wrong SQL command
- Bulk delete operation mistake

**Recovery Steps:**

1. **Identify deletion time:**
   ```bash
   # Check audit logs
   docker-compose exec ingestion cat /app/var/ingestion/ingestion.db | strings | grep DELETED
   ```

2. **Find backup before deletion:**
   ```bash
   docker-compose exec backup ls -lh /backups/
   # Choose backup from BEFORE deletion time
   ```

3. **Restore to temporary database:**
   ```bash
   docker-compose exec backup bash
   export BACKUP_FILE=simcorp_full_20260110_120000.sql.gz  # Before deletion
   export POSTGRES_DB=simcorp_recovery
   export FORCE_RESTORE=true
   /usr/local/bin/restore
   ```

4. **Extract deleted data:**
   ```bash
   docker-compose exec postgres psql -U simcorp -d simcorp_recovery -c "
   \COPY (SELECT * FROM missions WHERE org_id = 'affected-org') TO '/tmp/deleted_missions.csv' CSV HEADER;
   "
   ```

5. **Restore deleted data:**
   ```bash
   docker-compose exec postgres psql -U simcorp -d simcorp -c "
   \COPY missions FROM '/tmp/deleted_missions.csv' CSV HEADER;
   "
   ```

6. **Verify restoration:**
   ```bash
   docker-compose exec postgres psql -U simcorp -d simcorp -c "
   SELECT COUNT(*) FROM missions WHERE org_id = 'affected-org';
   "
   ```

7. **Clean up:**
   ```bash
   docker-compose exec postgres dropdb simcorp_recovery
   ```

**Expected Recovery Time:** 20-40 minutes

---

## Backup Verification

### Manual Verification

Test restore monthly to ensure backups are valid:

```bash
cd infra/production
docker-compose exec backup /usr/local/bin/verify-backup
```

This script:
1. Downloads latest backup
2. Verifies checksum
3. Restores to test database
4. Validates table count and data integrity
5. Cleans up test database

### Automated Verification

Add to cron or scheduled task:

```bash
# Run backup verification every Sunday at 4 AM
0 4 * * 0 cd /path/to/sim-corp/infra/production && docker-compose exec backup /usr/local/bin/verify-backup
```

## Backup Configuration

### Environment Variables

**PostgreSQL Connection:**
- `POSTGRES_HOST` - Database host (default: `postgres`)
- `POSTGRES_PORT` - Database port (default: `5432`)
- `POSTGRES_DB` - Database name (default: `simcorp`)
- `POSTGRES_USER` - Database user (default: `simcorp`)
- `POSTGRES_PASSWORD` - Database password (required)

**Backup Settings:**
- `BACKUP_DIR` - Backup directory (default: `/backups`)
- `BACKUP_TYPE` - Backup type: `full`, `incremental` (default: `full`)
- `RETENTION_DAYS` - Backup retention days (default: `30`)
- `COMPRESSION` - Compression: `gzip`, `zstd`, `none` (default: `gzip`)
- `ENCRYPTION` - Enable encryption: `true`, `false` (default: `false`)
- `ENCRYPTION_KEY` - Encryption passphrase (required if encryption enabled)

**Scheduler Settings:**
- `HOURLY_BACKUP` - Enable hourly backups (default: `true`)
- `HOURLY_INTERVAL` - Hourly interval in seconds (default: `3600`)
- `DAILY_BACKUP` - Enable daily backups (default: `true`)
- `DAILY_TIME` - Daily backup time (default: `02:00`)
- `WEEKLY_BACKUP` - Enable weekly backups (default: `false`)
- `WEEKLY_DAY` - Weekly backup day (0=Sunday) (default: `0`)
- `WEEKLY_TIME` - Weekly backup time (default: `03:00`)

**Storage Backend:**
- `BACKUP_STORAGE` - Storage type: `local`, `s3`, `gcs` (default: `local`)
- `S3_BUCKET` - S3 bucket name (required for S3)
- `GCS_BUCKET` - GCS bucket name (required for GCS)
- `AWS_ACCESS_KEY_ID` - AWS access key (required for S3)
- `AWS_SECRET_ACCESS_KEY` - AWS secret key (required for S3)
- `AWS_DEFAULT_REGION` - AWS region (default: `us-east-1`)

### Example Configurations

**Production with S3:**
```env
BACKUP_STORAGE=s3
S3_BUCKET=sim-corp-backups-prod
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=secret...
AWS_DEFAULT_REGION=us-east-1
BACKUP_ENCRYPTION=true
BACKUP_ENCRYPTION_KEY=strong-passphrase-here
RETENTION_DAYS=90
```

**Production with GCS:**
```env
BACKUP_STORAGE=gcs
GCS_BUCKET=sim-corp-backups-prod
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
BACKUP_ENCRYPTION=true
BACKUP_ENCRYPTION_KEY=strong-passphrase-here
RETENTION_DAYS=90
```

**Local development:**
```env
BACKUP_STORAGE=local
HOURLY_INTERVAL=3600
DAILY_BACKUP=false
WEEKLY_BACKUP=false
RETENTION_DAYS=7
```

## Monitoring & Alerts

### Health Checks

The backup service exposes health checks:

```bash
# Check if backup service is healthy
docker-compose ps backup

# Check backup logs
docker-compose logs backup --tail=100

# Verify recent backup exists
docker-compose exec backup ls -lh /backups/simcorp_full_*.sql.gz
```

### Prometheus Metrics (TODO: T-037)

Future metrics to expose:
- `simcorp_backup_last_success_timestamp` - Last successful backup timestamp
- `simcorp_backup_duration_seconds` - Backup duration
- `simcorp_backup_size_bytes` - Backup file size
- `simcorp_backup_failures_total` - Total backup failures

### Alert Rules (TODO: T-037)

Recommended Grafana alerts:

1. **Backup Failure:**
   ```
   ALERT BackupFailed
   IF (time() - simcorp_backup_last_success_timestamp) > 7200  # 2 hours
   ANNOTATIONS "No successful backup in 2 hours"
   ```

2. **Backup Size Anomaly:**
   ```
   ALERT BackupSizeAnomaly
   IF abs(simcorp_backup_size_bytes - avg_over_time(simcorp_backup_size_bytes[7d])) > 0.5 * avg_over_time(simcorp_backup_size_bytes[7d])
   ANNOTATIONS "Backup size changed by >50% from 7-day average"
   ```

3. **Old Backup:**
   ```
   ALERT BackupTooOld
   IF (time() - simcorp_backup_last_success_timestamp) > 86400  # 24 hours
   ANNOTATIONS "No backup in 24 hours - CRITICAL"
   ```

## Testing

### Pre-Production Testing

Before deploying backup system to production:

1. **Test backup creation:**
   ```bash
   docker-compose exec backup /usr/local/bin/backup
   docker-compose exec backup ls -lh /backups/
   ```

2. **Test restore:**
   ```bash
   docker-compose exec backup bash
   export BACKUP_FILE=simcorp_full_LATEST.sql.gz
   export TEST_POSTGRES_DB=simcorp_test
   /usr/local/bin/restore
   ```

3. **Test verification:**
   ```bash
   docker-compose exec backup /usr/local/bin/verify-backup
   ```

4. **Test S3 upload (if configured):**
   ```bash
   docker-compose exec backup bash
   aws s3 ls s3://${S3_BUCKET}/backups/
   ```

5. **Test encryption (if enabled):**
   ```bash
   docker-compose exec backup bash
   export ENCRYPTION=true
   export ENCRYPTION_KEY=test-key
   /usr/local/bin/backup
   /usr/local/bin/restore
   ```

### Disaster Recovery Drill

Conduct quarterly DR drills:

1. **Week 1:** Test Scenario 2 (Complete Database Loss)
2. **Week 2:** Test Scenario 3 (Infrastructure Failure) in staging
3. **Week 3:** Test Scenario 4 (Accidental Deletion)
4. **Week 4:** Measure RTO/RPO and document improvements

## Troubleshooting

### Backup Failed

**Error:** `pg_dump: connection failed`

**Solution:**
```bash
# Check PostgreSQL health
docker-compose exec postgres pg_isready -U simcorp

# Check backup service connectivity
docker-compose exec backup psql -h postgres -U simcorp -d simcorp -c "SELECT 1;"

# Check environment variables
docker-compose exec backup env | grep POSTGRES
```

---

**Error:** `No space left on device`

**Solution:**
```bash
# Check disk space
docker-compose exec backup df -h /backups

# Clean old backups manually
docker-compose exec backup find /backups -name "simcorp_*.sql*" -mtime +30 -delete

# Reduce RETENTION_DAYS or enable offsite storage
```

---

**Error:** `S3 upload failed: Access Denied`

**Solution:**
```bash
# Verify AWS credentials
docker-compose exec backup aws sts get-caller-identity

# Check S3 bucket permissions
docker-compose exec backup aws s3 ls s3://${S3_BUCKET}/

# Verify IAM policy includes:
# - s3:PutObject
# - s3:GetObject
# - s3:ListBucket
```

### Restore Failed

**Error:** `Database already exists`

**Solution:**
```bash
# Drop existing database first
docker-compose exec postgres dropdb -U simcorp simcorp
docker-compose exec postgres createdb -U simcorp simcorp

# Or use FORCE_RESTORE=true
export FORCE_RESTORE=true
/usr/local/bin/restore
```

---

**Error:** `Checksum mismatch`

**Solution:**
```bash
# Skip checksum verification (use with caution)
export SKIP_VERIFY=true
/usr/local/bin/restore

# Or re-download backup from S3/GCS
aws s3 cp s3://${S3_BUCKET}/backups/simcorp_full_LATEST.sql.gz /backups/ --force
```

---

**Error:** `Decryption failed`

**Solution:**
```bash
# Verify encryption key is correct
echo "$ENCRYPTION_KEY"

# Try manual decryption
openssl enc -aes-256-cbc -d -in backup.sql.gz.enc -out backup.sql.gz -k "$ENCRYPTION_KEY"
```

## Best Practices

1. **Encryption:** Always enable encryption for backups containing PII/PHI
2. **Offsite Storage:** Use S3/GCS for production backups
3. **Test Restores:** Verify backups monthly
4. **Monitor:** Set up alerts for backup failures
5. **Document:** Keep this playbook updated
6. **Access Control:** Limit backup access to authorized personnel
7. **Audit:** Log all restore operations
8. **Retention:** Follow compliance requirements (30-90 days typical)

## Compliance

### GDPR / Data Protection

- Backups contain customer data - treat as sensitive
- Encryption at rest required
- Access logs required for compliance audits
- Right to be forgotten: Implement backup purging for deleted accounts

### Audit Trail

All restore operations are logged:
- Timestamp
- User who performed restore
- Backup file used
- Restore target
- Success/failure status

Logs stored in `/backups/restore.log` and forwarded to centralized logging (TODO: T-037).

## Appendix

### Useful Commands

```bash
# List all backups
docker-compose exec backup ls -lhrt /backups/

# Get backup metadata
docker-compose exec backup cat /backups/simcorp_full_LATEST.sql.gz.meta | jq .

# Calculate backup frequency
docker-compose exec backup bash -c "ls -1 /backups/simcorp_full_*.sql.gz | wc -l"

# Check backup size trend
docker-compose exec backup bash -c "ls -lh /backups/simcorp_full_*.sql.gz | tail -10"

# Force manual backup
docker-compose exec backup /usr/local/bin/backup

# Download backup from S3
aws s3 cp s3://${S3_BUCKET}/backups/simcorp_full_20260110_143000.sql.gz ./

# Upload local backup to S3
aws s3 cp ./simcorp_full_20260110_143000.sql.gz s3://${S3_BUCKET}/backups/
```

### Contact Information

**On-Call Engineer:** [Your contact info]
**DevOps Team:** [Team contact]
**Backup Service Owner:** [Owner contact]

### References

- PostgreSQL Backup Documentation: https://www.postgresql.org/docs/16/backup.html
- Docker Volumes: https://docs.docker.com/storage/volumes/
- AWS S3 Security: https://docs.aws.amazon.com/AmazonS3/latest/userguide/security.html
- T-039 Task: CONTINUITY.md
