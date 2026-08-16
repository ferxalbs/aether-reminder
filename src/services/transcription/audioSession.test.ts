import { describe, expect, test } from "bun:test";
import { createOwnedAudioSession } from "./audioSessionLease";

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("Expo audio session ownership", () => {
  test("serializes cancellation behind an in-flight activation and releases the lease", async () => {
    const activation = deferred();
    const recordingModes: boolean[] = [];
    let calls = 0;
    const session = createOwnedAudioSession(async (mode) => {
      calls += 1;
      recordingModes.push(Boolean(mode.allowsRecording));
      if (calls === 1) await activation.promise;
    });
    const firstOwner = Symbol("first");
    const secondOwner = Symbol("second");

    const activating = session.activate(firstOwner);
    const deactivating = session.deactivate(firstOwner);
    activation.resolve();
    await Promise.all([activating, deactivating]);
    await session.activate(secondOwner);
    await session.deactivate(secondOwner);

    expect(recordingModes).toEqual([true, false, true, false]);
  });

  test("rejects a second owner while the first lease is genuinely active", async () => {
    const session = createOwnedAudioSession(async () => undefined);
    const firstOwner = Symbol("first");
    await session.activate(firstOwner);
    await expect(session.activate(Symbol("second"))).rejects.toMatchObject({
      code: "AUDIO_STREAM_START_FAILED",
    });
    await session.deactivate(firstOwner);
  });
});
