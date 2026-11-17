---
name: voice-satellite-corpus
description: Use when inspecting Home Assistant via ha-mcp, auditing Assist voice pipelines for cloud-vs-local privacy, capturing single- or multi-device audio test corpora from ESPHome, TECHO5, or Fire tablet voice satellites, or auto-labeling voice corpora with teacher-student STT and VAD gates.
---

# Voice Satellite Audio Corpus Capture & `ha-mcp` Auditing

**Applies to:** inspecting Home Assistant voice setups over `ha-mcp`, verifying local-only STT/TTS routing, and recording realistic household voice-command corpora from hardware or tablet satellites (ESPHome, TECHO5 / TECHO5 Panel, Kiosk Satellite). Keep hostnames, capability tokens, device IPs, and recorded audio in gitignored `0600` local files.

## 1. Querying Home Assistant via `ha-mcp` (Streamable HTTP JSON-RPC 2.0)

1. **Endpoint auth differs by port:**
   - **Private `ha-mcp` port (`http://<HA_HOST>:9584/private_<token>`)**: capability secret is in the URL path; no `Authorization` header is needed.
   - **Home Assistant webhook (`http://<HA_HOST>:8123/api/webhook/mcp_<id>`)**: returns `401 Unauthorized` unless `Authorization: Bearer <HA_LONG_LIVED_TOKEN>` is sent.
2. **Streamable HTTP session contract:**
   - Send `Content-Type: application/json` and `Accept: application/json, text/event-stream` on every `POST`.
   - Call `initialize` (`protocolVersion: "2025-03-26"`), capture the `Mcp-Session-Id` response header, and replay `Mcp-Session-Id` on every subsequent `tools/list` and `tools/call`.
   - Parse Server-Sent Events (`data: {...}` lines) from the response stream.
3. **Mandatory `ha-mcp` server protocol:**
   - Call `ha_get_skill_guide()` with no arguments **first**: it returns best-practice rules, the hourly-rotating `BestPracticeKey` read-receipt required on gated write tools, and a Reference Files table. Load *only* matching `file="references/<name>.md"` entries — never load all reference files upfront.
   - Check `instructions` for **Read Only Mode** (`READ_ONLY_MODE` blocks write tools until toggled in the `ha-mcp` App settings).
   - **YAML-only settings** (such as `assist_pipeline:` in `/config/configuration.yaml`) have no UI/API config flow even when write tools are enabled; edit via SSH/File Editor after backing up, validate with `homeassistant.check_config`, and confirm with the user before `homeassistant.restart`.
   - Since Home Assistant 2026.2, Supervisor add-ons are named **Apps** (`ha_get_app`, `ha_manage_app`).

## 2. Voice Pipeline Privacy & Readiness Audit (Before Recording)

Run three read-only checks via `ha-mcp` before routing household audio through Home Assistant:

1. **Cloud-leak check (`ha_manage_pipeline` `action="list"`):** Inspect `preferred_pipeline` and each pipeline's `stt_engine`, `tts_engine`, and `conversation_engine`. Cloud pipelines (e.g. `stt.google_ai_stt`) are often set as preferred alongside a local `stt.faster_whisper` + `tts.piper` pipeline. Explicitly assign test satellites to the local pipeline so household corpus takes never leave the LAN.
2. **Installed-App vs stale-entity check (`ha_get_app` + `ha_search`):** A pipeline JSON can reference `wake_word.openwakeword` (or a renamed `wake_word_id` like `hey_jarvis_v0.1` vs `hey_jarvis`) while the `openWakeWord` App is uninstalled or stopped (`0` loaded `wake_word.*` entities). Home Assistant shows no UI error and silently answers "no wake word" on every check.
3. **Satellite pairing check (`ha_get_integration` `domain="esphome"` + `ha_search` `query="assist_satellite"`):** Verify satellites are actually paired before debugging missing recordings.

## 3. Choosing the Right Audio Corpus Capture Mechanism

Built-in satellite and Home Assistant recorders slice audio very differently. Match the capture path to what your downstream benchmark evaluates:

