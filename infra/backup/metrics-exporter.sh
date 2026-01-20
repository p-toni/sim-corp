#!/bin/bash
set -euo pipefail

# Prometheus Metrics Exporter for Sim-Corp Backup System
# Exposes backup metrics in Prometheus text format
# Run as HTTP server or write to file for node_exporter textfile collector

BACKUP_DIR="${BACKUP_DIR:-/backups}"
METRICS_PORT="${METRICS_PORT:-9101}"
METRICS_FILE="${BACKUP_DIR}/metrics.prom"

# Generate metrics
generate_metrics() {
    local now=$(date +%s)

    # Initialize metrics file
    cat > "$METRICS_FILE" <<EOF
# HELP simcorp_backup_last_success_timestamp_seconds Timestamp of last successful backup
# TYPE simcorp_backup_last_success_timestamp_seconds gauge
# HELP simcorp_backup_duration_seconds Duration of last backup in seconds
# TYPE simcorp_backup_duration_seconds gauge
# HELP simcorp_backup_size_bytes Size of last backup in bytes
# TYPE simcorp_backup_size_bytes gauge
# HELP simcorp_backup_failures_total Total number of backup failures
# TYPE simcorp_backup_failures_total counter
# HELP simcorp_backup_verification_last_status Status of last backup verification (1=success, 0=failure)
# TYPE simcorp_backup_verification_last_status gauge
# HELP simcorp_backup_disk_free_bytes Free disk space in backup directory
# TYPE simcorp_backup_disk_free_bytes gauge
# HELP simcorp_backup_disk_total_bytes Total disk space in backup directory
# TYPE simcorp_backup_disk_total_bytes gauge
# HELP simcorp_backup_count_total Total number of backups stored
# TYPE simcorp_backup_count_total gauge
# HELP simcorp_wal_archive_count_total Total number of WAL archives stored
# TYPE simcorp_wal_archive_count_total gauge
EOF

    # Last successful backup timestamp
    local latest_backup=$(find "$BACKUP_DIR" -name "simcorp_full_*.sql*" -type f 2>/dev/null | grep -v ".sha256\|.meta" | sort | tail -1)
    if [ -n "$latest_backup" ]; then
        local backup_timestamp=$(stat -c %Y "$latest_backup" 2>/dev/null || stat -f %m "$latest_backup")
        echo "simcorp_backup_last_success_timestamp_seconds $backup_timestamp" >> "$METRICS_FILE"

        # Backup size
        local backup_size=$(stat -c %s "$latest_backup" 2>/dev/null || stat -f %z "$latest_backup")
        echo "simcorp_backup_size_bytes $backup_size" >> "$METRICS_FILE"

        # Backup duration (from metadata if available)
        local meta_file="${latest_backup}.meta"
        if [ -f "$meta_file" ]; then
            local duration=$(grep -o '"duration_seconds":[0-9]*' "$meta_file" | cut -d: -f2)
            if [ -n "$duration" ]; then
                echo "simcorp_backup_duration_seconds $duration" >> "$METRICS_FILE"
            fi
        fi
    else
        echo "simcorp_backup_last_success_timestamp_seconds 0" >> "$METRICS_FILE"
        echo "simcorp_backup_size_bytes 0" >> "$METRICS_FILE"
        echo "simcorp_backup_duration_seconds 0" >> "$METRICS_FILE"
    fi

    # Backup failures (count errors in log)
    local failures=0
    if [ -f "${BACKUP_DIR}/backup.log" ]; then
        failures=$(grep -c "ERROR:" "${BACKUP_DIR}/backup.log" 2>/dev/null || echo 0)
    fi
    echo "simcorp_backup_failures_total $failures" >> "$METRICS_FILE"

    # Verification status (from last verify run)
    local verify_status=1
    if [ -f "${BACKUP_DIR}/verify.log" ]; then
        if grep -q "ERROR:" "${BACKUP_DIR}/verify.log" 2>/dev/null; then
            verify_status=0
        fi
    fi
    echo "simcorp_backup_verification_last_status $verify_status" >> "$METRICS_FILE"

    # Disk space
    local df_output=$(df -B1 "$BACKUP_DIR" | tail -1)
    local disk_total=$(echo "$df_output" | awk '{print $2}')
    local disk_free=$(echo "$df_output" | awk '{print $4}')
    echo "simcorp_backup_disk_total_bytes $disk_total" >> "$METRICS_FILE"
    echo "simcorp_backup_disk_free_bytes $disk_free" >> "$METRICS_FILE"

    # Backup count
    local backup_count=$(find "$BACKUP_DIR" -name "simcorp_full_*.sql*" -type f 2>/dev/null | grep -v ".sha256\|.meta" | wc -l)
    echo "simcorp_backup_count_total $backup_count" >> "$METRICS_FILE"

    # WAL archive count
    local wal_count=0
    if [ -d "${BACKUP_DIR}/wal" ]; then
        wal_count=$(find "${BACKUP_DIR}/wal" -type f 2>/dev/null | grep -v ".sha256" | wc -l)
    fi
    echo "simcorp_wal_archive_count_total $wal_count" >> "$METRICS_FILE"
}

# HTTP server mode
serve_http() {
    echo "Starting metrics HTTP server on port $METRICS_PORT..."

    while true; do
        generate_metrics

        # Simple HTTP server using netcat
        {
            echo -ne "HTTP/1.1 200 OK\r\nContent-Type: text/plain; version=0.0.4\r\n\r\n"
            cat "$METRICS_FILE"
        } | nc -l -p "$METRICS_PORT" -q 1 || true

        sleep 1
    done
}

# File mode (for node_exporter textfile collector)
file_mode() {
    while true; do
        generate_metrics
        sleep 60  # Update every minute
    done
}

# Main
MODE="${MODE:-http}"

case "$MODE" in
    http)
        serve_http
        ;;
    file)
        file_mode
        ;;
    once)
        generate_metrics
        cat "$METRICS_FILE"
        ;;
    *)
        echo "Unknown mode: $MODE (use http, file, or once)"
        exit 1
        ;;
esac
