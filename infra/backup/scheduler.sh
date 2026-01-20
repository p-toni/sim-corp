#!/bin/bash
set -euo pipefail

# Backup Scheduler for Sim-Corp
# Runs backup on a schedule using simple sleep loop
# More reliable than cron in Docker containers

# Configuration
HOURLY_BACKUP="${HOURLY_BACKUP:-true}"
DAILY_BACKUP="${DAILY_BACKUP:-true}"
WEEKLY_BACKUP="${WEEKLY_BACKUP:-false}"

HOURLY_INTERVAL="${HOURLY_INTERVAL:-3600}"  # 1 hour in seconds
DAILY_TIME="${DAILY_TIME:-02:00}"           # 2 AM
WEEKLY_DAY="${WEEKLY_DAY:-0}"               # 0 = Sunday
WEEKLY_TIME="${WEEKLY_TIME:-03:00}"         # 3 AM

LOG_FILE="${BACKUP_DIR:-/backups}/scheduler.log"

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

run_backup() {
    local backup_type="$1"
    log "Running $backup_type backup..."

    export BACKUP_TYPE="$backup_type"

    if /usr/local/bin/backup; then
        log "✓ $backup_type backup completed"
    else
        log "✗ $backup_type backup failed"
    fi
}

should_run_daily() {
    local current_time=$(date +"%H:%M")
    local last_daily="${BACKUP_DIR:-/backups}/.last_daily"

    if [ "$current_time" = "$DAILY_TIME" ]; then
        # Check if we already ran today
        if [ -f "$last_daily" ]; then
            local last_date=$(cat "$last_daily")
            local today=$(date +"%Y-%m-%d")
            if [ "$last_date" = "$today" ]; then
                return 1
            fi
        fi

        # Mark as run
        date +"%Y-%m-%d" > "$last_daily"
        return 0
    fi

    return 1
}

should_run_weekly() {
    local current_day=$(date +"%w")
    local current_time=$(date +"%H:%M")
    local last_weekly="${BACKUP_DIR:-/backups}/.last_weekly"

    if [ "$current_day" = "$WEEKLY_DAY" ] && [ "$current_time" = "$WEEKLY_TIME" ]; then
        # Check if we already ran this week
        if [ -f "$last_weekly" ]; then
            local last_date=$(cat "$last_weekly")
            local week=$(date +"%Y-W%V")
            if [ "$last_date" = "$week" ]; then
                return 1
            fi
        fi

        # Mark as run
        date +"%Y-W%V" > "$last_weekly"
        return 0
    fi

    return 1
}

main() {
    log "===== Backup Scheduler Started ====="
    log "Hourly: $HOURLY_BACKUP (interval: ${HOURLY_INTERVAL}s)"
    log "Daily: $DAILY_BACKUP (time: $DAILY_TIME)"
    log "Weekly: $WEEKLY_BACKUP (day: $WEEKLY_DAY, time: $WEEKLY_TIME)"

    # Start metrics exporter in background
    if [ "${METRICS_ENABLED:-true}" = "true" ]; then
        log "Starting metrics exporter on port ${METRICS_PORT:-9101}..."
        /usr/local/bin/metrics-exporter &
        METRICS_PID=$!
        log "Metrics exporter started (PID: $METRICS_PID)"
    fi

    # Wait for PostgreSQL to be ready
    log "Waiting for PostgreSQL..."
    while ! pg_isready -h "${POSTGRES_HOST:-postgres}" -p "${POSTGRES_PORT:-5432}" -U "${POSTGRES_USER:-simcorp}"; do
        sleep 5
    done
    log "PostgreSQL ready"

    # Initial backup
    if [ "$HOURLY_BACKUP" = "true" ]; then
        run_backup "full"
    fi

    # Main loop
    while true; do
        # Hourly backup
        if [ "$HOURLY_BACKUP" = "true" ]; then
            sleep "$HOURLY_INTERVAL"
            run_backup "full"
        fi

        # Daily backup
        if [ "$DAILY_BACKUP" = "true" ] && should_run_daily; then
            run_backup "full"
        fi

        # Weekly backup
        if [ "$WEEKLY_BACKUP" = "true" ] && should_run_weekly; then
            run_backup "full"
        fi

        # Sleep for 1 minute before checking again
        sleep 60
    done
}

# Trap signals for graceful shutdown
trap 'log "Shutdown signal received, stopping scheduler..."; exit 0' SIGTERM SIGINT

# Run main loop
main
