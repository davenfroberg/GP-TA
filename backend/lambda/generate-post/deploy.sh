#!/bin/zsh
LAMBDA_NAME="generate-post"
ZIP_FILE="code.zip"
REGION="us-west-2"


rm -f code.zip

cd src
zip -r ../code.zip ./*
cd ..

aws lambda update-function-code \
  --function-name $LAMBDA_NAME \
  --zip-file fileb://$ZIP_FILE \
  --region $REGION \
  --no-cli-pager

echo "Deployment complete!"