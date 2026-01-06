import json
import functions_framework
from extractor import process_drive_file

@functions_framework.http
def main(request):
    body = request.get_json(silent=True) or {}
    file_id = body.get("fileId")
    if not file_id:
        return (json.dumps({"ok": False, "error": "Missing fileId"}), 400, {"Content-Type": "application/json"})

    try:
        result = process_drive_file(file_id)
        return (json.dumps({"ok": True, "result": result}, ensure_ascii=False), 200, {"Content-Type": "application/json"})
    except Exception as e:
        return (json.dumps({"ok": False, "error": str(e)}), 500, {"Content-Type": "application/json"})