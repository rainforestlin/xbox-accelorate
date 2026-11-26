#!/usr/bin/env python3
"""Build an OpenWrt/iStoreOS gzip-compressed tar ipk."""

import gzip
import io
import re
import subprocess
import sys
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
IPK = ROOT / "ipk"
DIST = ROOT / "dist"


def control_value(field: str) -> str:
    for line in (IPK / "control").read_text(encoding="utf-8").splitlines():
        if line.startswith(field + ":"):
            return line.split(":", 1)[1].strip()
    raise SystemExit(f"missing control field {field}")


def release_version() -> str:
    version = (ROOT / "VERSION").read_text(encoding="utf-8").strip()
    release = (ROOT / "RELEASE").read_text(encoding="utf-8").strip()
    if not version or not release:
        raise SystemExit("VERSION and RELEASE must not be empty")
    return f"{version}-{release}"


def git_short() -> str:
    try:
        return subprocess.check_output(
            ["git", "-C", str(ROOT), "rev-parse", "--short", "HEAD"],
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
    except Exception:
        return "dev"


DEV = "--dev" in sys.argv[1:]
BASE_VERSION = release_version()
PKG_VERSION = f"{BASE_VERSION}+git{git_short()}" if DEV else BASE_VERSION
OUTDIR = DIST / "dev" if DEV else DIST
NAME = "{0}_{1}_{2}.ipk".format(
    control_value("Package"), PKG_VERSION, control_value("Architecture")
)
EXEC_PATHS = {
    "./usr/sbin/xboxaccel",
    "./etc/init.d/xboxaccel",
    "./etc/hotplug.d/iface/99-xboxaccel",
    "./usr/share/xboxaccel/policy",
    "./usr/share/xboxaccel/roster",
    "./usr/share/xboxaccel/redir-run",
    "./usr/share/xboxaccel/www/cgi-bin/redirect",
}


def normalize(data: bytes, path: Path) -> bytes:
    if path.suffix in {".js", ".json", ".py", ".md", ".css", ".tsv", ".sh"} or path.name in {
        "xboxaccel",
        "policy",
        "roster",
        "control",
        "postinst",
        "prerm",
        "conffiles",
        "domains",
        "redirect",
        "redir-run",
        "uhttpd.empty",
        "99-xboxaccel",
    }:
        return data.replace(b"\r\n", b"\n").replace(b"\r", b"\n")
    return data


def add_bytes(tar: tarfile.TarFile, name: str, data: bytes, mode: int) -> None:
    info = tarfile.TarInfo(name)
    info.size = len(data)
    info.mode = mode
    info.mtime = 0
    info.uid = 0
    info.gid = 0
    info.uname = "root"
    info.gname = "root"
    tar.addfile(info, io.BytesIO(data))


def add_dir(tar: tarfile.TarFile, name: str) -> None:
    if not name.endswith("/"):
        name += "/"
    info = tarfile.TarInfo(name)
    info.type = tarfile.DIRTYPE
    info.mode = 0o755
    info.mtime = 0
    info.uid = 0
    info.gid = 0
    info.uname = "root"
    info.gname = "root"
    tar.addfile(info)


def with_dirs(files):
    dirs = []
    seen = set()
    for name, _data, _mode in files:
        parts = name[2:].split("/")
        acc = "."
        for part in parts[:-1]:
            acc += "/" + part
            if acc not in seen:
                seen.add(acc)
                dirs.append(acc)
    return dirs, files


def gzip_bytes(data: bytes) -> bytes:
    buf = io.BytesIO()
    with gzip.GzipFile(fileobj=buf, mode="wb", mtime=0, filename="") as gz:
        gz.write(data)
    return buf.getvalue()


def pack_tree(files) -> bytes:
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w", format=tarfile.USTAR_FORMAT) as tar:
        dirs, files = with_dirs(files)
        for name in dirs:
            add_dir(tar, name)
        for name, data, mode in files:
            add_bytes(tar, name, data, mode)
    return gzip_bytes(buf.getvalue())


def main() -> None:
    data_files = []
    for path in sorted(SRC.rglob("*")):
        if not path.is_file():
            continue
        rel = "./" + path.relative_to(SRC).as_posix()
        mode = 0o755 if rel in EXEC_PATHS else 0o644
        data_files.append((rel, normalize(path.read_bytes(), path), mode))

    control_files = []
    for name in ("control", "conffiles", "postinst", "prerm"):
        path = IPK / name
        mode = 0o755 if name in {"postinst", "prerm"} else 0o644
        data = path.read_bytes()
        if name == "control":
            text = data.decode("utf-8")
            text = re.sub(r"(?m)^Version:.*$", f"Version: {PKG_VERSION}", text)
            data = text.encode("utf-8")
        control_files.append(("./" + name, normalize(data, path), mode))

    outer_members = [
        ("./debian-binary", b"2.0\n", 0o644),
        ("./data.tar.gz", pack_tree(data_files), 0o644),
        ("./control.tar.gz", pack_tree(control_files), 0o644),
    ]
    payload = io.BytesIO()
    with tarfile.open(fileobj=payload, mode="w", format=tarfile.USTAR_FORMAT) as tar:
        for name, data, mode in outer_members:
            add_bytes(tar, name, data, mode)
    OUTDIR.mkdir(parents=True, exist_ok=True)
    out = OUTDIR / NAME
    out.write_bytes(gzip_bytes(payload.getvalue()))
    print(out)


if __name__ == "__main__":
    main()
