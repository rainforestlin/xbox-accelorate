#!/bin/sh
# Verify a release directory before installing:
#   sh tools/verify_release.sh dist
set -eu

dir=${1:-dist}
cd "$dir"

[ -f SHA256SUMS ] || {
	echo "missing SHA256SUMS in $dir" >&2
	exit 1
}

if command -v sha256sum >/dev/null 2>&1; then
	sha256sum -c SHA256SUMS
else
	echo "sha256sum is required" >&2
	exit 1
fi

if [ -f SHA256SUMS.sig ] && [ -f release.pub ]; then
	command -v usign >/dev/null 2>&1 || {
		echo "SHA256SUMS.sig exists but usign is not installed" >&2
		exit 1
	}
	usign -V -m SHA256SUMS -p release.pub -x SHA256SUMS.sig
fi
