# HA `2026.x` Custom Overrides, STT/Piper Add-Ons, MLX Workers & Scoped Sidecars

## 1. Custom Component & `HomeAssistantView` Contracts (`2026.x+`)

| Pitfall | Required Pattern |
| --- | --- |
| Built-in HA Core `manifest.json` omits `"version"` | Copying a built-in integration into `custom_components/<domain>/` **fails to load** unless `"version": "YYYY.M.P"` is added to `manifest.json`. |
| `HomeAssistantView.json_message(...)` returns `500` | `json_message` is an **instance** method: always call `self.json_message(message, HTTPStatus.UNAUTHORIZED)`, never `HomeAssistantView.json_message(...)` (`TypeError`). |
| YAML-configured `stt` / `tts` entity missing from `assist_pipeline` picker | `assist_pipeline` only lists engines backed by a `ConfigEntry`. In `async_setup(hass, config)`, schedule `hass.config_entries.flow.async_init(DOMAIN, context={"source": SOURCE_IMPORT}, data={})` when `not hass.config_entries.async_entries(DOMAIN)`, and implement `async_step_import` in `ConfigFlow`. |
| Cloud API key rotation breaks pipeline subentry IDs | Implement `async_step_reconfigure` (`SOURCE_RECONFIGURE` → `async_update_reload_and_abort`) so keys update in place without recreating `ConfigSubentry` IDs bound to Assist pipelines. |

## 2. Sub-Second Assist Latency Budget & `SpeechToTextEntity` Gotchas

1. **Never stack thinking models across STT and Conversation:** Enabling reasoning (`thinking_level: "low"` or `thinking_budget > 0`) on both cloud STT and Conversation adds `1.5–2.8 s` *per stage* (`~5 s` total). Pair zero-thinking STT (`gemini-3.5-flash-lite` or local GPU Whisper) with `prefer_local_intents: true` (`<30 ms` local smart-home intents) and a hot-pinned RAM Piper voice (`core_piper` configured to the exact pipeline voice so models never swap per turn).
2. **Raw PCM vs RIFF WAV in `async_process_audio_stream`:** Even when `metadata.format == stt.AudioFormats.WAV`, Home Assistant's internal Assist stream yields **headerless raw signed 16-bit little-endian PCM** chunks, whereas direct `POST /api/stt/<provider>` requests may pass a 44-byte `RIFF/WAVE` container. Inspect `raw[:4] == b"RIFF"` and handle both (downmixing stereo WAV if needed and trimming any trailing odd byte on raw `int16` PCM).
3. **In-process STT fallback lookup & language negotiation:**
   - Look up fallback STT entities via `stt.async_get_speech_to_text_engine(hass, entity_id)` (note **`_engine`**, not `_entity`, with fallback to `hass.data[stt.DATA_SPEECH_TO_TEXT].get_entity(entity_id)`).
   - Negotiate language tags before replaying buffered PCM chunks: `stt.faster_whisper` (`core_whisper`) advertises short ISO-639 codes (`"de"`), whereas cloud STT entities advertise BCP-47 (`"de-DE"`).
4. **Word-boundary wake-word stripping:** Whisper adapters fine-tuned with `strip_wake_targets=false` emit leaked wake words when satellite audio includes tail syllables (`"alexa wie spät ist es"`). Strip leading wake prefixes with strict word-boundary anchoring (`\b`) so names like `"Alexander"` or `"Echoes"` are never truncated.

## 3. HAOS `core_whisper` Custom Models & MLX → CTranslate2 `int8` Export

1. **`core_whisper` mounts `/addon_configs/core_whisper` as `/config` — NOT `/share`:**
   - Passing `/share/whisper/<model>` in `custom_model` fails `os.path.isdir(...)` inside the `core_whisper` container, causing `faster-whisper` to treat the path as a HuggingFace Hub repo ID (`HFValidationError`).
   - Upload CTranslate2 models to `/addon_configs/core_whisper/<model>` on the HAOS filesystem (set `COPYFILE_DISABLE=1` when tarring on macOS so `._*` AppleDouble files are omitted), set `model: "custom"`, `custom_model: "/config/<model>"`, `custom_model_type: "faster-whisper"`, `vad_clip: true`, and restart via `ha_manage_app(slug="core_whisper", action="restart")`.
