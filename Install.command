#!/bin/sh
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo 'Please install Node.js 24 LTS from https://nodejs.org first.'
  exit 1
fi
node bin/install.mjs
