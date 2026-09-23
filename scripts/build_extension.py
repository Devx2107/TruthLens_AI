"""Create a configured, installable Chromium extension ZIP."""
import json
import base64
import os
from pathlib import Path
import shutil
import sys
import zipfile
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "truthlens-extension"
TARGET = ROOT / "dist" / "truthlens-extension"
ZIP = ROOT / "dist" / "truthlens-extension.zip"


def main() -> None:
    url = os.environ.get("VITE_SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("VITE_SUPABASE_ANON_KEY", "")
    site = os.environ.get("TRUTHLENS_WEB_APP_URL", "").rstrip("/")
    project = urlparse(url)
    website = urlparse(site)
    if not (project.scheme == "https" and project.hostname and project.hostname.endswith(".supabase.co")
            and project.path in ("", "/") and not project.query and not project.fragment
            and website.scheme == "https" and website.hostname and key):
        sys.exit("Set VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY and TRUTHLENS_WEB_APP_URL to production values.")
    if "service_role" in key.lower() or "gemini" in key.lower():
        sys.exit("Only the public Supabase anon key may be packaged.")
    if key.startswith("eyJ"):
        try:
            claims = json.loads(base64.urlsafe_b64decode(key.split(".")[1] + "=="))
        except (IndexError, ValueError):
            sys.exit("Supabase anon key is malformed.")
        if claims.get("role") != "anon":
            sys.exit("Only the public Supabase anon key may be packaged.")
    if TARGET.exists():
        shutil.rmtree(TARGET)
    shutil.copytree(SOURCE, TARGET, ignore=shutil.ignore_patterns("README.md", "options.*", "content.css"))
    config = TARGET / "config.js"
    config.write_text(
        "globalThis.TRUTHLENS_CONFIG = " + json.dumps({
            "supabaseUrl": url,
            "supabaseAnonKey": key,
            "webAppUrl": site,
        }) + ";\n", encoding="utf-8")
    with zipfile.ZipFile(ZIP, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path in TARGET.rglob("*"):
            if path.is_file():
                archive.write(path, path.relative_to(TARGET))
    print(f"Created {ZIP}")


if __name__ == "__main__":
    main()
