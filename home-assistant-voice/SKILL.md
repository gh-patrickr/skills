---
name: home-assistant-voice
description: Use when building, aligning, or debugging Home Assistant Assist voice pipelines, custom stt or conversation integrations, Alexa-to-HA smart-home migrations, local voice routers/reflex compilers, or household voice-command datasets.
---

# Home Assistant & Local Voice Pipeline Engineering

**Applies to:** Home Assistant (`2026.x+`) voice assistants, custom `stt` / `conversation` components, outbound GPU workers, smart-home registry alignment, and voice-command training decks. Keep household names, room inventories, LAN hosts, and tokens in gitignored local files.

## 1. Tidy Home Assistant Registries Before Voice Learning

Adaptive alias learning, Whisper LoRA fine-tuning, and LLM routing all fail if Home Assistant's registries are noisy:

1. **Canonicalize Areas & Devices first:** Remove furniture/empty pseudo-areas, move misplaced devices to physical rooms, humanize opaque bridge names (e.g. raw Hue `Dnk <N>` bulbs) from entity slugs, unexpose cross-room Hue Zones that collide with room names, and port active Alexa routines into voice-exposed `script.*` entities.
2. **Bind room climate sensors explicitly:** Set `temperature_entity_id` and `humidity_entity_id` on each Area (`config/area_registry/update`). **Exclude appliance/process temperature sensors** (3D-printer nozzles/beds at `200+ °C`, NAS/CPU thermals, boiler pipes) from room-climate resolution.
3. **Prune stale memory on boot:** Whenever the HA catalog updates, deactivate orphaned aliases and compiled reflexes referencing removed or synthetic `entity_id`s before serving turns.

## 2. Home Assistant `2026.x` Registry & Live-State Gotchas

| Pitfall | Required Pattern |
| --- | --- |
| `config/entity_registry/list` omits `aliases` and `device_class` in HA `2026.x` | Pipeline `config/entity_registry/get` over the same open WebSocket for all included entities (`<30 ms` for ~100 entities) instead of assuming empty aliases. |
| `aliases` arrays contain `None` (`COMPUTED_NAME` sentinel) | Filter `isinstance(a, str) and a.strip()` before indexing or serializing aliases. |
| Full `GET /api/states` dumps ~500+ internal entities | Refresh `state` and `attributes` on a short TTL (`~5 s`) **only** for entities already in the curated catalog so uncurated entities never bloat LLM prompts; drop GPS/token/picture attributes. |
| Short-lived OAuth tokens expire mid-daemon | On `HTTP 401` from `/api/states` or `/api/services/...`, refresh the bearer token once and retry; fall back to cached states if HA is temporarily unreachable. |

## 3. Satellite Topology & Outbound Worker Architecture

Physical satellites (ESPHome Voice PE, tablet panels, liberated smart speakers) stream raw 16 kHz PCM to **Home Assistant's `assist_pipeline`** (Wake Word → STT → Conversation → TTS), never directly to a standalone text/JSON HTTP server.

- **Outbound capability-token WebSocket (`/api/<domain>/worker`):** Never hardcode a workstation's DHCP IP into Home Assistant or open inbound ports on the GPU host. Register a `HomeAssistantView` (`requires_auth = False`) verifying a dedicated capability `Bearer` token (`>= 24` chars via `hmac.compare_digest` — zero HA admin/user privileges) and connect **outbound** from the GPU worker with bounded exponential backoff.
- **Zero-downtime `<1 ms` fallback:** Track `is_worker_connected` on an in-memory broker (`hass.data[DOMAIN]`), fail in-flight futures immediately on socket close, and delegate in-process when offline (`stt.faster_whisper` for STT; `conversation.async_converse(..., agent_id=fallback_agent_id)` for Conversation) while preserving `device_id`, `satellite_id`, and `language`.
- **HA `2026.11+` custom component contracts:**
  - Use `probatio` for `CONFIG_SCHEMA` and `ConfigFlow` schemas.
  - On `ConversationEntity`, set `_attr_supported_features = conversation.ConversationEntityFeature.CONTROL`, call `conversation.async_set_agent(hass, entry, self)` in `async_added_to_hass`, and resolve room context via `device_registry` → `area_registry` from `user_input.device_id`.
  - Keep token auth and wire-payload builders in a pure-Python `security.py` module **free of `homeassistant.*` imports** so standalone `pytest` CI validates security and framing in `<1 s` without installing Home Assistant Core.

## 4. Safety Firewall, Compact Local LLMs & Voice Datasets

1. **Domain-agnostic `RED`-tier safety gate:** Never classify actuation risk by HA `domain` alone — garage openers, door strikes, and NAS/server power plugs are frequently `switch.*` (`platform: rest` or smart plugs) rather than `cover.*` or `lock.*`. Match both `entity_id`/name tokens *and* utterance intent patterns (`garage`, `lock/door`, `alarm`, `nas/server/proxmox`) to block without explicit PIN verification. Default gateways to `read_only=True` dry-run unless `--live-ha` is passed.
2. **Reflex-compilation hygiene:** Never auto-compile `RED`-tier actuations, live web searches, weather forecasts, or dynamic sensor answers into static cached reflexes. Support immediate barge-in `Stop` rollback of newly promoted reflexes within a short window (`~15 s`).
3. **Compact `2B–4B` local LLM guardrails:**
   - **Strip home entities on pure knowledge turns:** Passing 20 smart-home sensors alongside a science, recipe, or translation question causes `2B–4B` models to hedge (*"check your sensors"*). Omit `entities` when no home/room/device token appears (also cutting prompt tokens ~80%).
   - **Deterministic pre-LLM math & normalization:** Evaluate explicit arithmetic (`+`, `-`, `*`, `/`, `%`) in Python before `2B` generation; protect `\d+ mal \d+` multiplication when stripping German polite filler `"mal"`; collapse spoken initialisms (`"T. V."` → `"tv"`, `"3 D"` → `"3d"`).
4. **Voice recording decks & NLU taxonomy:** Cover near-field, far-field, mid-command hesitation pauses (`... ähm ...` for VAD/endpointing), bare wake words (`ABORT`), and unaddressed room speech (`Not_for_assistant`) across the 15-domain NLU schema (`ABORT`, `Communication`, `Echo.SDK`, `HomeAutomation`, `Knowledge`, `Music`, `Notifications`, `Recipes`, `Routines`, `Shopping`, `Stop`, `Translation`, `Not_for_assistant`, `Video`, `Weather`). Validate every prompt's expected `entity_id`s against the live synced HA catalog.
