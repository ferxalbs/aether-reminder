# Manual GPT Live Transcribe integration test

This test is intentionally gated and must not run in CI. It requires a current
Expo development build, a physical iOS or Android device, network access, and a
user-provided OpenAI API key saved through AETHER Settings.

## Account/session gate

Run only when intentionally testing the configured OpenAI account:

```bash
RUN_AETHER_VOICE_INTEGRATION=1 OPENAI_API_KEY=... bun test src/services/transcription/voiceAccess.manual.test.ts
```

The gate creates a short-lived Realtime client secret for the exact production
session configuration. It does not record audio. Never put the key in a committed
file or an `EXPO_PUBLIC_` variable.

## Physical-device microphone flow

1. Install a newly rebuilt development binary and launch AETHER.
2. Save the BYOK OpenAI key in Settings and run its connection check.
3. Tap the microphone. Confirm the OS prompt appears only if permission is not
   already decided.
4. Confirm the surface progresses through permission, connecting, and listening.
5. Say exactly: “Remind me tomorrow at nine to review the report”.
6. Confirm partial transcript text appears while speaking.
7. Tap **Stop & Send** once. Confirm capture stops and the surface finalizes.
8. Confirm the completed transcript—not a partial—is passed unchanged into the
   existing AETHER interpretation pipeline.
9. Confirm the assistant enters its existing review/confirmation state and no
   reminder is committed from partial text.
10. Cancel and immediately reopen voice capture. Repeat ten open/stop/cancel loops,
    background the app once, exercise Android Back, and verify the microphone and
    WebSocket are released after each path.

Record the device, OS, development-build identifier, OpenAI project tier, exact
provider error (if any), and observed final transcript in the validation report.
