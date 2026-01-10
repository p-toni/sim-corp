#!/bin/bash
set -euo pipefail

# PostgreSQL Restore Script for Sim-Corp
# Restores database from backup files (local or S3/GCS)
# Supports decryption and decompression

# Configuration
BACKUP_DIR="${BACKUP_DIR:-/backups}"
POSTGRES_HOST="${POSTGRES_HOST:-postgres}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_DB="${POSTGRES_DB:-simcorp}"
POSTGRES_USER="${POSTGRES_USER:-simcorp}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD}"

# Restore settings
BACKUP_FILE="${BACKUP_FILE:-}"
BACKUP_STORAGE="${BACKUP_STORAGE:-local}"  # local, s3, gcs
S3_BUCKET="${S3_BUCKET:-}"
GCS_BUCKET="${GCS_BUCKET:-}"
ENCRYPTION_KEY="${ENCRYPTION_KEY:-}"
SKIP_VERIFY="${SKIP_VERIFY:-false}"

# Logging
LOG_FILE="${BACKUP_DIR}/restore.log"

# Functions
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

error() {
    log "ERROR: $*"
    exit 1
}

list_backups() {
    log "Available backups:"

    if [ "$BACKUP_STORAGE" = "s3" ]; then
        [ -n "$S3_BUCKET" ] || error "S3_BUCKET not set"
        aws s3 ls "s3://${S3_BUCKET}/backups/" | grep "simcorp_" | awk '{print $4}'
    elif [ "$BACKUP_STORAGE" = "gcs" ]; then
        [ -n "$GCS_BUCKET" ] || error "GCS_BUCKET not set"
        gsutil ls "gs://${GCS_BUCKET}/backups/simcorp_*" | xargs -n1 basename
    else
        ls -1 "$BACKUP_DIR"/simcorp_*.sql* 2>/dev/null | xargs -n1 basename || echo "No backups found"
    fi
}

download_backup() {
    local backup_name="$1"
    local local_file="${BACKUP_DIR}/${backup_name}"

    if [ "$BACKUP_STORAGE" = "s3" ]; then
        log "Downloading from S3..."
        aws s3 cp "s3://${S3_BUCKET}/backups/${backup_name}" "$local_file" || error "S3 download failed"
        if aws s3 ls "s3://${S3_BUCKET}/backups/${backup_name}.sha256" >/dev/null 2>&1; then
            aws s3 cp "s3://${S3_BUCKET}/backups/${backup_name}.sha256" "${local_file}.sha256"
        fi
        if aws s3 ls "s3://${S3_BUCKET}/backups/${backup_name}.meta" >/dev/null 2>&1; then
            aws s3 cp "s3://${S3_BUCKET}/backups/${backup_name}.meta" "${local_file}.meta"
        fi
    elif [ "$BACKUP_STORAGE" = "gcs" ]; then
        log "Downloading from GCS..."
        gsutil cp "gs://${GCS_BUCKET}/backups/${backup_name}" "$local_file" || error "GCS download failed"
        if gsutil ls "gs://${GCS_BUCKET}/backups/${backup_name}.sha256" >/dev/null 2>&1; then
            gsutil cp "gs://${GCS_BUCKET}/backups/${backup_name}.sha256" "${local_file}.sha256"
        fi
        if gsutil ls "gs://${GCS_BUCKET}/backups/${backup_name}.meta" >/dev/null 2>&1; then
            gsutil cp "gs://${GCS_BUCKET}/backups/${backup_name}.meta" "${local_file}.meta"
        fi
    else
        [ -f "$local_file" ] || error "Backup file not found: $local_file"
    fi

    echo "$local_file"
}

