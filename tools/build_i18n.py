#!/usr/bin/env python3
"""Compile LuCI .po catalogs into .lmo archives.

This is a small, dependency-free implementation of the po2lmo format used by
LuCI. It exists so the repository can build the same .lmo files on Windows and
in CI without requiring the OpenWrt host tool.
"""

from __future__ import annotations

import argparse
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PO = ROOT / "po"
DEFAULT_OUT = ROOT / "build" / "i18n"
MASK = 0xFFFFFFFF


def _u16(data: bytes, off: int) -> int:
    return data[off] | (data[off + 1] << 8)


def _s8(value: int) -> int:
    return value - 256 if value >= 128 else value


def sfh_hash(data: bytes, init: int | None = None) -> int:
    """Paul Hsieh's SuperFastHash, matching LuCI's cbi.js sfh()."""
    if not data:
        return 0
    if init is None:
        init = len(data)

    h = init & MASK
    rem = len(data) & 3
    blocks = len(data) >> 2
    off = 0

    for _ in range(blocks):
        h = (h + _u16(data, off)) & MASK
        tmp = ((_u16(data, off + 2) << 11) ^ h) & MASK
        h = ((h << 16) ^ tmp) & MASK
        h = (h + (h >> 11)) & MASK
        off += 4

    if rem == 3:
        h = (h + _u16(data, off)) & MASK
        h = (h ^ ((h << 16) & MASK)) & MASK
        h = (h ^ ((_s8(data[off + 2]) << 18) & MASK)) & MASK
        h = (h + (h >> 11)) & MASK
    elif rem == 2:
        h = (h + _u16(data, off)) & MASK
        h = (h ^ ((h << 11) & MASK)) & MASK
        h = (h + (h >> 17)) & MASK
    elif rem == 1:
        h = (h + _s8(data[off])) & MASK
        h = (h ^ ((h << 10) & MASK)) & MASK
        h = (h + (h >> 1)) & MASK

    h = (h ^ ((h << 3) & MASK)) & MASK
    h = (h + (h >> 5)) & MASK
    h = (h ^ ((h << 4) & MASK)) & MASK
    h = (h + (h >> 17)) & MASK
    h = (h ^ ((h << 25) & MASK)) & MASK
    h = (h + (h >> 6)) & MASK
    return h


def _unquote(line: str) -> str:
    """Decode a PO quoted string, ignoring anything before the first quote."""
    out = []
    started = False
    i = 0
    while i < len(line):
        ch = line[i]
        if not started:
            if ch == '"':
                started = True
            i += 1
            continue
        if ch == "\\" and i + 1 < len(line):
            i += 1
            esc = line[i]
            out.append({"n": "\n", "t": "\t", "r": "\r"}.get(esc, esc))
        elif ch == '"':
            break
        else:
            out.append(ch)
        i += 1
    return "".join(out)


def parse_po(path: Path) -> list[tuple[str, str]]:
    entries: list[tuple[str, str]] = []
    msgid: str | None = None
    msgstr: str | None = None
    mode: str | None = None

    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("msgctxt "):
            # Context is not used by this plugin. Keep parsing deterministic.
            msgid, msgstr, mode = None, None, None
            continue
        if line.startswith("msgid_plural "):
            # Plural forms are not used by this plugin.
            mode = None
            continue
        if line.startswith("msgid "):
            if msgid is not None and msgstr is not None:
                entries.append((msgid, msgstr))
            msgid = _unquote(line[len("msgid "):])
            msgstr = None
            mode = "id"
            continue
        if line.startswith("msgstr "):
            msgstr = _unquote(line[len("msgstr "):])
            mode = "str"
            continue
        if line.startswith("msgstr["):
            mode = None
            continue
        if line.startswith('"'):
            value = _unquote(line)
            if mode == "id" and msgid is not None:
                msgid += value
            elif mode == "str" and msgstr is not None:
                msgstr += value
            continue

    if msgid is not None and msgstr is not None:
        entries.append((msgid, msgstr))
    return entries


def compile_po(path: Path) -> bytes:
    values = bytearray()
    index: list[tuple[int, int, int, int]] = []

    for msgid, msgstr in parse_po(path):
        # The header has an empty msgid. It only matters for Plural-Forms,
        # which this plugin does not use.
        if not msgid or not msgstr or msgstr == msgid:
            continue
        key = msgid.encode("utf-8")
        value = msgstr.encode("utf-8")
        key_id = sfh_hash(key)
        val_id = 1
        if key_id == sfh_hash(value):
            continue
        offset = len(values)
        values += value
        values += b"\0" * ((4 - (len(value) % 4)) % 4)
        index.append((key_id, val_id, offset, len(value)))

    if not index:
        return b""

    index.sort(key=lambda item: item[0])
    index_offset = len(values)
    for entry in index:
        values += struct.pack(">IIII", *entry)
    values += struct.pack(">I", index_offset)
    return bytes(values)


def compile_catalogs(po_dir: Path, out_dir: Path) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    for po in sorted(po_dir.glob("*.po")):
        lang = po.stem
        data = compile_po(po)
        if not data:
            continue
        out = out_dir / f"xboxaccel.{lang}.lmo"
        out.write_bytes(data)
        written.append(out)
    return written


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--po-dir", type=Path, default=DEFAULT_PO)
    parser.add_argument("--out-dir", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()
    for out in compile_catalogs(args.po_dir, args.out_dir):
        print(out)


if __name__ == "__main__":
    main()
