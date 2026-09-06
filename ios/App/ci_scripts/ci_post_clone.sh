#!/bin/bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="${CI_PRIMARY_REPOSITORY_PATH:-$(cd "$script_dir/../../.." && pwd)}"
if ! cd "$repo_root"; then
  echo "Xcode Cloud CI: geçersiz repo kökü; dizine erişilemedi." >&2
  exit 1
fi

if [ ! -f package.json ] || [ ! -f package-lock.json ] || [ ! -d ios/App/App.xcodeproj ]; then
  echo "Xcode Cloud CI: geçersiz repo kökü; package.json, package-lock.json veya iOS projesi bulunamadı." >&2
  exit 1
fi
if ! grep -q '"name": "barkod-rapor-web"' package.json; then
  echo "Xcode Cloud CI: beklenen ELVAN RAPOR repo kökü doğrulanamadı." >&2
  exit 1
fi

required_public_envs=(
  VITE_SUPABASE_URL
  VITE_SUPABASE_ANON_KEY
)
missing=()
for env_name in "${required_public_envs[@]}"; do
  if [ -z "${!env_name:-}" ]; then
    missing+=("$env_name")
  fi
done
if [ "${#missing[@]}" -gt 0 ]; then
  echo "Xcode Cloud CI: gerekli public build ortam değişkenleri eksik: ${missing[*]}" >&2
  exit 1
fi
if [[ "${VITE_SUPABASE_ANON_KEY}" == sb_secret_* ]]; then
  echo "Xcode Cloud CI: VITE_SUPABASE_ANON_KEY server sırrı olamaz." >&2
  exit 1
fi

node_major=0
if command -v node >/dev/null 2>&1; then
  node_major="$(node -p 'process.versions.node.split(".")[0]')"
fi
if { [ "$node_major" -ne 24 ] || ! command -v npm >/dev/null 2>&1; } && command -v brew >/dev/null 2>&1; then
  brew install node@24
  export PATH="$(brew --prefix node@24)/bin:$PATH"
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Xcode Cloud CI: Node.js LTS (24.x) bulunamadı; kurulum durduruldu." >&2
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "Xcode Cloud CI: npm bulunamadı; kurulum durduruldu." >&2
  exit 1
fi

node_major="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$node_major" -ne 24 ]; then
  echo "Xcode Cloud CI: Node.js 24.x gerekli; mevcut sürüm uygun değil." >&2
  exit 1
fi

if [[ "${VITE_SUPABASE_ANON_KEY}" != sb_publishable_* ]]; then
  if ! VITE_SUPABASE_ANON_KEY="$VITE_SUPABASE_ANON_KEY" node -e '
    const token = process.env.VITE_SUPABASE_ANON_KEY
    const parts = token.split(".")
    if (parts.length !== 3) process.exit(1)
    try {
      const json = Buffer.from(parts[1], "base64url").toString("utf8")
      if (JSON.parse(json).role !== "anon") process.exit(1)
    } catch { process.exit(1) }
  '; then
    echo "Xcode Cloud CI: VITE_SUPABASE_ANON_KEY publishable veya anon JWT olmalı; hassas anahtar reddedildi." >&2
    exit 1
  fi
fi

npm ci
npm run build:ios
./node_modules/.bin/cap sync ios
