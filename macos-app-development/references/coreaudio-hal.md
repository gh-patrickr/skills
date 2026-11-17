# Native CoreAudio HAL (`AUHAL`) vs. Browser & `VoiceProcessingIO`

## When native CoreAudio beats browser `AudioWorklet`

1. **Direct hardware ADC clock lock (`kAudioDevicePropertyNominalSampleRate`):** Browsers cannot
   switch a CoreAudio device's hardware nominal sample rate (`44.1` -> `48` / `96` / `192 kHz`);
   mismatches insert OS or browser sample-rate conversion (SRC). Query
   `kAudioDevicePropertyAvailableNominalSampleRates` and set `kAudioDevicePropertyNominalSampleRate`
   directly on the `AudioDeviceID`, polling up to `1.5 s` for PLL lock.
2. **Exclusive Hog Mode (`kAudioDevicePropertyHogMode`):** Writing `getpid()` to
   `kAudioDevicePropertyHogMode` prevents background apps or notifications from altering sample
   rate or mixing on the device mid-session. **Always** release (`pid_t(-1)`) in `stop()`,
   `deinit`, and `NSApplication.willTerminateNotification`.
3. **Bypassing WebRTC & Control Center Mic Modes:** Binding to `kAudioUnitSubType_HALOutput`
   (`AUHAL`) reads raw `32-bit Float` LinearPCM straight from the hardware input bus with zero
   WebRTC AGC/NS/VoiceIsolation and zero HTTPS certificate friction.
4. **Discrete multi-channel capsule arrays:** Query `kAudioDevicePropertyStreamConfiguration` on
   `kAudioObjectPropertyScopeInput` to read all `N` discrete channels (`> 2` channels are
   typically clamped or downmixed in browsers).

## `AUHAL` setup sequence (without changing the user's system default mic)

1. Find `kAudioUnitType_Output` / `kAudioUnitSubType_HALOutput` / `kAudioUnitManufacturer_Apple`.
2. Enable input on **Bus 1** (`kAudioOutputUnitProperty_EnableIO = 1` on `kAudioUnitScope_Input`),
   and disable output on **Bus 0** (`= 0` on `kAudioUnitScope_Output`) **before** binding the
   device.
3. Bind `kAudioOutputUnitProperty_CurrentDevice` on `kAudioUnitScope_Global` (`element 0`) to the
   target `AudioDeviceID` — never mutate `kAudioHardwarePropertyDefaultInputDevice`.
4. Read `kAudioUnitProperty_StreamFormat` on `(kAudioUnitScope_Input, bus 1)` to get the active
   hardware `mSampleRate` and `mChannelsPerFrame`.
5. Set client `AudioStreamBasicDescription` on `(kAudioUnitScope_Output, bus 1)` to packed
   interleaved `Float32` (`kAudioFormatFlagIsFloat | kAudioFormatFlagIsPacked`) at the exact
   hardware `mSampleRate` so CoreAudio performs zero SRC.
6. Pre-allocate a fixed `Float` scratch buffer before `AudioOutputUnitStart` so the real-time
   `AURenderCallback` performs `AudioUnitRender` with zero heap allocation on the audio IO thread,
   then hand off framing/WebSocket IO to a `.userInteractive` serial `DispatchQueue`.

## Required `Info.plist` & entitlements for microphone capture

- `Info.plist`: `NSMicrophoneUsageDescription` (non-empty user-facing reason).
- `entitlements.plist`: `com.apple.security.device.audio-input = true`.
- Sign with `codesign --force --deep --sign - --entitlements entitlements.plist MyApp.app`.

## When to offer `VoiceProcessingIO` as a toggle

Provide a selectable second mode using `AVAudioEngine` with
`try inputNode.setVoiceProcessingEnabled(true)` when loudspeaker TTS prompts are played in the
same room without headphones (gives Apple's hardware-tuned linear acoustic echo cancellation
while keeping `AUHAL` as the default for bit-transparent studio masters).
