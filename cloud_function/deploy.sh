#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="your-project-id"
REGION="europe-north1"
SA_EMAIL="receipt-extractor-sa@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud config set project "$PROJECT_ID"

gcloud functions deploy receipt-extractor \
  --gen2 \
  --region="$REGION" \
  --runtime=python311 \
  --source=receipt_extractor \
  --entry-point=main \
  --trigger-http \
  --service-account="$SA_EMAIL" \
  --no-allow-unauthenticated
