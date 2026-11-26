import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "src" / "usr" / "sbin" / "xboxaccel"


class CliTests(unittest.TestCase):
    def test_script_syntax(self):
        paths = [
            SCRIPT,
            ROOT / "src/usr/share/xboxaccel/policy",
            ROOT / "src/usr/share/xboxaccel/roster",
            ROOT / "src/usr/share/xboxaccel/redir-run",
            ROOT / "src/usr/share/xboxaccel/www/cgi-bin/redirect",
            ROOT / "src/etc/init.d/xboxaccel",
            ROOT / "src/etc/hotplug.d/iface/99-xboxaccel",
        ]
        for path in paths:
            with self.subTest(path=path.name):
                subprocess.run(["sh", "-n", str(path)], check=True)

    def test_selftest(self):
        result = subprocess.run(
            ["sh", str(SCRIPT), "check"],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=True,
        )
        self.assertIn("PASS redirect", result.stdout)
        self.assertIn("PASS public", result.stdout)

    def test_nft_preview(self):
        with tempfile.NamedTemporaryFile("w", delete=False, encoding="utf-8") as fh:
            fh.write(
                "assets1.xboxlive.com\t198.51.100.1\t23.1.1.1\n"
                "xvcf1.xboxlive.cn\t198.51.100.2\t-\n"
            )
            path = fh.name
        try:
            result = subprocess.run(
                ["sh", str(SCRIPT), "nft-preview", path],
                cwd=ROOT,
                text=True,
                capture_output=True,
                check=True,
            )
        finally:
            Path(path).unlink(missing_ok=True)
        self.assertIn("set redirect_v4", result.stdout)
        self.assertIn("map https4", result.stdout)
        self.assertIn("tcp dport 443 dnat", result.stdout)


if __name__ == "__main__":
    unittest.main()
