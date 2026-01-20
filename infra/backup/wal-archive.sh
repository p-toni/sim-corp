#!/bin/bash
set -euo pipefail

# PostgreSQL WAL Archive Script for Sim-Corp
# Called by PostgreSQL for each completed WAL segment
# Enables Point-in-Time Recovery (PITR) with <15 minute RPO

# Usage: wal-archive.sh %p %f
# %p = full path to the WAL file
# %f = WAL filename only

# Configuration
BACKUP_DIR="${BACKUP_DIR:-/backups}"
WAL_ARCHIVE_DIR="${BACKUP_DIR}/wal"
BACKUP_STORAGE="${BACKUP_STORAGE:-local}"
S3_BUCKET="${S3_BUCKET:-}"
GCS_BUCKET="${GCS_BUCKET:-}"
ENCRYPTION="${ENCRYPTION:-false}"
ENCRYPTION_KEY="${ENCRYPTION_KEY:-}"

# Arguments from PostgreSQL
WAL_PATH="$1"
WAL_FILE="$2"

# Logging
LOG_FILE="${BACKUP_DIR}/wal-archive.log"

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

error() {
    log "ERROR: $*"
    exit 1
}

# Ensure WAL archive directory exists
mkdir -p "$WAL_ARCHIVE_DIR"

# Copy WAL file locally
local_wal="${WAL_ARCHIVE_DIR}/${WAL_FILE}"
cp "$WAL_PATH" "$local_wal" || error "Failed to copy WAL file"

# Encrypt if enabled
if [ "$ENCRYPTION" = "true" ]; then
    [ -n "$ENCRYPTION_KEY" ] || error "ENCRYPTION_KEY not set"
    openssl enc -aes-256-cbc -salt -in "$local_wal" -out "${local_wal}.enc" -k "$ENCRYPTION_KEY"
    rm "$local_wal"
    local_wal="${local_wal}.enc"
fi

# Generate checksum
sha256sum "$local_wal" | awk '{print $1}' > "${local_wal}.sha256"

# Upload to remote storage
if [ "$BACKUP_STORAGE" = "s3" ]; then
    [ -n "$S3_BUCKET" ] || error "S3_BUCKET not set"
    aws s3 cp "$local_wal" "s3://${S3_BUCKET}/wal/${WAL_FILE}" || error "S3 upload failed"
    aws s3 cp "${local_wal}.sha256" "s3://${S3_BUCKET}/wal/${WAL_FILE}.sha256" || true
    log "Archived WAL to S3: ${WAL_FILE}"
elif [ "$BACKUP_STORAGE" = "gcs" ]; then
    [ -n "$GCS_BUCKET" ] || error "GCS_BUCKET not set"
    gsutil cp "$local_wal" "gs://${GCS_BUCKET}/wal/${WAL_FILE}" || error "GCS upload failed"
    gsutil cp "${local_wal}.sha256" "gs://${GCS_BUCKET}/wal/${WAL_FILE}.sha256" || true
    log "Archived WAL to GCS: ${WAL_FILE}"
else
    log "Archived WAL locally: ${WAL_FILE}"
fi

# Clean up old WAL files (keep last 7 days locally)
find "$WAL_ARCHIVE_DIR" -name "*.enc" -o -name "[0-9A-F]*" -mtime +7 -delete 2>/dev/null || true
find "$WAL_ARCHIVE_DIR" -name "*.sha256" -mtime +7 -delete 2>/dev/null || true

exit 0
