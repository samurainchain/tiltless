#!/usr/bin/env bash
# Installs the reel-making tools the video skills use (.claude/skills/remotion-*, hyperframes*):
# yt-dlp (download references), whisper.cpp with a multilingual model (subtitles from speech),
# and checks FFmpeg, Node and a Chromium for Remotion and HyperFrames, which run through npx.
# Safe to run again: whatever is already there is kept. The cloud container is temporary, so
# run this at the start of a session that makes videos:  bash marketing/video-tools/setup.sh
# Model size: WHISPER_MODEL=base (148 MB, default) or small (466 MB, better Spanish and Russian).
set -euo pipefail

HOME_DIR="${VIDEO_TOOLS_HOME:-$HOME/.local/share/video-tools}"
MODEL="${WHISPER_MODEL:-base}"
mkdir -p "$HOME_DIR" "$HOME/.local/bin"

say() { printf '\n== %s\n' "$*"; }

say "FFmpeg"
command -v ffmpeg >/dev/null || { echo "FFmpeg is missing: apt-get install -y ffmpeg"; exit 1; }
ffmpeg -version | head -1

say "yt-dlp"
if [ ! -x "$HOME_DIR/venv/bin/yt-dlp" ]; then
  python3 -m venv "$HOME_DIR/venv"
  "$HOME_DIR/venv/bin/pip" install --quiet --upgrade yt-dlp
fi
ln -sf "$HOME_DIR/venv/bin/yt-dlp" "$HOME/.local/bin/yt-dlp"
"$HOME/.local/bin/yt-dlp" --version

say "whisper.cpp ($MODEL model)"
if [ ! -x "$HOME_DIR/whisper.cpp/build/bin/whisper-cli" ]; then
  [ -d "$HOME_DIR/whisper.cpp" ] || git clone --quiet --depth 1 https://github.com/ggml-org/whisper.cpp "$HOME_DIR/whisper.cpp"
  cmake -S "$HOME_DIR/whisper.cpp" -B "$HOME_DIR/whisper.cpp/build" -DCMAKE_BUILD_TYPE=Release -DWHISPER_BUILD_TESTS=OFF >/dev/null
  cmake --build "$HOME_DIR/whisper.cpp/build" --config Release -j"$(nproc)" --target whisper-cli >/dev/null
fi
ln -sf "$HOME_DIR/whisper.cpp/build/bin/whisper-cli" "$HOME/.local/bin/whisper-cli"
MODEL_FILE="$HOME_DIR/whisper.cpp/models/ggml-$MODEL.bin"
[ -s "$MODEL_FILE" ] || curl -fsSL -o "$MODEL_FILE" "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-$MODEL.bin"
echo "model: $MODEL_FILE ($(du -h "$MODEL_FILE" | cut -f1))"

say "Node, Remotion and HyperFrames (through npx)"
node --version
npx --yes hyperframes --version 2>/dev/null || echo "HyperFrames CLI: npx hyperframes <command> downloads it on first use"
# Both render with a headless Chrome. The cloud container already has Chromium for Playwright.
if [ -e /opt/pw-browsers/chromium ] || ls -d /opt/pw-browsers/chromium-* >/dev/null 2>&1; then
  echo "Chromium found under /opt/pw-browsers: pass it as the browser executable if a render can't download its own"
fi

say "Done"
echo "Add $HOME/.local/bin to PATH if it isn't: export PATH=\"\$HOME/.local/bin:\$PATH\""
echo "Subtitles: whisper-cli -m $MODEL_FILE -l es -osrt -f audio.wav   (16 kHz WAV: ffmpeg -i in.mp4 -ar 16000 -ac 1 audio.wav)"
