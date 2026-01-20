#!/usr/bin/env bash
#
# Staging Environment Startup Script
# Builds and starts all services in Docker containers for local testing
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
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Parse arguments
BUILD_FLAG=""
DETACH_FLAG="-d"
FOLLOW_LOGS=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --build|-b)
            BUILD_FLAG="--build"
            shift
            ;;
        --attach|-a)
            DETACH_FLAG=""
            shift
            ;;
        --logs|-l)
            FOLLOW_LOGS=true
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --build, -b     Force rebuild of all images"
            echo "  --attach, -a    Run in foreground (don't detach)"
            echo "  --logs, -l      Follow logs after starting"
            echo "  --help, -h      Show this help message"
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

cd "$STAGING_DIR"

# Check for .env file
if [[ ! -f .env ]]; then
    log_warn "No .env file found. Creating from .env.example..."
    cp .env.example .env
    log_info "Created .env file. Edit it to customize settings."
fi

log_info "Starting Sim-Corp Staging Environment..."
log_info "Working directory: $STAGING_DIR"

# Build and start services
if [[ -n "$BUILD_FLAG" ]]; then
    log_info "Building images (this may take a while on first run)..."
fi

docker compose up $BUILD_FLAG $DETACH_FLAG

if [[ -n "$DETACH_FLAG" ]]; then
    log_success "Staging environment started!"
    echo ""
    echo "Services available at:"
    echo "  - Company Kernel:    http://localhost:3000"
    echo "  - Ingestion:         http://localhost:4001"
    echo "  - Sim-Twin:          http://localhost:4002"
    echo "  - Sim-Publisher:     http://localhost:4003"
    echo "  - Command:           http://localhost:3004"
    echo "  - Driver-Bridge:     http://localhost:4004"
    echo "  - Event-Inference:   http://localhost:4005"
    echo "  - Analytics:         http://localhost:4006"
    echo "  - Eval:              http://localhost:4007"
    echo "  - Report-Worker:     http://localhost:4008"
    echo "  - Governance:        http://localhost:4009"
    echo "  - Dispatcher:        http://localhost:4010"
    echo "  - MQTT:              mqtt://localhost:1883"
    echo ""
    echo "Commands:"
    echo "  View logs:     docker compose -f $STAGING_DIR/docker-compose.yml logs -f"
    echo "  Stop:          docker compose -f $STAGING_DIR/docker-compose.yml down"
    echo "  Check health:  docker compose -f $STAGING_DIR/docker-compose.yml ps"
    echo ""

    if $FOLLOW_LOGS; then
        log_info "Following logs..."
        docker compose logs -f
    fi
fi
