#!/bin/sh
set -e

echo "=== WorkShift Backend Starting ==="
echo "DATABASE_URL: ${DATABASE_URL:-NOT SET}"
echo "UPLOADS_DIR: ${UPLOADS_DIR:-/app/uploads}"

# Create uploads dir
mkdir -p "${UPLOADS_DIR:-/app/uploads}"

# Verify Python can import the app before starting uvicorn
echo "--- Checking imports ---"
python -c "
import sys
try:
    from app.main import app
    print('✓ App imports OK')
except Exception as e:
    print(f'✗ Import error: {e}')
    import traceback
    traceback.print_exc()
    sys.exit(1)
"

echo "--- Starting uvicorn ---"
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
