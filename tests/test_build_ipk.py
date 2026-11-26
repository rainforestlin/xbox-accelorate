import hashlib
import io
import sys
import tarfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
import build_ipk  # noqa: E402


class BuildIpkTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        build_ipk.main()
        cls.version = build_ipk.release_version()
        cls.package = build_ipk.OUTDIR / build_ipk.NAME
        with tarfile.open(cls.package) as outer:
            cls.outer = {
                member.name: outer.extractfile(member).read()
                for member in outer.getmembers()
                if member.isfile()
            }
            cls.data = tarfile.open(
                fileobj=io.BytesIO(cls.outer["./data.tar.gz"]), mode="r:gz"
            )
            cls.control = tarfile.open(
                fileobj=io.BytesIO(cls.outer["./control.tar.gz"]), mode="r:gz"
            )

    def test_version_and_name(self):
        self.assertEqual(
            self.package.name,
            f"luci-app-xboxaccel_{self.version}_all.ipk",
        )

    def test_control_and_scripts(self):
        control = self.control.extractfile("./control").read().decode()
        self.assertIn(f"Version: {self.version}", control)
        self.assertIn("Depends:", control)
        files = {m.name: m for m in self.data.getmembers() if m.isfile()}
        for path in (
            "./usr/sbin/xboxaccel",
            "./usr/share/xboxaccel/www/cgi-bin/redirect",
            "./etc/hotplug.d/iface/99-xboxaccel",
        ):
            self.assertIn(path, files)
            self.assertTrue(files[path].mode & 0o111, path)

    def test_i18n_catalog_is_packaged(self):
        files = {m.name: m for m in self.data.getmembers() if m.isfile()}
        path = "./usr/lib/lua/luci/i18n/xboxaccel.en.lmo"
        self.assertIn(path, files)
        self.assertGreater(files[path].size, 1000)

    def test_checksums_are_lf_and_valid(self):
        sums = (build_ipk.OUTDIR / "SHA256SUMS").read_bytes()
        self.assertNotIn(b"\r", sums)
        digest = hashlib.sha256(self.package.read_bytes()).hexdigest()
        self.assertIn(f"{digest}  {self.package.name}".encode(), sums)

    def test_normalize(self):
        path = ROOT / "README.md"
        self.assertEqual(build_ipk.normalize(b"a\r\nb\r", path), b"a\nb\n")

    def test_with_dirs(self):
        dirs, files = build_ipk.with_dirs([("./usr/share/x/y", b"", 0o644)])
        self.assertEqual(files[0][0], "./usr/share/x/y")
        self.assertEqual(dirs, ["./usr", "./usr/share", "./usr/share/x"])


if __name__ == "__main__":
    unittest.main()
