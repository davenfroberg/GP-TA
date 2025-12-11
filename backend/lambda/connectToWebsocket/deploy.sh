#!/bin/zsh
set -euo pipefail

LAMBDA_NAME="connectToWebsocket"
ZIP_FILE="code.zip"
REGION="us-west-2"


rm -f code.zip

# Zip from parent directory to preserve structure
cd src && zip -r ../code.zip . -x "*.pyc" "__pycache__/*" "*.DS_Store" && cd ..

echo "Deploying function code..."
aws lambda update-function-code \
  --function-name $LAMBDA_NAME \
  --zip-file fileb://$ZIP_FILE \
  --region $REGION \
  --no-cli-pager

echo "Deployment complete!"
