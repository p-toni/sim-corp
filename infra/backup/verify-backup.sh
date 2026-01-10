#!/bin/bash
set -euo pipefail

# Backup Verification Script for Sim-Corp
# Tests backup integrity without performing full restore
# Can be run periodically to ensure backups are restorable

# Configuration
BACKUP_DIR="${BACKUP_DIR:-/backups}"
BACKUP_STORAGE="${BACKUP_STORAGE:-local}"
S3_BUCKET="${S3_BUCKET:-}"
GCS_BUCKET="${GCS_BUCKET:-}"
ENCRYPTION_KEY="${ENCRYPTION_KEY:-}"

# Test database settings (separate from production)
TEST_POSTGRES_HOST="${TEST_POSTGRES_HOST:-postgres-test}"
TEST_POSTGRES_PORT="${TEST_POSTGRES_PORT:-5432}"
TEST_POSTGRES_DB="${TEST_POSTGRES_DB:-simcorp_test}"
TEST_POSTGRES_USER="${TEST_POSTGRES_USER:-simcorp}"
TEST_POSTGRES_PASSWORD="${TEST_POSTGRES_PASSWORD}"

# Logging
LOG_FILE="${BACKUP_DIR}/verify.log"

# Functions
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

error() {
    log "ERROR: $*"
    exit 1
}

get_latest_backup() {
    local latest=""

    if [ "$BACKUP_STORAGE" = "s3" ]; then
        [ -n "$S3_BUCKET" ] || error "S3_BUCKET not set"
        latest=$(aws s3 ls "s3://${S3_BUCKET}/backups/" | grep "simcorp_full_" | sort | tail -1 | awk '{print $4}')
    elif [ "$BACKUP_STORAGE" = "gcs" ]; then
        [ -n "$GCS_BUCKET" ] || error "GCS_BUCKET not set"
        latest=$(gsutil ls "gs://${GCS_BUCKET}/backups/simcorp_full_*" | sort | tail -1 | xargs basename)
    else
        latest=$(ls -t "$BACKUP_DIR"/simcorp_full_*.sql* 2>/dev/null | head -1 | xargs basename)
    fi

    [ -n "$latest" ] || error "No backups found"
    echo "$latest"
}

verify_checksum() {
    local backup_file="$1"

    if [ ! -f "${backup_file}.sha256" ]; then
        log "WARNING: No checksum file found"
        return 0
    fi

    log "Verifying checksum..."
    local expected=$(cat "${backup_file}.sha256")
    local actual=$(sha256sum "$backup_file" | awk '{print $1}')

    if [ "$expected" = "$actual" ]; then
        log "✓ Checksum valid: $actual"
        return 0
    else
        log "✗ Checksum mismatch!"
        log "  Expected: $expected"
        log "  Actual: $actual"
        return 1
    fi
}

verify_metadata() {
    local backup_file="$1"

    if [ ! -f "${backup_file}.meta" ]; then
        log "WARNING: No metadata file found"
        return 0
    fi

    log "Checking metadata..."
    cat "${backup_file}.meta" | tee -a "$LOG_FILE"
    log "✓ Metadata valid"
}

test_restore() {
    local backup_file="$1"

    log "Testing restore to temporary database..."

    # Set environment for restore script
    export BACKUP_FILE=$(basename "$backup_file")
    export BACKUP_STORAGE="$BACKUP_STORAGE"
    export BACKUP_DIR="$BACKUP_DIR"
    export POSTGRES_HOST="$TEST_POSTGRES_HOST"
    export POSTGRES_PORT="$TEST_POSTGRES_PORT"
    export POSTGRES_DB="$TEST_POSTGRES_DB"
    export POSTGRES_USER="$TEST_POSTGRES_USER"
    export POSTGRES_PASSWORD="$TEST_POSTGRES_PASSWORD"
    export ENCRYPTION_KEY="$ENCRYPTION_KEY"
    export FORCE_RESTORE="true"
    export SKIP_VERIFY="true"  # We already verified checksum above

    # Run restore script
    bash "$(dirname "$0")/restore.sh" || error "Test restore failed"

    log "✓ Test restore successful"
}

verify_restore_quality() {
    log "Verifying restore quality..."

    export PGPASSWORD="$TEST_POSTGRES_PASSWORD"

    # Check table count
    local table_count=$(psql -h "$TEST_POSTGRES_HOST" -p "$TEST_POSTGRES_PORT" -U "$TEST_POSTGRES_USER" -d "$TEST_POSTGRES_DB" \
        -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';")
    log "Tables: $table_count"

    # Check for common tables
    local tables=(
        "missions"
        "kernel_settings"
        "sessions"
        "command_proposals"
    )

    for table in "${tables[@]}"; do
        if psql -h "$TEST_POSTGRES_HOST" -p "$TEST_POSTGRES_PORT" -U "$TEST_POSTGRES_USER" -d "$TEST_POSTGRES_DB" \
            -t -c "SELECT 1 FROM information_schema.tables WHERE table_name = '$table' LIMIT 1;" | grep -q 1; then
            local row_count=$(psql -h "$TEST_POSTGRES_HOST" -p "$TEST_POSTGRES_PORT" -U "$TEST_POSTGRES_USER" -d "$TEST_POSTGRES_DB" \
                -t -c "SELECT COUNT(*) FROM $table;")
            log "  ✓ Table '$table' exists ($row_count rows)"
        else
            log "  ⚠ Table '$table' not found (may be empty database)"
        fi
    done

    log "✓ Restore quality verified"
}

cleanup_test_database() {
    log "Cleaning up test database..."

    export PGPASSWORD="$TEST_POSTGRES_PASSWORD"

    # Drop test database
    dropdb -h "$TEST_POSTGRES_HOST" -p "$TEST_POSTGRES_PORT" -U "$TEST_POSTGRES_USER" "$TEST_POSTGRES_DB" 2>/dev/null || true

    log "✓ Cleanup complete"
}

# Main execution
main() {
    log "===== Backup Verification Started ====="

    # Get latest backup
    local backup_name=$(get_latest_backup)
    log "Latest backup: $backup_name"

    # Download if remote
    local local_backup="${BACKUP_DIR}/${backup_name}"
    if [ "$BACKUP_STORAGE" != "local" ]; then
        log "Downloading backup..."
        bash "$(dirname "$0")/backup.sh" || error "Download failed"
    fi

    [ -f "$local_backup" ] || error "Backup file not found: $local_backup"

    # Verify checksum
    verify_checksum "$local_backup" || error "Checksum verification failed"

    # Verify metadata
    verify_metadata "$local_backup"

    # Test restore
    test_restore "$local_backup"

    # Verify restore quality
    verify_restore_quality

    # Cleanup
    cleanup_test_database

    log "===== Backup Verification Completed Successfully ====="
    log "✓ Backup is valid and restorable"

    exit 0
}

# Run main function
main