verify_backup() {
    local backup_file="$1"

    if [ "$SKIP_VERIFY" = "true" ]; then
        log "Skipping verification"
        return 0
    fi

    log "Verifying backup integrity..."

    if [ -f "${backup_file}.sha256" ]; then
        local expected_checksum=$(cat "${backup_file}.sha256")
        local actual_checksum=$(sha256sum "$backup_file" | awk '{print $1}')

        if [ "$expected_checksum" = "$actual_checksum" ]; then
            log "Checksum verified: $actual_checksum"
        else
            error "Checksum mismatch! Expected: $expected_checksum, Got: $actual_checksum"
        fi
    else
        log "WARNING: No checksum file found, skipping verification"
    fi
}

prepare_restore_file() {
    local backup_file="$1"
    local restore_file="$backup_file"

    # Decrypt if needed
    if [[ "$backup_file" == *.enc ]]; then
        log "Decrypting backup..."
        [ -n "$ENCRYPTION_KEY" ] || error "ENCRYPTION_KEY not set for encrypted backup"
        local decrypted_file="${backup_file%.enc}"
        openssl enc -aes-256-cbc -d -in "$backup_file" -out "$decrypted_file" -k "$ENCRYPTION_KEY" || error "Decryption failed"
        restore_file="$decrypted_file"
    fi

    # Decompress if needed
    if [[ "$restore_file" == *.gz ]]; then
        log "Decompressing backup (gzip)..."
        gunzip -c "$restore_file" > "${restore_file%.gz}"
        restore_file="${restore_file%.gz}"
    elif [[ "$restore_file" == *.zst ]]; then
        log "Decompressing backup (zstd)..."
        zstd -d "$restore_file" -o "${restore_file%.zst}"
        restore_file="${restore_file%.zst}"
    fi

    echo "$restore_file"
}

perform_restore() {
    local sql_file="$1"

    log "Starting database restore..."
    log "Target: ${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}"

    # Check database connectivity
    export PGPASSWORD="$POSTGRES_PASSWORD"
    pg_isready -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" || error "PostgreSQL not ready"

    # Prompt for confirmation
    if [ "${FORCE_RESTORE:-false}" != "true" ]; then
        log "WARNING: This will OVERWRITE the existing database: $POSTGRES_DB"
        read -p "Are you sure you want to continue? (yes/no): " confirm
        if [ "$confirm" != "yes" ]; then
            log "Restore cancelled by user"
            exit 0
        fi
    fi

    # Drop existing connections
    log "Terminating existing connections..."
    psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d postgres <<EOF
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = '$POSTGRES_DB' AND pid <> pg_backend_pid();
EOF

    # Drop and recreate database
    log "Dropping existing database..."
    dropdb -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" "$POSTGRES_DB" || true

    log "Creating fresh database..."
    createdb -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" "$POSTGRES_DB"

    # Restore from backup
    log "Restoring from backup..."
    local start_time=$(date +%s)

    psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
        -f "$sql_file" 2>&1 | tee -a "$LOG_FILE"

    local end_time=$(date +%s)
    local duration=$((end_time - start_time))

    log "Restore completed in ${duration}s"

    # Verify restore
    log "Verifying restore..."
    local table_count=$(psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
        -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';")
    log "Tables restored: $table_count"

    log "Restore successful!"
}

# Main execution
main() {
    log "===== Restore Started ====="

    # If no backup file specified, list available backups
    if [ -z "$BACKUP_FILE" ]; then
        log "No BACKUP_FILE specified. Available backups:"
        list_backups
        error "Please specify BACKUP_FILE environment variable"
    fi

    log "Backup file: $BACKUP_FILE"
    log "Storage: $BACKUP_STORAGE"

    # Download backup if remote
    local local_backup=$(download_backup "$BACKUP_FILE")

    # Verify backup integrity
    verify_backup "$local_backup"

    # Prepare restore file (decrypt, decompress)
    local sql_file=$(prepare_restore_file "$local_backup")

    # Perform restore
    perform_restore "$sql_file"

    log "===== Restore Completed Successfully ====="
}

# Run main function
main
