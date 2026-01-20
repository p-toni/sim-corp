#!/bin/bash
# PostgreSQL WAL Archiving Configuration
# This script configures PostgreSQL for continuous WAL archiving
# Place this in docker-entrypoint-initdb.d or run manually

set -e

PGDATA="${PGDATA:-/var/lib/postgresql/data}"
PGCONF="${PGDATA}/postgresql.conf"

echo "Configuring PostgreSQL for WAL archiving..."

# Backup original config
cp "$PGCONF" "${PGCONF}.bak"

# Configure WAL archiving
cat >> "$PGCONF" <<EOF

# ============================================================================
# WAL Archiving Configuration for PITR (Point-in-Time Recovery)
# Added by Sim-Corp backup system
# ============================================================================

# Enable WAL archiving
wal_level = replica
archive_mode = on
archive_command = '/usr/local/bin/wal-archive %p %f'
archive_timeout = 300  # Force WAL switch every 5 minutes (for <15 min RPO)

# WAL settings for performance and reliability
max_wal_size = 2GB
min_wal_size = 1GB
wal_keep_size = 512MB  # Keep at least 512MB of WAL for replicas

# Checkpoint settings
checkpoint_timeout = 15min
checkpoint_completion_target = 0.9

# Logging
log_checkpoints = on
log_connections = on
log_disconnections = on
log_duration = off
log_line_prefix = '%t [%p]: [%l-1] user=%u,db=%d,app=%a,client=%h '

EOF

echo "WAL archiving configured successfully"
echo "Archive command: /usr/local/bin/wal-archive"
echo "Archive timeout: 300 seconds (5 minutes)"
echo "This enables <15 minute RPO for disaster recovery"
