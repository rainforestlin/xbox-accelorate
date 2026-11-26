#!/bin/sh
# Manual check, not part of tests/run.sh: verify whether a selected CDN node
# accepts .com versus .cn SNI over TLS.
#
#   sh tests/manual_https_probe.sh 219.152.87.113
set -eu

node=${1:?usage: manual_https_probe.sh <cdn-ip>}
path=${2:-/Z/routing/extraextralarge.txt}

for host in assets1.xboxlive.com assets1.xboxlive.cn; do
	printf '%s: ' "$host"
	curl -k -sS -o /dev/null --max-time 15 \
		--resolve "$host:443:$node" \
		-w 'status=%{http_code} time=%{time_total}\n' \
		"https://$host$path" || true
done
