import json
import google.auth
import functions_framework
from googleapiclient.discovery import build

@functions_framework.http
def main(request):
    body = request.get_json(silent=True) or {}
    file_id = body.get("fileId")
    if not file_id:
        return (json.dumps({"ok": False, "error": "Missing fileId"}), 400, {"Content-Type": "application/json"})

    creds, _ = google.auth.default()
    drive = build("drive", "v3", credentials=creds, cache_discovery=False)

    meta = drive.files().get(
        fileId=file_id,
        fields="id,name,mimeType,size"
    ).execute()

    return (json.dumps({"ok": True, "meta": meta}), 200, {"Content-Type": "application/json"})
