#!/bin/bash
set -euo pipefail

# PostgreSQL Backup Script for Sim-Corp
# Performs full database backups with compression and encryption
# Supports local and S3/GCS storage

# Configuration
BACKUP_DIR="${BACKUP_DIR:-/backups}"
POSTGRES_HOST="${POSTGRES_HOST:-postgres}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_DB="${POSTGRES_DB:-simcorp}"
POSTGRES_USER="${POSTGRES_USER:-simcorp}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD}"

# Backup settings
BACKUP_TYPE="${BACKUP_TYPE:-full}"  # full, incremental
RETENTION_DAYS="${RETENTION_DAYS:-30}"
COMPRESSION="${COMPRESSION:-gzip}"  # gzip, zstd, none
ENCRYPTION="${ENCRYPTION:-false}"   # true, false
ENCRYPTION_KEY="${ENCRYPTION_KEY:-}"

# S3/GCS settings (optional)
BACKUP_STORAGE="${BACKUP_STORAGE:-local}"  # local, s3, gcs
S3_BUCKET="${S3_BUCKET:-}"
GCS_BUCKET="${GCS_BUCKET:-}"

# Logging
LOG_FILE="${BACKUP_DIR}/backup.log"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_NAME="simcorp_${BACKUP_TYPE}_${TIMESTAMP}"

# Functions
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

error() {
    log "ERROR: $*"
    exit 1
}

check_prerequisites() {
    log "Checking prerequisites..."

    # Check required tools
    command -v pg_dump >/dev/null 2>&1 || error "pg_dump not found"

    # Check database connectivity
    export PGPASSWORD="$POSTGRES_PASSWORD"
    pg_isready -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" || error "PostgreSQL not ready"

    # Check backup directory
    mkdir -p "$BACKUP_DIR"

    # Check storage backend
    if [ "$BACKUP_STORAGE" = "s3" ]; then
        command -v aws >/dev/null 2>&1 || error "aws CLI not found"
        [ -n "$S3_BUCKET" ] || error "S3_BUCKET not set"
    elif [ "$BACKUP_STORAGE" = "gcs" ]; then
        command -v gsutil >/dev/null 2>&1 || error "gsutil not found"
        [ -n "$GCS_BUCKET" ] || error "GCS_BUCKET not set"
    fi

    log "Prerequisites OK"
}

perform_backup() {
    log "Starting $BACKUP_TYPE backup: $BACKUP_NAME"

    local backup_file="${BACKUP_DIR}/${BACKUP_NAME}.sql"
    local start_time=$(date +%s)

    # Perform pg_dump
    log "Running pg_dump..."
    export PGPASSWORD="$POSTGRES_PASSWORD"
    pg_dump \
        -h "$POSTGRES_HOST" \
        -p "$POSTGRES_PORT" \
        -U "$POSTGRES_USER" \
        -d "$POSTGRES_DB" \
        --format=plain \
        --no-owner \
        --no-acl \
        --verbose \
        --file="$backup_file" 2>&1 | tee -a "$LOG_FILE"

    local backup_size=$(stat -f%z "$backup_file" 2>/dev/null || stat -c%s "$backup_file")
    log "Backup completed: ${backup_size} bytes"

    # Compress
    if [ "$COMPRESSION" != "none" ]; then
        log "Compressing backup..."
        if [ "$COMPRESSION" = "gzip" ]; then
            gzip -9 "$backup_file"
            backup_file="${backup_file}.gz"
        elif [ "$COMPRESSION" = "zstd" ]; then
            zstd -19 "$backup_file" -o "${backup_file}.zst" && rm "$backup_file"
            backup_file="${backup_file}.zst"
        fi
        local compressed_size=$(stat -f%z "$backup_file" 2>/dev/null || stat -c%s "$backup_file")
        log "Compressed: ${compressed_size} bytes"
    fi

    # Encrypt
    if [ "$ENCRYPTION" = "true" ]; then
        log "Encrypting backup..."
        [ -n "$ENCRYPTION_KEY" ] || error "ENCRYPTION_KEY not set"
        openssl enc -aes-256-cbc -salt -in "$backup_file" -out "${backup_file}.enc" -k "$ENCRYPTION_KEY"
        rm "$backup_file"
        backup_file="${backup_file}.enc"
        local encrypted_size=$(stat -f%z "$backup_file" 2>/dev/null || stat -c%s "$backup_file")
        log "Encrypted: ${encrypted_size} bytes"
    fi

    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    log "Backup duration: ${duration}s"

    # Generate checksum
    local checksum=$(sha256sum "$backup_file" | awk '{print $1}')
    echo "$checksum" > "${backup_file}.sha256"
    log "Checksum: $checksum"

    # Generate metadata
    cat > "${backup_file}.meta" <<EOF
{
  "backup_name": "$BACKUP_NAME",
  "backup_type": "$BACKUP_TYPE",
  "timestamp": "$TIMESTAMP",
  "database": "$POSTGRES_DB",
  "host": "$POSTGRES_HOST",
  "size_bytes": $(stat -f%z "$backup_file" 2>/dev/null || stat -c%s "$backup_file"),
  "checksum": "$checksum",
  "compression": "$COMPRESSION",
  "encryption": "$ENCRYPTION",
  "duration_seconds": $duration
}
EOF

    echo "$backup_file"
}

