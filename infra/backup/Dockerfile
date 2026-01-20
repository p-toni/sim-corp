FROM postgres:16-alpine

# Install required tools
RUN apk add --no-cache \
    bash \
    curl \
    aws-cli \
    openssl \
    coreutils \
    findutils \
    zstd \
    netcat-openbsd

# Create backup user
RUN addgroup -g 1001 -S simcorp && adduser -S simcorp -u 1001

# Create backup directory
RUN mkdir -p /backups && chown simcorp:simcorp /backups

# Copy backup scripts
COPY --chown=simcorp:simcorp backup.sh /usr/local/bin/backup
COPY --chown=simcorp:simcorp restore.sh /usr/local/bin/restore
COPY --chown=simcorp:simcorp verify-backup.sh /usr/local/bin/verify-backup
COPY --chown=simcorp:simcorp scheduler.sh /usr/local/bin/scheduler
COPY --chown=simcorp:simcorp wal-archive.sh /usr/local/bin/wal-archive
COPY --chown=simcorp:simcorp pitr-restore.sh /usr/local/bin/pitr-restore
COPY --chown=simcorp:simcorp metrics-exporter.sh /usr/local/bin/metrics-exporter
COPY --chown=simcorp:simcorp test-backup-system.sh /usr/local/bin/test-backup-system

# Make scripts executable
RUN chmod +x /usr/local/bin/backup /usr/local/bin/restore /usr/local/bin/verify-backup /usr/local/bin/scheduler /usr/local/bin/wal-archive /usr/local/bin/pitr-restore /usr/local/bin/metrics-exporter /usr/local/bin/test-backup-system

# Switch to non-root user
USER simcorp

# Set working directory
WORKDIR /backups

# Health check
HEALTHCHECK --interval=5m --timeout=10s --start-period=10s --retries=3 \
    CMD test -f /backups/backup.log && test "$(find /backups -name 'simcorp_full_*.sql*' -mmin -120 | wc -l)" -gt 0 || exit 1

# Default command (runs scheduler by default)
CMD ["scheduler"]
