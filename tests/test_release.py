import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
import zipfile


SOURCE_ROOT = Path(__file__).resolve().parents[1]


class ExtensionBuildTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / "scripts").mkdir()
        shutil.copy2(SOURCE_ROOT / "scripts" / "build_extension.py", self.root / "scripts")
        shutil.copytree(SOURCE_ROOT / "truthlens-extension", self.root / "truthlens-extension")

    def tearDown(self):
        self.temp.cleanup()

    def run_build(self, **settings):
        env = os.environ.copy()
        for name in ("VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY", "TRUTHLENS_WEB_APP_URL"):
            env.pop(name, None)
        env.update(settings)
        return subprocess.run([sys.executable, str(self.root / "scripts" / "build_extension.py")],
                              env=env, capture_output=True, text=True)

    def test_requires_release_configuration(self):
        result = self.run_build()
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.root / "dist" / "truthlens-extension.zip").exists())

    def test_packages_popup_and_only_public_settings(self):
        result = self.run_build(VITE_SUPABASE_URL="https://project.supabase.co",
                                VITE_SUPABASE_ANON_KEY="public-test-key",
                                TRUTHLENS_WEB_APP_URL="https://truthlens.example")
        self.assertEqual(result.returncode, 0, result.stderr)
        with zipfile.ZipFile(self.root / "dist" / "truthlens-extension.zip") as archive:
            names = set(archive.namelist())
            self.assertIn("popup.html", names)
            self.assertIn("background.js", names)
            self.assertNotIn("options.html", names)
            manifest = json.loads(archive.read("manifest.json"))
            config = archive.read("config.js").decode()
            self.assertEqual(manifest["action"]["default_popup"], "popup.html")
            self.assertIn("https://truthlens.example", config)
            self.assertNotIn("__SUPABASE", config)
            self.assertNotIn("SERVICE_ROLE", config)


if __name__ == "__main__":
    unittest.main()