upload_backup() {
    local backup_file="$1"

    if [ "$BACKUP_STORAGE" = "s3" ]; then
        log "Uploading to S3: s3://${S3_BUCKET}/backups/"
        aws s3 cp "$backup_file" "s3://${S3_BUCKET}/backups/$(basename "$backup_file")" || error "S3 upload failed"
        aws s3 cp "${backup_file}.sha256" "s3://${S3_BUCKET}/backups/$(basename "$backup_file").sha256" || error "S3 checksum upload failed"
        aws s3 cp "${backup_file}.meta" "s3://${S3_BUCKET}/backups/$(basename "$backup_file").meta" || error "S3 metadata upload failed"
        log "Upload complete"
    elif [ "$BACKUP_STORAGE" = "gcs" ]; then
        log "Uploading to GCS: gs://${GCS_BUCKET}/backups/"
        gsutil cp "$backup_file" "gs://${GCS_BUCKET}/backups/$(basename "$backup_file")" || error "GCS upload failed"
        gsutil cp "${backup_file}.sha256" "gs://${GCS_BUCKET}/backups/$(basename "$backup_file").sha256" || error "GCS checksum upload failed"
        gsutil cp "${backup_file}.meta" "gs://${GCS_BUCKET}/backups/$(basename "$backup_file").meta" || error "GCS metadata upload failed"
        log "Upload complete"
    else
        log "Backup stored locally: $backup_file"
    fi
}

cleanup_old_backups() {
    log "Cleaning up backups older than ${RETENTION_DAYS} days..."

    # Local cleanup
    find "$BACKUP_DIR" -name "simcorp_*.sql*" -mtime +${RETENTION_DAYS} -delete
    find "$BACKUP_DIR" -name "simcorp_*.sha256" -mtime +${RETENTION_DAYS} -delete
    find "$BACKUP_DIR" -name "simcorp_*.meta" -mtime +${RETENTION_DAYS} -delete

    # S3 cleanup
    if [ "$BACKUP_STORAGE" = "s3" ]; then
        aws s3 ls "s3://${S3_BUCKET}/backups/" | \
            awk -v days="$RETENTION_DAYS" 'BEGIN {now=systime()} {t=mktime($1" "$2); if ((now-t)/86400 > days) print $4}' | \
            xargs -I {} aws s3 rm "s3://${S3_BUCKET}/backups/{}"
    fi

    log "Cleanup complete"
}

# Main execution
main() {
    log "===== Backup Started ====="
    log "Type: $BACKUP_TYPE"
    log "Storage: $BACKUP_STORAGE"
    log "Compression: $COMPRESSION"
    log "Encryption: $ENCRYPTION"

    check_prerequisites
    local backup_file=$(perform_backup)
    upload_backup "$backup_file"
    cleanup_old_backups

    log "===== Backup Completed Successfully ====="
    log "Backup file: $backup_file"
}

# Run main function
main