2. **Apple Silicon MLX (`0.32+`) outbound worker rules:**
   - **Pin MLX streams to one thread:** MLX CPU/Metal streams are thread-local (`RuntimeError: There is no Stream(cpu, 0) in current thread` if `load_and_warmup()` runs on the main thread and `transcribe()` runs via `asyncio.to_thread`). Submit **both** `load_and_warmup()` and every `transcribe()` call to a single `ThreadPoolExecutor(max_workers=1)`.
   - **Pre-compile FFT + Encoder + Decoder at startup:** Run a dummy `log_mel_spectrogram` (`rfft`) plus encoder/decoder forward pass during `load_and_warmup()` (bypassing VAD silence short-circuits) so the first live turn avoids a `~4 s` Metal shader JIT stall.
   - **Use `beam_size=1` (`<|notimestamps|>`) for live voice turns:** Batched `beam_size > 1` reorders KV caches and syncs GPU→CPU every token (`~1.6–2.4 s`), whereas single-window `beam_size=1` on a fine-tuned LoRA checkpoint matches command accuracy in `~150–250 ms`.
3. **MLX Whisper → HuggingFace → CTranslate2 `int8` bijection:**
   - Swap `encoder.conv1.weight` and `encoder.conv2.weight` axes from MLX `(out, kw, in)` to PyTorch `(out, in, kw)` (`np.swapaxes(w, 1, 2)`).
   - Tie `proj_out.weight = decoder.token_embedding.weight`.
   - **Explicitly include `model.encoder._positional_embedding` → `model.encoder.embed_positions.weight`:** `mlx.nn.Module.parameters()` skips attributes starting with `_`, leaving encoder positional embeddings uninitialized (`MISSING` in `WhisperForConditionalGeneration`) unless added explicitly before `TransformersConverter(..., quantization="int8")`.

## 4. Least-Privilege Sidecars, SSH Protection Mode & Harvest Safety

1. **Never give NAS/Docker sidecars `root` SSH/SFTP access to Home Assistant:**
   - Keep `Advanced SSH & Web Terminal` (`a0d7b954_ssh`) on **`Protection Mode: ON` (`protected: true`)** so SSH sessions cannot access the host Docker socket (`ha core check`, `ha core restart`, and SFTP to `/homeassistant` / `/addon_configs` still work normally).
   - Split sidecar credentials by least privilege:
     - **Compute workers (STT/TTS):** Capability `Bearer` token (`requires_auth = False` + `hmac.compare_digest` against `!secret` in `/config/secrets.yaml` `0600`) — zero HA user/state/service access.
     - **Multi-user data sidecars (e.g. read+delete harvester vs read-only reader):** Provision non-admin, `local_only: true`, `group_ids: ["system-read-only"]` HA accounts, enforce explicit username/ID allowlists (`allow_admins: false` by default) in a custom HTTP view, and walk relative paths segment-by-segment refusing symlinks (`os.path.islink`), hidden segments, and root escapes (`resolved.is_relative_to(root_resolved)`).
2. **Passive `debug_recording_dir` harvesting invariants:**
   - Exclude `/share` (`include_folders: null` / `[]`) from HAOS automatic backups so WAV captures do not bloat backups.
   - Correlate `<pipeline>/<monotonic_ns>/*.wav` folders to in-memory `pipeline_debug` run timestamps using HA's live `(time.time_ns() - time.monotonic_ns())` offset (`<1 ms` accuracy; fall back to `mtime` across HA reboots).
   - **Verify closed RIFF WAV headers (`data_size > 0` and `st_size >= 44 + data_size`) before harvesting or deleting:** Home Assistant writes a placeholder `0`-size RIFF header while an utterance is still streaming!
