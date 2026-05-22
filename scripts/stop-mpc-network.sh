#!/bin/bash

echo "==================================="
echo "Stopping Lux MPC Network"
echo "==================================="
echo ""

# Kill all MPC node processes — match both the lux-mpc symlink and the
# underlying mpcd binary, in case someone launched the daemon directly.
echo "Stopping MPC nodes..."
pkill -f "(lux-mpc|mpcd) start" || true

# Give processes time to shut down gracefully
sleep 2

# Force kill if still running
pkill -9 -f "(lux-mpc|mpcd) start" 2>/dev/null || true

echo "✅ MPC nodes stopped"
echo ""

# Optional: Clean up data (commented out by default)
# echo "Cleaning up data directories..."
# rm -rf ./data/mpc/*
# echo "✅ Data cleaned"

echo "MPC network stopped successfully!"