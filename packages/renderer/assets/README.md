# Bundled assets

## `music/` — mood-matched background tracks

`music/<mood>.mp3` is the library of background beds mixed under narration
(sidechain-ducked, so the voice stays clearly legible). The mood is normally
chosen by the LLM (`meta.mood`) based on the subject, and resolved by
`src/music.ts`:

| mood       | feel                                             |
| ---------- | ------------------------------------------------ |
| `wonder`   | lush, open, optimistic — science / how-it-works  |
| `mystery`  | sparse, dark, suspenseful — open questions       |
| `dramatic` | building, cinematic, weighty — high stakes        |
| `upbeat`   | bright, moving, energetic — products / tutorials |
| `calm`     | soft, warm, slow — meditative explainers         |

Override with `--music-mood <mood>` / `musicMood`, supply your own file with
`--music-track <path>` / `musicTrack`, switch to the Jamendo catalogue with
`--music-source jamendo` (needs `JAMENDO_CLIENT_ID`), or disable music with
`--no-music` / `"music": false`.

**Provenance & license:** every track is **synthesised from scratch with `sox`
+ `ffmpeg`** — a sustained chord pad, a plucked arpeggio walking the chord
tones, and a bass root note per chord, glued with reverb and a gentle low-pass,
then loudness-normalised. There are **no third-party recordings or samples**, so
the library carries no upstream licensing obligations and is released as
**CC0 / public domain** along with the rest of this MIT project.

Regenerate the whole library (or a single mood) with:

```bash
node packages/renderer/scripts/build-music.mjs          # all moods
node packages/renderer/scripts/build-music.mjs wonder   # just one
```

The recipes (chords, tempo, reverb, etc.) live in `scripts/build-music.mjs`.

### Jamendo (optional, real catalogue)

With `--music-source jamendo` and a free [Jamendo API](https://devportal.jamendo.com/)
`client_id` in `JAMENDO_CLIENT_ID`, chalkboard fetches a real instrumental track
matched to the mood instead of the bundled bed. Jamendo's catalogue is Creative
Commons, so the required attribution is captured and surfaced in the CLI output
and the `generate()` result (`result.music.attribution`).
