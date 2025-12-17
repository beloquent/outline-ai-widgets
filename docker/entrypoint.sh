#!/bin/sh
set -e

echo "=== Outline Widgets Container ==="
echo "Starting services at $(date -Iseconds)"
echo ""
echo "=== Environment Configuration ==="
echo "  LOG_LEVEL: ${LOG_LEVEL:-info}"
echo "  GATEWAY_PORT: ${GATEWAY_PORT:-5000}"
echo "  WIDGET_PORT: ${WIDGET_PORT:-3003}"
echo "  AI_SERVICE_PORT: ${AI_SERVICE_PORT:-3001}"
echo "  OUTLINE_URL: ${OUTLINE_URL:-not set}"
echo ""

WIDGET_PID=""
AI_PID=""
GATEWAY_PID=""

cleanup() {
  echo "[Shutdown] Received termination signal, stopping services..."
  
  if [ -n "$GATEWAY_PID" ] && kill -0 "$GATEWAY_PID" 2>/dev/null; then
    echo "[Shutdown] Stopping Gateway (PID $GATEWAY_PID)..."
    kill -TERM "$GATEWAY_PID" 2>/dev/null || true
  fi
  
  if [ -n "$AI_PID" ] && kill -0 "$AI_PID" 2>/dev/null; then
    echo "[Shutdown] Stopping AI Service (PID $AI_PID)..."
    kill -TERM "$AI_PID" 2>/dev/null || true
  fi
  
  if [ -n "$WIDGET_PID" ] && kill -0 "$WIDGET_PID" 2>/dev/null; then
    echo "[Shutdown] Stopping Widget Framework (PID $WIDGET_PID)..."
    kill -TERM "$WIDGET_PID" 2>/dev/null || true
  fi
  
  sleep 2
  
  if [ -n "$GATEWAY_PID" ] && kill -0 "$GATEWAY_PID" 2>/dev/null; then
    kill -KILL "$GATEWAY_PID" 2>/dev/null || true
  fi
  if [ -n "$AI_PID" ] && kill -0 "$AI_PID" 2>/dev/null; then
    kill -KILL "$AI_PID" 2>/dev/null || true
  fi
  if [ -n "$WIDGET_PID" ] && kill -0 "$WIDGET_PID" 2>/dev/null; then
    kill -KILL "$WIDGET_PID" 2>/dev/null || true
  fi
  
  echo "[Shutdown] All services stopped"
  exit 0
}

trap cleanup SIGTERM SIGINT SIGQUIT

wait_for_port() {
  local port=$1
  local name=$2
  local max_wait=${3:-30}
  local waited=0
  
  echo "[Health] Waiting for $name on port $port (timeout: ${max_wait}s)..."
  while ! nc -z localhost "$port" 2>/dev/null; do
    sleep 1
    waited=$((waited + 1))
    if [ "$((waited % 5))" -eq 0 ]; then
      echo "[Health] Still waiting for $name... (${waited}s elapsed)"
    fi
    if [ "$waited" -ge "$max_wait" ]; then
      echo "[Health] ERROR: $name did not start within ${max_wait}s"
      echo "[Health] Check logs above for startup errors"
      return 1
    fi
  done
  echo "[Health] SUCCESS: $name is ready on port $port (started in ${waited}s)"
  return 0
}

echo ""
echo "[1/3] Starting Widget Framework on port ${WIDGET_PORT:-3003}..."
echo "      Command: node dist/server.js"
cd /app/widget-framework
LOG_LEVEL=${LOG_LEVEL:-info} node dist/server.js &
WIDGET_PID=$!
echo "      PID: $WIDGET_PID"

echo ""
echo "[2/3] Starting AI Service on port ${AI_SERVICE_PORT:-3001}..."
echo "      Command: node dist/index.js"
cd /app/ai-service
LOG_LEVEL=${LOG_LEVEL:-info} node dist/index.js &
AI_PID=$!
echo "      PID: $AI_PID"

wait_for_port "${WIDGET_PORT:-3003}" "Widget Framework" 30
wait_for_port "${AI_SERVICE_PORT:-3001}" "AI Service" 30

echo ""
echo "[3/3] Starting Gateway on port ${GATEWAY_PORT:-5000}..."
echo "      Command: node dist/index.js"
cd /app/gateway
LOG_LEVEL=${LOG_LEVEL:-info} node dist/index.js &
GATEWAY_PID=$!
echo "      PID: $GATEWAY_PID"

wait_for_port "${GATEWAY_PORT:-5000}" "Gateway" 15

echo ""
echo "=== All services started successfully ==="
echo "  Started at: $(date -Iseconds)"
echo "  - Widget Framework: PID $WIDGET_PID (port ${WIDGET_PORT:-3003})"
echo "  - AI Service: PID $AI_PID (port ${AI_SERVICE_PORT:-3001})"
echo "  - Gateway: PID $GATEWAY_PID (port ${GATEWAY_PORT:-5000})"
echo ""
echo "=== Container ready to accept requests ==="
echo "  Set LOG_LEVEL=debug for verbose logging"
echo ""

wait $GATEWAY_PID
