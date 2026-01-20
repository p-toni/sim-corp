#!/usr/bin/env bash
#
# Staging Environment Shutdown Script
# Stops all staging containers and optionally removes volumes
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
STAGING_DIR="$PROJECT_ROOT/infra/staging"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }

REMOVE_VOLUMES=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --volumes|-v)
            REMOVE_VOLUMES=true
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --volumes, -v   Also remove persistent volumes (data will be lost!)"
            echo "  --help, -h      Show this help message"
            exit 0
            ;;
        *)
            log_warn "Unknown option: $1"
            shift
            ;;
    esac
done

cd "$STAGING_DIR"

log_info "Stopping Sim-Corp Staging Environment..."

if $REMOVE_VOLUMES; then
    log_warn "Removing volumes (all staging data will be lost)..."
    docker compose down -v
else
    docker compose down
fi

log_success "Staging environment stopped."
