#!/bin/bash
set -e
cd "$(dirname "$0")/.."
for n in 08 09 10; do
  d=$(python3 -c "import re;print(re.search(r'DURATION = ([0-9.]+)', open('stage-${n}x.html').read()).group(1))")
  ffmpeg -y -v error -stream_loop 1 -i pad-02.wav -t $d -af "afade=t=out:st=$(python3 -c "print($d-1.5)"):d=1.5" -ar 48000 pad-$n.wav
  ffmpeg -y -v error -i vo-$n.wav -i pad-$n.wav -filter_complex "[0:a]aresample=48000,pan=stereo|c0=c0|c1=c0,loudnorm=I=-15:TP=-1.5:LRA=7,aresample=48000,apad=whole_dur=$d,asplit=2[vo1][vo2];[1:a]volume=-21dB[bed];[bed][vo1]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=400[duck];[vo2][duck]amix=inputs=2:normalize=0:duration=longest[out]" -map "[out]" -ar 48000 -t $d mix-$n.wav
  rm -rf x3d/frames-$n
  for k in 0 1 2 3 4 5; do node x3d/render60.cjs stage-${n}x.html x3d/frames-$n 60 $k 6 & done; wait
  echo "$n frames $(ls x3d/frames-$n | wc -l)"
done
x3d/finish.sh 08 2.0
x3d/finish.sh 09 4.9
x3d/finish.sh 10 3.3
echo done
