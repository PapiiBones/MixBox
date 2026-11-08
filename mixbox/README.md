# Mixbox DJ

A rekordbox-style two-deck DJ app for **macOS and Windows**, built with Electron. The whole engine is one page (`app/index.html`) that runs on the Web Audio API, so it also runs in a browser.

## Build the .exe / .dmg

### Option A — on your own computer (simplest)
Install **Node.js 20+** from nodejs.org, then in this folder:

```bash
npm install
npm start            # run it now, no packaging
npm run dist:win     # Windows → dist/Mixbox DJ Setup 1.0.0.exe + dist/MixboxDJ-Portable-1.0.0.exe
npm run dist:mac     # macOS   → dist/Mixbox DJ-1.0.0-universal.dmg  (must be run on a Mac)
```

Build each platform on that platform: the Windows `.exe` on Windows and the Mac `.dmg` on a Mac.

### Option B — let GitHub build both for you
Push this folder to a GitHub repo. The included workflow (`.github/workflows/build.yml`) builds the Windows installer, the portable `.exe` and the universal Mac `.dmg` on every push. Download them from the run's **Artifacts** section on the Actions tab.

### First launch (unsigned builds)
- **Windows:** SmartScreen may say "Windows protected your PC". Click **More info → Run anyway**.
- **macOS:** right-click the app → **Open** → **Open**. Or run `xattr -cr "/Applications/Mixbox DJ.app"`.

To remove these warnings you need an Apple Developer ID and a Windows code-signing certificate. electron-builder picks them up through `CSC_LINK` / `CSC_KEY_PASSWORD`.

## Features (mapped to rekordbox)

| rekordbox | Mixbox DJ |
|---|---|
| Analysis: BPM, beat grid, key, 3-band waveform | Onset/autocorrelation BPM with comb-filter refinement, half/double-time check, downbeat detection, Krumhansl key → Camelot, blue/orange/white 3-band waveform |
| Enlarged + overview waveforms | Scrolling zoomed waveforms with beat grid, bar lines, cue/hot cue/loop markers; overview with needle search and a 30-second end warning |
| Deck: Play/CUE (CDJ behavior), jog, tempo ±6/10/16/WIDE, pitch bend | Same. Jog has Vinyl mode (scratch, reverse included) and CDJ mode (nudge). |
| Sync / Master / beat sync | Tempo sync with half/double handling, phase alignment, master deck |
| 8 Hot cues, memory cue | 8 hot cues A–H (Shift = delete), memory cue; saved per track |
| Loops: In/Out, Reloop/Exit, auto beat loop, ½ ×2, beat jump | Same, plus Quantize and Slip mode |
| Grid edit, tap tempo | ÷2, ×2, shift grid, set downbeat at playhead, TAP |
| Mixer: trim, 3-band EQ (kill), Color FX filter, channel faders, crossfader curves | Same (filter has resonance), VU meters, limiter on master |
| Beat FX | 2 units: Echo, Ping Pong, Reverb, Flanger, Phaser, Trans, LFO Filter, Bit Crush; beat-synced, assign to CH1/CH2/Master |
| Headphone cue | Per-channel CUE, cue/master mix, phones level, routed to a second audio output |
| Sampler | 8 pads with built-in sounds; Shift+pad loads your own |
| Collection, playlists, history, ratings, colors, search, related tracks | Same; MATCH shows key-compatible tracks within ±8% BPM; drag and drop to decks and playlists |
| Automix | Beat-matched automix through the current list or playlist |
| Recording | Records the master output to a file |
| Controllers | MIDI Learn, setup wizard (XDJ-RR and any 2-deck MIDI unit), DDJ-400 preset, LED feedback, 14-bit faders, headphone cue on outputs 3/4 |
| rekordbox for iOS/Android | Mixbox phone app (see below) |
| rekordbox xml | Import (tracks, BPM/grid, key, hot cues, memory cue, ratings, colors, playlist folders) and export |

**Not included:** key lock / master tempo (pitch moves with tempo, like vinyl), HID-mode controllers, stems, streaming services, export to USB for CDJs (that format is proprietary). Use the XML export and let rekordbox do the USB export.

## Keyboard
Deck 1: `Z` cue · `X` play · `1–4` hot cues · `A` sync · `Q/W` tempo · `S` loop
Deck 2: `N` cue · `M` play · `7–0` hot cues · `J` sync · `O/P` tempo · `K` loop
`←/→` crossfader · `Shift+←/→` load selected track · `F1/F2` FX on · `/` search · `?` help

## Controllers (XDJ-RR and others)
1. Connect the XDJ-RR by USB. On Windows, install Pioneer's XDJ-RR driver first; macOS needs no driver.
2. On the XDJ-RR: **UTILITY → MIXER MODE → MIDI CONTROL** (so the mixer section is sent to the computer too), then press **MIDI → LOAD** to enter MIDI mode.
3. In Mixbox: **MIDI → XDJ-RR / controller setup wizard**. Do each control as prompted and **Skip** any your unit doesn't have. Takes about 3 minutes. The mapping is saved, and you can copy or paste it as JSON to back it up.
4. **Audio** → set Master output to the XDJ-RR and tick **Headphones on outputs 3/4**. Then each channel's 🎧 CUE button plays in the XDJ-RR's headphone jack.
- **MIDI Learn:** click any on-screen control, then move the hardware control to remap it.
- **DDJ-400:** one-click preset.
- Button and pad LEDs light to match the app.

## Phone app (organize + sync)
The desktop app serves a phone app over your Wi-Fi, so both share **one library, synced live**.
1. Desktop: **📱 Phone → Start sync**. It shows an address like `http://192.168.1.20:7777` and a 6-digit PIN.
2. Phone (same Wi-Fi): open that address, enter the PIN, then Share → **Add to Home Screen**.
3. On the phone you can:
   - Browse, search and filter by BPM range, compatible key, genre, rating or color.
   - Preview tracks (streamed from the computer) and set CUE and hot cues A–H.
   - Rate, color and edit tags.
   - Build playlists: drag to reorder, **✨ Harmonic order** (auto-sequences by Camelot key and BPM), and see a key/BPM check between every pair of tracks.
   - Save any filter result as a playlist, or save desktop History as a set.
   - Upload audio from the phone to the computer.
- Edits are sent as small field-level changes, so edits from the phone and the desktop merge instead of overwriting each other. Changes made while the phone is offline are queued and sent when it reconnects.
- The phone app is served by the computer, so it opens only while Mixbox is running with sync on and both are on the same Wi-Fi. If the connection drops while it's open, it keeps showing the last synced library and queues your edits.
