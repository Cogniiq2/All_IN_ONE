#!/usr/bin/env bash
# Fetch the pinned PostgREST binary the local stack and CI use. Checksum-verified.
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION="v12.2.3"
SHA256="870a77f49508479bc87c5504b6b0c3715c7220926932d916b0d73952b297c617"
mkdir -p .tools
if [ -x .tools/postgrest ] && echo "$SHA256  .tools/postgrest" | sha256sum -c --quiet 2>/dev/null; then
  echo "postgrest $VERSION already present"; exit 0
fi
curl -sSL -o .tools/postgrest.tar.xz "https://github.com/PostgREST/postgrest/releases/download/$VERSION/postgrest-$VERSION-linux-static-x64.tar.xz"
tar -xJf .tools/postgrest.tar.xz -C .tools
rm -f .tools/postgrest.tar.xz
echo "$SHA256  .tools/postgrest" | sha256sum -c --quiet
chmod +x .tools/postgrest
echo "postgrest $VERSION installed to .tools/postgrest"
