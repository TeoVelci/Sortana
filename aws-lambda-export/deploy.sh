#!/bin/bash

# Simple deploy script for the export Lambda function

FUNCTION_NAME="sortana-export-zipper"
ROLE_ARN=$1

if [ -z "$ROLE_ARN" ]; then
    echo "Usage: ./deploy.sh <IAM_ROLE_ARN>"
    echo "Please provide the ARN of the IAM Role for the Lambda function."
    echo "The role must have permissions to read/write to the Sortana S3 bucket."
    exit 1
fi

echo "Packaging Lambda function..."
# Sharp requires special handling if deploying from macOS to Linux (Lambda).
# We need to install the Linux x64 version of sharp.
rm -rf node_modules
npm install --cpu=x64 --os=linux sharp
npm install

zip -r function.zip . -x "*.git*" "deploy.sh"

echo "Checking if function $FUNCTION_NAME exists..."
if aws lambda get-function --function-name $FUNCTION_NAME > /dev/null 2>&1; then
    echo "Function exists. Updating code..."
    aws lambda update-function-code \
        --function-name $FUNCTION_NAME \
        --zip-file fileb://function.zip \
        --publish
else
    echo "Function does not exist. Creating..."
    aws lambda create-function \
        --function-name $FUNCTION_NAME \
        --runtime nodejs20.x \
        --role $ROLE_ARN \
        --handler index.handler \
        --timeout 900 \
        --memory-size 2048 \
        --zip-file fileb://function.zip
fi

echo "Done."
