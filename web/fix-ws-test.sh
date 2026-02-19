#!/bin/bash
FILE="/Users/ianreitsma/projects/the-block/block-buster/web/tests/ws.test.js"

# Fix line 47: add  before typeof
sed -i '' '47s/ typeof data/         typeof data/' "$FILE"

# Fix message simulation calls - add  before objects  
sed -i '' 's/type: .block_update.,$/&\n         blockData,/g' "$FILE"
sed -i '' 's/       blockData,//g' "$FILE"

sed -i '' 's/type: .metrics_update.,$/&\n         metricsData,/g' "$FILE"
sed -i '' 's/       metricsData,//g' "$FILE"

sed -i '' 's/type: .network_update.,$/&\n         networkData,/g' "$FILE"
sed -i '' 's/       networkData,//g' "$FILE"

sed -i '' 's/type: .trading_update.,$/&\n         tradingData,/g' "$FILE"
sed -i '' 's/       tradingData,//g' "$FILE"

sed -i '' 's/type: .unknown_type.,$/&\n         {},/g' "$FILE"
sed -i '' 's/       {},$//' "$FILE"

sed -i '' 's/type: .custom_type.,$/&\n         { test: .data. }/g' "$FILE"
sed -i '' 's/        { test: .data. }$//' "$FILE"

# Fix malformed object on line ~309
sed -i '' 's/{ type: "test",  "hello" }/{ type: "test",  "hello" }/' "$FILE"

echo "Fixed ws.test.js parse errors"
