#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
cd "$ROOT"

PYTHON=python
command -v "$PYTHON" >/dev/null 2>&1 || PYTHON=python3

for f in \
	src/usr/sbin/xboxaccel \
	src/usr/share/xboxaccel/policy \
	src/usr/share/xboxaccel/roster \
	src/usr/share/xboxaccel/redir-run \
	src/usr/share/xboxaccel/www/cgi-bin/redirect \
	src/etc/init.d/xboxaccel \
	src/etc/hotplug.d/iface/99-xboxaccel; do
	sh -n "$f"
done

"$PYTHON" -m unittest discover -s tests -p 'test_*.py' -v

"$PYTHON" tools/build_i18n.py --out-dir build/i18n >/dev/null
cmp build/i18n/xboxaccel.en.lmo src/usr/lib/lua/luci/i18n/xboxaccel.en.lmo
rm -rf build/i18n

if command -v node >/dev/null 2>&1; then
	node --check src/www/luci-static/resources/view/xboxaccel.js
fi

"$PYTHON" tools/build_ipk.py
"$PYTHON" - <<'PY'
import tarfile
from pathlib import Path

root = Path('.')
version = (root / 'VERSION').read_text().strip()
release = (root / 'RELEASE').read_text().strip()
package = root / 'dist' / f'luci-app-xboxaccel_{version}-{release}_all.ipk'
assert package.is_file(), package
with tarfile.open(package) as outer:
    names = [m.name for m in outer.getmembers() if m.isfile()]
    assert './control.tar.gz' in names and './data.tar.gz' in names
print(package)
PY

printf 'assets1.xboxlive.com\t198.51.100.1\t23.1.1.1\nxvcf1.xboxlive.cn\t198.51.100.2\t-\n' > /tmp/xboxaccel.map
sh src/usr/sbin/xboxaccel nft-preview /tmp/xboxaccel.map > /tmp/xboxaccel.nft
if command -v nft >/dev/null 2>&1 && [ "$(id -u)" = 0 ]; then
	nft -c -f /tmp/xboxaccel.nft
fi
