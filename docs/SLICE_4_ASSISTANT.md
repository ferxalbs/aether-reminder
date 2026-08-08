# Slice 4 — Universal Assistant smoke path

The live-provider smoke test is opt-in and skipped by normal `bun test` runs. It uses an in-memory SQLite database, so the task created by the test is not written to the app database.

1. Set a user-supplied OpenRouter key and a model ID that the OpenRouter catalog reports as streaming and tool-capable:

```bash
export AETHER_OPENROUTER_SMOKE_KEY='sk-or-v1-…'
export AETHER_OPENROUTER_SMOKE_MODEL='provider/model-with-tools'
```

2. Run only the live smoke test:

```bash
bun test src/services/agent/openRouter.smoke.test.ts
```

The test validates, in order, a real request, SSE `response.delta` events, a real `tasks.create` tool call, a completed tool result, a subsequent model response, and `response.completed`. It is never run by the normal unit-test command unless both environment variables are explicitly supplied.

For the manual app acceptance path, launch the app, open Settings, save the key in SecureStore, choose an available agent-capable model, return Home, and use the center Orb. The app must show streamed text before the final response, then a native receipt after a task mutation.
