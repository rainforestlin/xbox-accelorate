#!/bin/sh
# Sign the release checksum manifest with an offline usign key:
#   sh tools/sign_release.sh dist /path/release.key /path/release.pub
set -eu

dir=${1:?usage: sign_release.sh <dist-dir> <private-key> <public-key>}
key=${2:?usage: sign_release.sh <dist-dir> <private-key> <public-key>}
pub=${3:?usage: sign_release.sh <dist-dir> <private-key> <public-key>}

[ -f "$dir/SHA256SUMS" ] || {
	echo "missing $dir/SHA256SUMS" >&2
	exit 1
}
command -v usign >/dev/null 2>&1 || {
	echo "usign is required" >&2
	exit 1
}

usign -S -m "$dir/SHA256SUMS" -s "$key" -x "$dir/SHA256SUMS.sig"
cp "$pub" "$dir/release.pub"
