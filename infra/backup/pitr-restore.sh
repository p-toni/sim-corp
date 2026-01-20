#!/bin/bash
set -euo pipefail

# PostgreSQL Point-in-Time Recovery (PITR) Restore Script
# Restores database to a specific point in time using base backup + WAL replay

# Configuration
BACKUP_DIR="${BACKUP_DIR:-/backups}"
WAL_ARCHIVE_DIR="${BACKUP_DIR}/wal"
POSTGRES_HOST="${POSTGRES_HOST:-postgres}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_DB="${POSTGRES_DB:-simcorp}"
POSTGRES_USER="${POSTGRES_USER:-simcorp}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD}"
POSTGRES_DATA_DIR="${POSTGRES_DATA_DIR:-/var/lib/postgresql/data}"

# PITR settings
BASE_BACKUP_FILE="${BASE_BACKUP_FILE:-}"
TARGET_TIME="${TARGET_TIME:-}"  # Format: '2026-01-15 14:30:00'
TARGET_XID="${TARGET_XID:-}"    # Transaction ID (alternative to time)
TARGET_NAME="${TARGET_NAME:-}"  # Named restore point (alternative)

BACKUP_STORAGE="${BACKUP_STORAGE:-local}"
S3_BUCKET="${S3_BUCKET:-}"
GCS_BUCKET="${GCS_BUCKET:-}"
ENCRYPTION_KEY="${ENCRYPTION_KEY:-}"

# Logging
LOG_FILE="${BACKUP_DIR}/pitr-restore.log"

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

error() {
    log "ERROR: $*"
    exit 1
}

# Validate inputs
if [ -z "$BASE_BACKUP_FILE" ]; then
    log "ERROR: BASE_BACKUP_FILE required"
    log "Usage: BASE_BACKUP_FILE=simcorp_full_xxx.sql.gz TARGET_TIME='2026-01-15 14:30:00' pitr-restore.sh"
    exit 1
fi

if [ -z "$TARGET_TIME" ] && [ -z "$TARGET_XID" ] && [ -z "$TARGET_NAME" ]; then
    log "ERROR: Must specify one of: TARGET_TIME, TARGET_XID, or TARGET_NAME"
    exit 1
fi

# Download WAL files if remote
download_wal_archives() {
    log "Downloading WAL archives..."
    mkdir -p "$WAL_ARCHIVE_DIR"

    if [ "$BACKUP_STORAGE" = "s3" ]; then
        [ -n "$S3_BUCKET" ] || error "S3_BUCKET not set"
        aws s3 sync "s3://${S3_BUCKET}/wal/" "$WAL_ARCHIVE_DIR/" || error "WAL download from S3 failed"
    elif [ "$BACKUP_STORAGE" = "gcs" ]; then
        [ -n "$GCS_BUCKET" ] || error "GCS_BUCKET not set"
        gsutil -m rsync -r "gs://${GCS_BUCKET}/wal/" "$WAL_ARCHIVE_DIR/" || error "WAL download from GCS failed"
    fi

    log "WAL archives downloaded: $(ls -1 "$WAL_ARCHIVE_DIR" | wc -l) files"
}

# Create recovery configuration
create_recovery_conf() {
    local recovery_conf="${POSTGRES_DATA_DIR}/recovery.signal"
    local postgresql_conf="${POSTGRES_DATA_DIR}/postgresql.auto.conf"

    log "Creating recovery configuration..."

    # Create recovery signal file (PostgreSQL 12+)
    touch "$recovery_conf"

    # Configure recovery settings
    cat >> "$postgresql_conf" <<EOF

# PITR Recovery Configuration
restore_command = 'cp ${WAL_ARCHIVE_DIR}/%f %p'
recovery_target_action = 'promote'
EOF

    if [ -n "$TARGET_TIME" ]; then
        echo "recovery_target_time = '$TARGET_TIME'" >> "$postgresql_conf"
        log "Recovery target time: $TARGET_TIME"
    elif [ -n "$TARGET_XID" ]; then
        echo "recovery_target_xid = '$TARGET_XID'" >> "$postgresql_conf"
        log "Recovery target XID: $TARGET_XID"
    elif [ -n "$TARGET_NAME" ]; then
        echo "recovery_target_name = '$TARGET_NAME'" >> "$postgresql_conf"
        log "Recovery target name: $TARGET_NAME"
    fi

    log "Recovery configuration created"
}

# Perform PITR restore
perform_pitr_restore() {
    log "===== Point-in-Time Recovery Started ====="
    log "Base backup: $BASE_BACKUP_FILE"

    # Step 1: Restore base backup
    log "Step 1: Restoring base backup..."
    export BACKUP_FILE="$BASE_BACKUP_FILE"
    export FORCE_RESTORE=true
    bash "$(dirname "$0")/restore.sh" || error "Base backup restore failed"

    # Step 2: Stop PostgreSQL
    log "Step 2: Stopping PostgreSQL..."
    pg_ctl stop -D "$POSTGRES_DATA_DIR" -m fast || true
    sleep 2

    # Step 3: Download WAL archives
    log "Step 3: Downloading WAL archives..."
    download_wal_archives

    # Step 4: Create recovery configuration
    log "Step 4: Creating recovery configuration..."
    create_recovery_conf

    # Step 5: Start PostgreSQL in recovery mode
    log "Step 5: Starting PostgreSQL in recovery mode..."
    pg_ctl start -D "$POSTGRES_DATA_DIR" -l "${BACKUP_DIR}/recovery.log"

    # Step 6: Wait for recovery to complete
    log "Step 6: Waiting for recovery to complete..."
    local max_wait=3600  # 1 hour max
    local elapsed=0
    while [ $elapsed -lt $max_wait ]; do
        if pg_isready -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER"; then
            # Check if recovery is complete
            local in_recovery=$(psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d postgres \
                -t -c "SELECT pg_is_in_recovery();" | xargs)

            if [ "$in_recovery" = "f" ]; then
                log "Recovery completed successfully"
                break
            fi
        fi
        sleep 5
        elapsed=$((elapsed + 5))
    done

    if [ $elapsed -ge $max_wait ]; then
        error "Recovery timed out after $max_wait seconds"
    fi

    # Step 7: Verify recovery
    log "Step 7: Verifying recovery..."
    export PGPASSWORD="$POSTGRES_PASSWORD"
    local table_count=$(psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
        -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';")
    log "Tables restored: $table_count"

    log "===== PITR Restore Completed Successfully ====="
    log "Database restored to target point in time"
}

# Main execution
main() {
    log "Point-in-Time Recovery restore requested"

    # Confirmation prompt
    if [ "${FORCE_PITR_RESTORE:-false}" != "true" ]; then
        log "WARNING: This will OVERWRITE the database and restore to a specific point in time"
        read -p "Are you sure? (yes/no): " confirm
        if [ "$confirm" != "yes" ]; then
            log "PITR restore cancelled"
            exit 0
        fi
    fi

    perform_pitr_restore
}

main
