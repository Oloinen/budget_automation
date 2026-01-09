Backup script for Budget Automation

This script exports Google Sheets spreadsheets to CSV files (one CSV per sheet).

Quick start

1. Install dependencies (prefer a virtualenv):

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r apps_script/scripts/requirements.txt
```

2. Provide service account credentials via env var or file:

- Option A (env):
  - `export GOOGLE_SERVICE_ACCOUNT_KEY_JSON="$(cat /path/to/key.json)"`
- Option B (file):
  - `--service-account-file /path/to/key.json`

3. Run the script:

```bash
# Export a single spreadsheet
python apps_script/scripts/backup_budget_data.py --spreadsheet-id SPREADSHEET_ID --out-dir ./backups

# Export all spreadsheets in a Drive folder
python apps_script/scripts/backup_budget_data.py --folder-id DRIVE_FOLDER_ID --out-dir ./backups

# Dry run (no API calls)
python apps_script/scripts/backup_budget_data.py --spreadsheet-id SPREADSHEET_ID --dry-run
```

Cron example (weekly backup):

```cron
# Run weekly on Sundays at 02:00
0 2 * * 0 cd /path/to/budget_automation && /path/to/.venv/bin/python apps_script/scripts/backup_budget_data.py --folder-id FOLDER_ID --out-dir /backups/budget_automation
```