| Mechanism | Saved Format & Scope | Hard Limits & What Gets Lost | Best Use Case |
| :--- | :--- | :--- | :--- |
| **Direct ESPHome Continuous Stream** (`:6053` `VoiceAssistant` wake-word stream / TECHO5 `Wake word on Home Assistant`) | Continuous `16 kHz` mono `S16LE` (`32 KB/s` per satellite) to a silent host collector (`aioesphomeapi`) | Fixed `16 kHz` `16-bit` satellite rate (not `48 kHz` float studio master) | **Structured & multi-device corpora:** single unclipped WAVs with `[pre-roll + wake word + command + tail silence]` + JSON sidecars; zero chimes; captures missed wakes |
| **HA `assist_pipeline` `debug_recording_dir`** (`/share/assist_pipeline` in `configuration.yaml`) | Per-run subfolder with `01_stt.wav` (`16 kHz` mono); `00_wake_word.wav` **only** if HA ran wake detection | Drops pre-roll, wake word & post-VAD tail silence by default; splits wake/STT into 2 files; **no JSON transcript/device sidecars on disk**; misses false-negative wakes; bloats HAOS backups | **Passive daily harvesting** of real spontaneous post-wake commands on a local STT pipeline |
| **Satellite Wake-Clip Ring Buffer** (TECHO5 `Keep wake clips` → `wake_clips` / `wake_clip_audio`) | Rolling `16 kHz` mono WAV + score/cutoff JSON (`wake`, `nearmiss`, `mistake`, `noise`) | Fixed **`4 s` up to trigger** — cuts off the command; turning switch off **deletes all clips** | Passively harvesting real-room **hard-negative false wakes** (TV/chatter/`NOT_FOR_ALEXA`) and near-misses |
| **Satellite Kept Turns / Word Recorder** (TECHO5 `turn_audio` / Setup-page `Record takes of a word`) | Post-wake STT WAVs (`turn_audio`, rolling `<= 10` turns), or browser `.zip` (`Record takes`) | `turn_audio` omits wake word; `Record takes` **discards utterances `> 2.6 s`** and splits pauses `> 250 ms` | Training custom wake words (`wakesmith`) or spot-checking recent STT turns — **never** full sentences |

## 4. Multi-Device Simultaneous Room Recording Checklist

When capturing the same spoken prompt across multiple tablets/satellites at near- and far-field room positions simultaneously:

1. **Disable spatial arbitration** (e.g. TECHO5 `Nearest device answers`), which otherwise silences every co-located satellite except the highest-SNR winner.
2. **Never gate multi-device corpus capture on on-device wake words:** whenever a far-field tablet misses the wake word, it never opens an Assist pipeline run — silently dropping the exact false-negative edge cases your benchmark needs. Stream continuously (`Wake word on Home Assistant` / ESPHome wake-word flag) to a host collector instead.
3. **Silence chimes and TTS replies:** if multiple co-located satellites trigger an active HA pipeline simultaneously, early chimes and spoken TTS answers contaminate sibling microphones mid-utterance.
4. **Record DSP switch state in metadata:** Android `AudioSource.VOICE_RECOGNITION` vs raw `MIC`, plus satellite auto-leveling, denoiser, and AEC switches alter SNR and waveform dynamics; set them deliberately and log their state in each clip's JSON sidecar.
5. **Hygiene for `debug_recording_dir` (when used for passive collection):**
   ```yaml
   assist_pipeline:
     debug_recording_dir: /share/assist_pipeline
   ```
   Use two-line YAML indentation, validate with `homeassistant.check_config` before restarting, read the live WebSocket `assist_pipeline/run/debug` stream if transcripts are needed (the UI Debug view only holds a small in-memory ring buffer lost on restart), and purge `/share/assist_pipeline` before full Home Assistant OS backups.

## 5. Randomized Boundary Trimming & Multi-Gate Auto-Labeling

When curating evaluation or fine-tuning corpora from studio masters or imported satellite/tablet recordings, avoid both fixed-offset shortcut learning and manual labeling of easy clips:

1. **Preserve lossless `raw/` + randomize `trimmed/` guard silence:** Keep the untrimmed capture in `raw/` (`chmod 0600`) and slice `trimmed/` takes to `[wakeword_onset - U(pre_min, pre_max), speech_end + U(post_min, post_max)]` (e.g. `U(1, 5) s` pre-wake, `U(2, 5) s` post-speech, extending with measured comfort room-tone when natural silence is shorter). Varying pre- and post-roll prevents wake-word and endpointing models from overfitting time-since-clip-start.
2. **Three orthogonal review gates (human labels borderline clips only):**
   - **Teacher confidence gate:** Transcribe with a strong calibrated cloud STT teacher (e.g. GCP Speech v2 Chirp 2/3 or Deepgram Nova-2/3 with word-level confidence) and flag `needs_review` if `utterance_confidence < tau_utt` (e.g. `0.85`) or `min_word_confidence < tau_word` (e.g. `0.78`).
   - **Teacher–student disagreement gate:** Transcribe the same clip locally with the target student ASR (e.g. MLX Whisper) and flag `needs_review` whenever normalized token `WER > 0` (or when cross-checking two cloud teachers that disagree).
   - **Signal & VAD sanity gate:** Flag `needs_review` if Silero/spectral VAD reports no speech on a non-silence prompt, borderline speech probability (`max_speech_prob < 0.45`), digital clipping (`|peak| >= 0.98`), or an empty transcript.
3. **Sticky `human_verified` state & SHA-256 source deduplication:** Deduplicate imported NAS/tablet files by `source_sha256` before trimming, and make `review_status = "human_verified"` sticky so batch re-runs of the auto-labeler skip human-approved transcripts unless explicitly forced.
