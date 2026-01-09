#!/usr/bin/env python3
"""
Backup Budget Automation spreadsheets to CSVs.
- Exports all sheets in a spreadsheet to CSV files under output directory.
- Can target a single `--spreadsheet-id` or all spreadsheets in a Drive `--folder-id`.
- Supports `--dry-run` to show what would be backed up without calling APIs.

Credentials:
- Provide service account JSON via env var `GOOGLE_SERVICE_ACCOUNT_KEY_JSON` (contents)
  or a file path via `--service-account-file`.

Usage examples:
  python backup_budget_data.py --spreadsheet-id SPREADSHEET_ID --out-dir ./backups
  python backup_budget_data.py --folder-id DRIVE_FOLDER_ID --out-dir ./backups
  python backup_budget_data.py --spreadsheet-id SPREADSHEET_ID --dry-run

"""
from __future__ import annotations
import os
import sys
import argparse
import json
import csv
import datetime
from typing import List, Optional

try:
    from googleapiclient.discovery import build
    from google.oauth2 import service_account
except Exception:
    build = None  # type: ignore
    service_account = None  # type: ignore


SCOPES = [
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/spreadsheets.readonly",
]


def load_credentials_from_env_or_file(service_account_file: Optional[str] = None):
    key_json = os.environ.get("GOOGLE_SERVICE_ACCOUNT_KEY_JSON")
    if key_json:
        info = json.loads(key_json)
        return service_account.Credentials.from_service_account_info(info, scopes=SCOPES)

    if service_account_file and os.path.exists(service_account_file):
        return service_account.Credentials.from_service_account_file(service_account_file, scopes=SCOPES)

    return None


def list_spreadsheets_in_folder(drive_service, folder_id: str) -> List[dict]:
    results = []
    page_token = None
    query = f"'{folder_id}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed = false"
    while True:
        resp = drive_service.files().list(
            q=query, fields="nextPageToken, files(id, name)", pageToken=page_token, pageSize=100
        ).execute()
        files = resp.get("files", [])
        results.extend(files)
        page_token = resp.get("nextPageToken")
        if not page_token:
            break
    return results


def export_spreadsheet_to_csv(sheets_service, spreadsheet_id: str, out_dir: str):
    meta = sheets_service.spreadsheets().get(spreadsheetId=spreadsheet_id, fields="sheets.properties,title").execute()
    spreadsheet_title = meta.get("properties", {}).get("title") or spreadsheet_id
    sheets = meta.get("sheets", [])
    now = datetime.datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    base_dir = os.path.join(out_dir, f"{spreadsheet_title}_{spreadsheet_id}")
    os.makedirs(base_dir, exist_ok=True)

    for s in sheets:
        title = s.get("properties", {}).get("title")
        safe_title = title.replace("/", "_") if title else "sheet"
        csv_path = os.path.join(base_dir, f"{now}_{safe_title}.csv")
        # Fetch values
        resp = sheets_service.spreadsheets().values().get(spreadsheetId=spreadsheet_id, range=title).execute()
        values = resp.get("values", [])
        with open(csv_path, "w", newline="", encoding="utf-8") as fh:
            writer = csv.writer(fh)
            for row in values:
                writer.writerow(row)
        print(f"Wrote: {csv_path}")


def ensure_clients(creds):
    if build is None or service_account is None:
        raise RuntimeError("google-api-python-client and google-auth are required. See requirements.txt")
    drive = build("drive", "v3", credentials=creds)
    sheets = build("sheets", "v4", credentials=creds)
    return drive, sheets


def parse_args(argv: Optional[List[str]] = None):
    p = argparse.ArgumentParser()
    p.add_argument("--spreadsheet-id", help="Spreadsheet ID to backup")
    p.add_argument("--folder-id", help="Drive folder ID containing spreadsheets to backup")
    p.add_argument("--out-dir", default="./backups", help="Output directory")
    p.add_argument("--service-account-file", help="Path to service account JSON file")
    p.add_argument("--dry-run", action="store_true", help="Don't call APIs; just print targets")
    return p.parse_args(argv)


def main(argv: Optional[List[str]] = None):
    args = parse_args(argv)
    out_dir = args.out_dir
    os.makedirs(out_dir, exist_ok=True)

    if args.dry_run:
        print("Dry run mode. No API calls will be made.")

    creds = None
    if not args.dry_run:
        creds = load_credentials_from_env_or_file(args.service_account_file)
        if creds is None:
            print("No credentials found. Set GOOGLE_SERVICE_ACCOUNT_KEY_JSON or --service-account-file, or run with --dry-run.")
            sys.exit(2)

    if args.dry_run:
        if args.spreadsheet_id:
            print(f"Would export spreadsheet: {args.spreadsheet_id} to {out_dir}")
        elif args.folder_id:
            print(f"Would list spreadsheets in folder: {args.folder_id}")
        else:
            print("Nothing to do. Provide --spreadsheet-id or --folder-id")
        return

    drive, sheets = ensure_clients(creds)

    if args.spreadsheet_id:
        print(f"Exporting spreadsheet {args.spreadsheet_id}...")
        export_spreadsheet_to_csv(sheets, args.spreadsheet_id, out_dir)
        return

    if args.folder_id:
        print(f"Listing spreadsheets in folder {args.folder_id}...")
        files = list_spreadsheets_in_folder(drive, args.folder_id)
        print(f"Found {len(files)} spreadsheets")
        for f in files:
            sid = f.get("id")
            name = f.get("name")
            print(f"Exporting {name} ({sid})...")
            try:
                export_spreadsheet_to_csv(sheets, sid, out_dir)
            except Exception as e:
                print(f"Failed to export {sid}: {e}")
        return

    print("Nothing to do. Provide --spreadsheet-id or --folder-id")


if __name__ == "__main__":
    main()
