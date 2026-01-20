# Sim-Corp Backup & Disaster Recovery System

Comprehensive backup solution for PostgreSQL with Point-in-Time Recovery (PITR), encryption, and offsite storage.

## Features

- ✅ **Automated Backups** - Hourly, daily, and weekly scheduled backups
- ✅ **Point-in-Time Recovery (PITR)** - Recover to any point with <15 minute RPO
- ✅ **Compression** - gzip or zstd compression
- ✅ **Encryption** - AES-256-CBC encryption at rest
- ✅ **Offsite Storage** - S3 and GCS support
- ✅ **Verification** - Automated backup testing
- ✅ **Metrics** - Prometheus metrics exporter
- ✅ **Monitoring** - Grafana dashboards and alerts

## Quick Start

### 1. Deploy Backup Service

```bash
cd infra/production
docker-compose up -d backup
```

### 2. Verify Backup is Running

```bash
# Check service status
docker-compose ps backup

# View logs
docker-compose logs -f backup

# Check for backups
docker-compose exec backup ls -lh /backups/
```

### 3. Test Backup System

```bash
docker-compose exec backup /usr/local/bin/test-backup-system
```

## Components

### Scripts

| Script | Purpose |
|--------|---------|
| `backup.sh` | Main backup script (pg_dump) |
| `restore.sh` | Restore from backup |
| `verify-backup.sh` | Automated backup verification |
| `scheduler.sh` | Backup scheduling daemon |
| `wal-archive.sh` | WAL archiving for PITR |
| `pitr-restore.sh` | Point-in-time recovery |
| `metrics-exporter.sh` | Prometheus metrics |
| `test-backup-system.sh` | Comprehensive testing |
| `postgres-wal-config.sh` | PostgreSQL WAL configuration |

### Configuration

Configure via environment variables in `docker-compose.yml`:

```yaml
environment:
  # PostgreSQL connection
  POSTGRES_HOST: postgres
  POSTGRES_PORT: 5432
  POSTGRES_DB: simcorp
  POSTGRES_USER: simcorp
  POSTGRES_PASSWORD: secret

  # Backup settings
  BACKUP_DIR: /backups
  RETENTION_DAYS: 30
  COMPRESSION: gzip  # or zstd, none
  ENCRYPTION: true
  ENCRYPTION_KEY: your-strong-key

  # Scheduler
  HOURLY_BACKUP: true
  HOURLY_INTERVAL: 3600
  DAILY_BACKUP: true
  DAILY_TIME: "02:00"

  # Storage
  BACKUP_STORAGE: s3  # or gcs, local
  S3_BUCKET: sim-corp-backups-prod
  AWS_ACCESS_KEY_ID: ...
  AWS_SECRET_ACCESS_KEY: ...

  # Metrics
  METRICS_ENABLED: true
  METRICS_PORT: 9101
```

## Usage

### Manual Backup

```bash
docker-compose exec backup /usr/local/bin/backup
```

### List Backups

```bash
# Local
docker-compose exec backup ls -lh /backups/

# S3
docker-compose exec backup aws s3 ls s3://bucket/backups/

# GCS
docker-compose exec backup gsutil ls gs://bucket/backups/
```

### Restore from Backup

```bash
docker-compose exec backup bash
export BACKUP_FILE=simcorp_full_20260115_140000.sql.gz
export FORCE_RESTORE=true
/usr/local/bin/restore
```

### Point-in-Time Recovery (PITR)

```bash
docker-compose exec backup bash
export BASE_BACKUP_FILE=simcorp_full_20260115_140000.sql.gz
export TARGET_TIME='2026-01-15 14:35:00'
export FORCE_PITR_RESTORE=true
/usr/local/bin/pitr-restore
```

### Verify Backup

```bash
docker-compose exec backup /usr/local/bin/verify-backup
```

## Monitoring

### Prometheus Metrics

Available at `http://backup:9101/metrics`:

- `simcorp_backup_last_success_timestamp_seconds` - Last backup time
- `simcorp_backup_duration_seconds` - Backup duration
- `simcorp_backup_size_bytes` - Backup file size
- `simcorp_backup_failures_total` - Total failures
- `simcorp_backup_verification_last_status` - Verification status
- `simcorp_backup_disk_free_bytes` - Free disk space
- `simcorp_backup_count_total` - Number of backups
- `simcorp_wal_archive_count_total` - Number of WAL archives

### Grafana Dashboard

View backup status in Grafana:
- Navigate to http://localhost:3001
- Open "Backup & Disaster Recovery" dashboard

### Alerts

Prometheus alerts configured in `prometheus/alerts.yml`:
- `BackupServiceDown` - Service is down for >5 minutes
- `NoRecentBackup` - No backup in >2 hours (CRITICAL)
- `BackupTooOld` - No backup in >1 hour (WARNING)
- `BackupSizeAnomaly` - Size changed >50% from average
- `BackupFailures` - Backup failures detected
- `BackupVerificationFailed` - Verification test failed

## WAL Archiving (PITR)

### Enable on PostgreSQL

**Option 1: Automatic (recommended)**
Add to docker-compose.yml:
```yaml
postgres:
  volumes:
    - ../backup/postgres-wal-config.sh:/docker-entrypoint-initdb.d/10-wal-config.sh:ro
```

**Option 2: Manual**
```bash
docker-compose exec postgres bash
/usr/local/bin/postgres-wal-config.sh
pg_ctl restart
```

### Verify WAL Archiving

