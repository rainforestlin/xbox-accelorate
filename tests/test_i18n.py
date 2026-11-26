import re
import struct
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
import build_i18n  # noqa: E402

JS = ROOT / "src" / "www" / "luci-static" / "resources" / "view" / "xboxaccel.js"
PO = ROOT / "po" / "en.po"
LMO = ROOT / "src" / "usr" / "lib" / "lua" / "luci" / "i18n" / "xboxaccel.en.lmo"


def js_strings():
    text = JS.read_text(encoding="utf-8")
    out = []
    for match in re.finditer(r"_\(\s*(['\"])(.*?)\1", text, re.S):
        value = re.sub(r"[ \t\n]+", " ", match.group(2)).strip()
        if value and value not in out:
            out.append(value)
    return out


def lmo_entries(data):
    index = struct.unpack(">I", data[-4:])[0]
    count = (len(data) - index - 4) // 16
    entries = {}
    for i in range(count):
        key, val_id, off, length = struct.unpack(
            ">IIII", data[index + i * 16:index + i * 16 + 16]
        )
        entries[key] = (val_id, off, length, data[off:off + length])
    return entries


class I18nTests(unittest.TestCase):
    def test_hash_known_values(self):
        self.assertEqual(build_i18n.sfh_hash(b""), 0)
        self.assertEqual(build_i18n.sfh_hash("启用节点".encode()), 2018281303)
        self.assertEqual(build_i18n.sfh_hash("正在写入".encode()), 2125772212)

    def test_all_ui_strings_have_english(self):
        entries = build_i18n.parse_po(PO)
        translated = {msgid for msgid, msgstr in entries if msgstr}
        missing = [s for s in js_strings() if s not in translated]
        self.assertEqual(missing, [], "missing English translations")
        empty = [msgid for msgid, msgstr in entries if msgid and not msgstr]
        self.assertEqual(empty, [], "empty English translations")

    def test_pot_matches_ui_strings(self):
        pot = {
            msgid
            for msgid, _msgstr in build_i18n.parse_po(ROOT / "po" / "xboxaccel.pot")
            if msgid
        }
        self.assertEqual(pot, set(js_strings()))

    def test_lmo_matches_source(self):
        self.assertTrue(LMO.is_file(), LMO)
        self.assertEqual(build_i18n.compile_po(PO), LMO.read_bytes())

    def test_lmo_entries_are_usable(self):
        data = LMO.read_bytes()
        entries = lmo_entries(data)
        self.assertEqual(len(entries), 84)
        key = build_i18n.sfh_hash("启用节点".encode())
        self.assertIn(key, entries)
        self.assertEqual(entries[key][3], b"Enable node")
        self.assertEqual(entries[key][0], 1)
        menu = build_i18n.sfh_hash("Xbox 下载选点".encode())
        self.assertEqual(entries[menu][3], b"Xbox Download Node Selector")

    def test_chinese_identity_catalog_is_empty(self):
        self.assertEqual(
            build_i18n.compile_po(ROOT / "po" / "zh_Hans.po"),
            b"",
        )


if __name__ == "__main__":
    unittest.main()
