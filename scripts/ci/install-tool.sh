#!/usr/bin/env bash
# Installs security tools on a Linux CI runner from GitHub releases, verifying a SHA-256 that is
# pinned HERE, in the repository. A compromised release or a moved tag therefore cannot slip
# different code into the pipeline: the download either matches the recorded hash or CI stops.
# (In 2026 attackers force-pushed the version tags of a popular scanner action and stole secrets
# from every pipeline that ran it; pinning by hash is the defence.)
#
# Usage:  bash scripts/ci/install-tool.sh gitleaks osv-scanner actionlint
#
# To upgrade a tool: read its release page, copy the new linux checksum from the release's own
# checksums file, and change the version and hash below in the same commit.
set -euo pipefail

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

fetch() {  # fetch <url> <sha256> <outfile>
  curl --silent --show-error --fail --location --retry 3 --output "$3" "$1"
  echo "$2  $3" | sha256sum --check --strict -
}

install_gitleaks() {
  local v=8.30.1
  fetch "https://github.com/gitleaks/gitleaks/releases/download/v${v}/gitleaks_${v}_linux_x64.tar.gz" \
    551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb "$work/gitleaks.tgz"
  tar -xzf "$work/gitleaks.tgz" -C "$work" gitleaks
  sudo install -m 0755 "$work/gitleaks" /usr/local/bin/gitleaks
}

install_osv_scanner() {
  local v=2.6.0
  fetch "https://github.com/google/osv-scanner/releases/download/v${v}/osv-scanner_linux_amd64" \
    ca69b3d3cd08f889a49dc0a383122f71cc528b83803671df5fd874d97485b108 "$work/osv-scanner"
  sudo install -m 0755 "$work/osv-scanner" /usr/local/bin/osv-scanner
}

install_actionlint() {
  local v=1.7.12
  fetch "https://github.com/rhysd/actionlint/releases/download/v${v}/actionlint_${v}_linux_amd64.tar.gz" \
    8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8 "$work/actionlint.tgz"
  tar -xzf "$work/actionlint.tgz" -C "$work" actionlint
  sudo install -m 0755 "$work/actionlint" /usr/local/bin/actionlint
}

for tool in "$@"; do
  case "$tool" in
    gitleaks) install_gitleaks ;;
    osv-scanner) install_osv_scanner ;;
    actionlint) install_actionlint ;;
    *) echo "unknown tool: $tool" >&2; exit 2 ;;
  esac
  echo "installed $tool"
done
