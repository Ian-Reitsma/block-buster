#!/bin/bash

# Integration Verification Script
# Checks that all files are in place and properly configured

set -e

echo "==========================================="
echo "Block Buster Integration Verification"
echo "Date: $(date)"
echo "==========================================="
echo ""

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PASSED=0
FAILED=0

check_file() {
  if [ -f "$1" ]; then
    echo -e "${GREEN}✓${NC} $1"
    PASSED=$((PASSED + 1))
  else
    echo -e "${RED}✗${NC} $1 (MISSING)"
    FAILED=$((FAILED + 1))
  fi
}

check_dir() {
  if [ -d "$1" ]; then
    echo -e "${GREEN}✓${NC} $1/"
    PASSED=$((PASSED + 1))
  else
    echo -e "${RED}✗${NC} $1/ (MISSING)"
    FAILED=$((FAILED + 1))
  fi
}

check_content() {
  if grep -q "$2" "$1" 2>/dev/null; then
    echo -e "${GREEN}✓${NC} $3"
    PASSED=$((PASSED + 1))
  else
    echo -e "${RED}✗${NC} $3 (NOT FOUND)"
    FAILED=$((FAILED + 1))
  fi
}

echo "Checking directories..."
check_dir "web/src"
check_dir "web/src/components"
check_dir "web/src/styles"
check_dir "docs"
echo ""

echo "Checking core files..."
check_file "web/src/mock-data-manager.js"
check_file "web/src/components/OrderBookDepthChart.js"
check_file "web/src/components/Trading.js"
check_file "web/src/components/Trading.backup.js"
check_file "web/src/styles/trading.css"
check_file "web/src/main.js"
echo ""

echo "Checking documentation..."
check_file "docs/UX_DEEP_AUDIT_2026_FEB.md"
check_file "docs/MOCK_DATA_STRATEGY.md"
check_file "docs/IMPLEMENTATION_GUIDE.md"
check_file "WORK_SUMMARY_2026_FEB_13.md"
check_file "TEST_INTEGRATION.md"
check_file "QUICK_START.md"
echo ""

echo "Checking imports and content..."
check_content "web/src/components/Trading.js" "import mockDataManager" "Trading.js imports mockDataManager"
check_content "web/src/components/Trading.js" "import OrderBookDepthChart" "Trading.js imports OrderBookDepthChart"
check_content "web/src/main.js" "import './styles/trading.css'" "main.js imports trading.css"
check_content "web/src/mock-data-manager.js" "mockOrderBook" "mock-data-manager has mockOrderBook method"
check_content "web/src/mock-data-manager.js" "detectNode" "mock-data-manager has detectNode method"
check_content "web/src/components/OrderBookDepthChart.js" "canvas" "OrderBookDepthChart uses canvas"
echo ""

echo "Checking configuration..."
if grep -q "window.BLOCK_BUSTER_API" "web/src/mock-data-manager.js"; then
  echo -e "${GREEN}✓${NC} mockDataManager uses correct API URL"
  PASSED=$((PASSED + 1))
else
  echo -e "${YELLOW}⚠${NC} mockDataManager might be using hardcoded port"
  FAILED=$((FAILED + 1))
fi
echo ""

echo "==========================================="
echo "Results:"
echo -e "${GREEN}PASSED: $PASSED${NC}"
if [ $FAILED -gt 0 ]; then
  echo -e "${RED}FAILED: $FAILED${NC}"
else
  echo -e "${GREEN}FAILED: $FAILED${NC}"
fi
echo "==========================================="
echo ""

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}✓ Integration verification complete!${NC}"
  echo ""
  echo "Next steps:"
  echo "  1. cd web && npm run dev"
  echo "  2. Open http://localhost:3000/trading"
  echo "  3. Verify \"Demo Mode (Formula-Based)\" indicator"
  echo "  4. Check depth chart renders correctly"
  echo "  5. Test hover tooltip and click auto-fill"
  echo ""
  echo "See QUICK_START.md for detailed instructions."
  exit 0
else
  echo -e "${RED}✗ Integration verification failed!${NC}"
  echo ""
  echo "Please check the missing files/content above."
  echo "See IMPLEMENTATION_GUIDE.md for troubleshooting."
  exit 1
fi
