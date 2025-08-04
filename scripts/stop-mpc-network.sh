#!/bin/bash

echo "==================================="
echo "Stopping Lux MPC Network"
echo "==================================="
echo ""

# Kill all lux-mpc processes
echo "Stopping MPC nodes..."
pkill -f "lux-mpc start" || true

# Give processes time to shut down gracefully
sleep 2

# Force kill if still running
pkill -9 -f "lux-mpc start" 2>/dev/null || true

echo "✅ MPC nodes stopped"
echo ""

# Optional: Clean up data (commented out by default)
# echo "Cleaning up data directories..."
# rm -rf ./data/mpc/*
# echo "✅ Data cleaned"

echo "MPC network stopped successfully!"