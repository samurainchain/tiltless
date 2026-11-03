#!/usr/bin/env bash
# Takes a reel apart so Claude can study it: a contact sheet of frames (one every N seconds),
# the speech as timed subtitles (whisper.cpp) and the basic facts (length, size, frame rate).
#   bash marketing/video-tools/analyze.sh <video file> [seconds between frames, default 1]
# Output goes next to the video in <name>-analysis/. Needs marketing/video-tools/setup.sh first.
set -euo pipefail

VIDEO="$1"
STEP="${2:-1}"
TOOLS="${VIDEO_TOOLS_HOME:-$HOME/.local/share/video-tools}"
MODEL="$(ls "$TOOLS"/whisper.cpp/models/ggml-*.bin 2>/dev/null | grep -v for-tests | sort | tail -1 || true)"
OUT="${VIDEO%.*}-analysis"
mkdir -p "$OUT/frames"

ffprobe -v error -show_entries format=duration:stream=width,height,r_frame_rate -of default=noprint_wrappers=1 "$VIDEO" | tee "$OUT/info.txt"

# One frame every STEP seconds, 360 px wide, with its time burned in; then a 5-wide sheet.
ffmpeg -loglevel error -y -i "$VIDEO" -vf "fps=1/$STEP,scale=360:-2,drawtext=text='%{pts\:hms}':x=8:y=8:fontsize=22:fontcolor=white:box=1:boxcolor=black@0.6" "$OUT/frames/f%03d.jpg"
COUNT=$(ls "$OUT/frames" | wc -l)
ROWS=$(( (COUNT + 4) / 5 ))
ffmpeg -loglevel error -y -i "$OUT/frames/f%03d.jpg" -vf "tile=5x$ROWS:padding=4:color=black" -frames:v 1 "$OUT/sheet.jpg"

# Speech, if there is any: language detected automatically.
if [ -n "$MODEL" ]; then
  ffmpeg -loglevel error -y -i "$VIDEO" -vn -ar 16000 -ac 1 "$OUT/audio.wav" && \
    "$TOOLS/whisper.cpp/build/bin/whisper-cli" -m "$MODEL" -l auto -osrt -of "$OUT/speech" -f "$OUT/audio.wav" >/dev/null 2>&1 || echo "no speech track"
else
  echo "whisper.cpp isn't installed: run marketing/video-tools/setup.sh"
fi

echo "frames: $COUNT -> $OUT/sheet.jpg"
[ -f "$OUT/speech.srt" ] && echo "speech: $OUT/speech.srt"