```bash
# Check PostgreSQL configuration
docker-compose exec postgres psql -U simcorp -c "SHOW wal_level;"
docker-compose exec postgres psql -U simcorp -c "SHOW archive_mode;"
docker-compose exec postgres psql -U simcorp -c "SHOW archive_command;"

# Check WAL archives
docker-compose exec backup ls -lh /backups/wal/
```

### Recovery Point Objective (RPO)

With WAL archiving enabled:
- WAL segments archived every **5 minutes** (configurable)
- Achieves **<15 minute RPO**
- Can recover to any point within WAL retention

## Disaster Recovery

See the comprehensive [Disaster Recovery Playbook](../../docs/ops/disaster-recovery.md) for:
- Recovery procedures for 5 disaster scenarios
- RTO/RPO targets
- Step-by-step recovery instructions
- Troubleshooting guide

### Common Scenarios

**Complete Database Loss** - RTO: 30-60 minutes
**Point-in-Time Recovery** - RTO: 30-60 minutes, RPO: <15 minutes
**Accidental Deletion** - RTO: 20-40 minutes
**Infrastructure Failure** - RTO: 1-2 hours

## Testing

### Automated Test Suite

```bash
docker-compose exec backup /usr/local/bin/test-backup-system
```

Tests:
1. ✓ Prerequisites check
2. ✓ Backup creation
3. ✓ Checksum verification
4. ✓ Restore functionality
5. ✓ Metrics exporter
6. ✓ WAL archiving
7. ✓ Verification script
8. ✓ Cleanup
9. ✓ Encryption

### Manual Testing

```bash
# 1. Create backup
docker-compose exec backup /usr/local/bin/backup

# 2. Verify checksum
docker-compose exec backup bash
BACKUP_FILE=$(ls -t /backups/simcorp_full_*.sql.gz | head -1)
sha256sum -c "${BACKUP_FILE}.sha256"

# 3. Test restore
export BACKUP_FILE=$(basename $BACKUP_FILE)
export TEST_POSTGRES_DB=simcorp_test
/usr/local/bin/restore

# 4. Cleanup
dropdb -U simcorp simcorp_test
```

## Architecture

```
┌─────────────────┐
│   PostgreSQL    │
│   (Primary DB)  │
└────────┬────────┘
         │ pg_dump
         │ WAL archiving
         ▼
┌─────────────────┐
│  Backup Service │
│  (Container)    │
├─────────────────┤
│ • Scheduler     │
│ • Backup        │
│ • Restore       │
│ • WAL Archive   │
│ • Metrics       │
└────────┬────────┘
         │
    ┌────┴────┬────────┐
    ▼         ▼        ▼
┌────────┐ ┌────┐  ┌────┐
│ Local  │ │ S3 │  │GCS │
│ Volume │ └────┘  └────┘
└────────┘
    │
    ▼
┌────────────────┐
│  Prometheus    │
│  (Metrics)     │
└────────────────┘
    │
    ▼
┌────────────────┐
│   Grafana      │
│  (Dashboard)   │
└────────────────┘
```

## Troubleshooting

### Backup Failures

**Error: Connection refused**
```bash
# Check PostgreSQL is running
docker-compose exec postgres pg_isready

# Check network connectivity
docker-compose exec backup ping postgres
```

**Error: Disk space**
```bash
# Check disk usage
docker-compose exec backup df -h /backups

# Clean old backups
docker-compose exec backup find /backups -name "*.sql*" -mtime +30 -delete
```

**Error: S3 upload failed**
```bash
# Verify credentials
docker-compose exec backup aws sts get-caller-identity

# Test S3 access
docker-compose exec backup aws s3 ls s3://bucket/
```

### Restore Issues

**Error: Database exists**
```bash
# Drop database first
dropdb -U simcorp simcorp

# Or use FORCE_RESTORE=true
export FORCE_RESTORE=true
/usr/local/bin/restore
```

**Error: Checksum mismatch**
```bash
# Re-download from remote
aws s3 cp s3://bucket/backups/file.sql.gz /backups/ --force

# Or skip verification
export SKIP_VERIFY=true
/usr/local/bin/restore
```

## Security

### Encryption

All backups should be encrypted in production:

```bash
ENCRYPTION=true
ENCRYPTION_KEY=your-very-strong-passphrase-here
```

Uses AES-256-CBC with OpenSSL.

### Access Control

- Backup service runs as non-root user (`simcorp`)
- PostgreSQL credentials stored in environment variables
- S3/GCS credentials use IAM roles when possible
- Backup files have restricted permissions (600)

### Compliance

- **GDPR/Data Protection**: Backups are encrypted at rest
- **Retention**: Configurable (default 30 days)
- **Audit Logs**: All operations logged
- **Right to be Forgotten**: Manual backup purging required

## Performance

### Typical Performance

| Database Size | Backup Time | Restore Time |
|---------------|-------------|--------------|
| 100 MB        | 5-10s       | 10-20s       |
| 1 GB          | 30-60s      | 1-2 min      |
| 10 GB         | 5-10 min    | 10-20 min    |
| 100 GB        | 30-60 min   | 1-2 hours    |

### Optimization

- Use `zstd` for faster compression
- Enable parallel backup (PostgreSQL 12+)
- Use faster storage for backup volume
- Increase `max_wal_size` for large databases

## Contributing

When modifying backup scripts:
1. Update this README
2. Run test suite: `/usr/local/bin/test-backup-system`
3. Update disaster recovery playbook if procedures change
4. Test in staging before production

## Support

- **Documentation**: `/docs/ops/disaster-recovery.md`
- **Logs**: `docker-compose logs backup`
- **Metrics**: http://backup:9101/metrics
- **Dashboard**: http://localhost:3001 (Grafana)

## License

Internal Sim-Corp infrastructure - Proprietary
