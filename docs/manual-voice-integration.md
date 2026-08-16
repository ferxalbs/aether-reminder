# Manual hosted voice validation

This checklist validates the AETHER Cloud-authorized voice path on a physical
development build. Mobile does not accept or use an OpenAI API key.

## Development diagnostic output

Voice diagnostics exist only when React Native's `__DEV__` flag is enabled. Each line
starts with:

```text
[AETHER_VOICE_DIAGNOSTIC]
```

The remainder is JSON with schema `aether.voice.diagnostic.v1`. Filter the Metro
terminal for that prefix. If using Android platform tools locally, the equivalent
device filter is:

```bash
adb logcat | rg AETHER_VOICE_DIAGNOSTIC
```

Do not paste unrelated device logs. The diagnostic schema includes only a generated
voice-session id, stage names, format metadata, counters, safe error codes, and OpenAI
request ids. It does not include the OpenAI key, ephemeral credential, authorization
headers, SecureStore values, PCM/audio bytes, item ids, or transcript text.

## Physical-device microphone flow

1. Wait for the current Android development EAS build to finish, then install that
   development APK on the phone. Do not use an older binary after native config changes.
2. Start the project with `bun start`, connect the development build to Metro, and
   keep the Metro terminal visible.
3. Filter or search the terminal for `[AETHER_VOICE_DIAGNOSTIC]` and clear older output.
4. Launch AETHER with a configured development AETHER Cloud origin. Do not add
   provider credentials anywhere in the app.
5. Tap the microphone. Confirm the OS prompt appears only if permission is not
   already decided.
6. Confirm the surface progresses through permission, connecting, and listening.
7. Say exactly: “Remind me tomorrow at nine to review the report”.
8. Confirm partial transcript text appears while speaking.
9. Tap **Stop & Send** once. Confirm capture stops and the surface finalizes.
10. Confirm the completed transcript—not a partial—is passed unchanged into the
    existing AETHER interpretation pipeline.
11. Confirm the assistant enters its existing review/confirmation state and no
    reminder is committed from partial text.
12. Copy every diagnostic line sharing the new `sessionId`. The final
    `session_summary` must show `parserHandoffCount: 1` and
    `cleanupCompleted: true`.
13. Cancel and immediately reopen voice capture. Repeat ten open/stop/cancel loops,
    background the app once, exercise Android Back, and verify the microphone,
    WebSocket, and audio session are released after each path.

For a failure, preserve the full set of lines for one `sessionId`, plus the visible UI
error. The last successful stage identifies the boundary:

- No `permission_result`: Android permission check/prompt failed.
- No `microphone_stream_started`: Expo native PCM stream failed to start.
- No `audio_format_detected` or `pcm_progress`: the stream started but delivered no buffer.
- `credential_request_failed`: use its safe `errorCode` and `requestId` for OpenAI support.
- No `websocket_open`: the ephemeral-key WebSocket connection failed.
- `websocket_open` but no `session_configuration_accepted`: OpenAI rejected or did
  not acknowledge the current transcription session configuration.
- `websocket_closed` before completion with `expected: false` identifies a network
  or provider connection failure.
- `session_configuration_rejected`: OpenAI rejected the session configuration.
- No `audio_append_progress`: normalized PCM did not reach the WebSocket queue.
- No `commit_sent`: manual stop did not flush/commit.
- Deltas but no `transcription_completed`: finalization failed or timed out.
- `transcription_completed` but no `parser_handoff`: final transcript reconciliation failed.
- `parserHandoffCount` other than `1`: do not commit; report the complete diagnostic session.
- No `cleanup_completed`: microphone/WebSocket/audio-session cleanup did not finish.

Record the device, OS, development-build identifier, OpenAI project tier, exact
provider error (if any), and observed final transcript in the validation report.
