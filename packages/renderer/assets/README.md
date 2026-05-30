# Bundled assets

## `ambient-loop.mp3`

The default background-music bed mixed under narration (sidechain-ducked, so the
voice stays clearly legible). Users can override it with `--music-track <path>`
(CLI) / `musicTrack` (`GenerateOptions`) / `"musicTrack"` (HTTP body), or disable
music entirely with `--no-music` / `"music": false`.

**Provenance & license:** this file is **synthesized from scratch with ffmpeg**
(pure sine tones forming a C-major pad, gentle tremolo + filtering + a touch of
echo, mastered with `loudnorm`). It contains no third-party recordings or
samples, so it carries no upstream licensing obligations and is released as
**CC0 / public domain** along with the rest of this MIT project.

Regenerate it with:

```bash
ffmpeg -y \
  -f lavfi -i "sine=frequency=130.81:duration=32" \
  -f lavfi -i "sine=frequency=164.81:duration=32" \
  -f lavfi -i "sine=frequency=196.00:duration=32" \
  -f lavfi -i "sine=frequency=261.63:duration=32" \
  -filter_complex "[0][1][2][3]amix=inputs=4:normalize=1,tremolo=f=0.12:d=0.6,aformat=channel_layouts=stereo,highpass=f=80,lowpass=f=1800,aecho=0.8:0.7:90:0.25,afade=t=in:d=2,afade=t=out:st=30:d=2,loudnorm=I=-18:TP=-2.5[a]" \
  -map "[a]" -ar 44100 -ac 2 -b:a 160k packages/renderer/assets/ambient-loop.mp3
```
