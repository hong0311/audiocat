Scripts (Test Utilities)

These scripts are for local testing of AudioCat with external TTS providers. They are not part of the publishable library build.

Usage

- Build the library first: `npm run build`
- Set environment variables as needed, then run with Node:

Gemini

- Required: `GEMINI_API_KEY`, `GEMINI_TTS_MODEL`, `GEMINI_VOICE`
- Optional: `GEMINI_VOICE_ALT`
- Run: `node dist/scripts/sample-gemini.js`

ElevenLabs

- Required: `ELEVENLABS_API_KEY` (read by SDK), `ELEVENLABS_VOICE_ID`
- Optional: `ELEVENLABS_MODEL_ID` (default `eleven_v3`), `ELEVENLABS_OUTPUT` (default `mp3_44100_128`), `ELEVENLABS_LANG` (default `en`), `ELEVENLABS_SEED`
- Run: `node dist/scripts/sample-elevenlabs.js`

Notes

- MP3 stitching needs matching silence assets in `assets/silence/mp3/...` or pass a custom `silence` via options.
