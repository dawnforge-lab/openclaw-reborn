#!/usr/bin/env bash
set -euo pipefail

REPO="https://github.com/dawnforge-lab/openclaw-reborn.git"
INSTALL_DIR="${OPENCLAW_INSTALL_DIR:-$HOME/.openclaw/app}"
BIN_DIR="${OPENCLAW_BIN_DIR:-$HOME/.local/bin}"

echo "Installing OpenClaw Reborn..."
echo "  Install dir: $INSTALL_DIR"
echo "  Bin link:    $BIN_DIR/openclaw"
echo ""

# Check Node >= 22
NODE_MAJOR=$(node -e "console.log(process.versions.node.split('.')[0])" 2>/dev/null || echo "0")
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "Error: Node.js >= 22 required (found: $(node -v 2>/dev/null || echo 'none'))"
  exit 1
fi

# Check pnpm
if ! command -v pnpm &>/dev/null; then
  echo "Error: pnpm is required. Install with: npm install -g pnpm"
  exit 1
fi

# Clone or pull
if [ -d "$INSTALL_DIR/.git" ]; then
  echo "Updating existing installation..."
  git -C "$INSTALL_DIR" pull --ff-only
else
  if [ -d "$INSTALL_DIR" ]; then
    echo "Error: $INSTALL_DIR exists but is not a git repo. Remove it first."
    exit 1
  fi
  echo "Cloning..."
  mkdir -p "$(dirname "$INSTALL_DIR")"
  git clone "$REPO" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"

echo "Installing dependencies..."
pnpm install --frozen-lockfile

echo "Building..."
pnpm ui:build
pnpm build

# Link binary
mkdir -p "$BIN_DIR"
ln -sf "$INSTALL_DIR/openclaw.mjs" "$BIN_DIR/openclaw"
chmod +x "$INSTALL_DIR/openclaw.mjs"

echo ""
echo "Done! Run: openclaw onboard --install-daemon"
echo ""
if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
  echo "Note: $BIN_DIR is not in your PATH. Add it:"
  echo "  echo 'export PATH=\"$BIN_DIR:\$PATH\"' >> ~/.bashrc"
fi
