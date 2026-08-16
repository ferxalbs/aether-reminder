import { VoiceError } from "./errors";

const BASE64_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export interface NativePcmBuffer {
  data: ArrayBuffer;
  sampleRate: number;
  channels: number;
  timestamp: number;
}

export function pcm16ToBase64(data: ArrayBuffer): string {
  if (data.byteLength % 2 !== 0) {
    throw new VoiceError(
      "AUDIO_FORMAT_UNSUPPORTED",
      "PCM16 data must contain complete samples.",
    );
  }
  const bytes = new Uint8Array(data);
  let output = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index];
    const second = index + 1 < bytes.length ? bytes[index + 1] : 0;
    const third = index + 2 < bytes.length ? bytes[index + 2] : 0;
    const triple = (first << 16) | (second << 8) | third;
    output += BASE64_CHARS[(triple >> 18) & 0x3f];
    output += BASE64_CHARS[(triple >> 12) & 0x3f];
    output +=
      index + 1 < bytes.length ? BASE64_CHARS[(triple >> 6) & 0x3f] : "=";
    output += index + 2 < bytes.length ? BASE64_CHARS[triple & 0x3f] : "=";
  }
  return output;
}

export function pcm16AudioLevel(data: ArrayBuffer): number {
  if (data.byteLength < 2 || data.byteLength % 2 !== 0) return 0;
  const view = new DataView(data);
  let sumSquares = 0;
  const sampleCount = data.byteLength / 2;
  for (let offset = 0; offset < data.byteLength; offset += 2) {
    const normalized = view.getInt16(offset, true) / 32768;
    sumSquares += normalized * normalized;
  }
  return Math.min(1, Math.sqrt(sumSquares / sampleCount) * 2.2);
}

function readMonoFrames(data: ArrayBuffer, channels: number): Float64Array {
  if (
    data.byteLength % 2 !== 0 ||
    channels < 1 ||
    data.byteLength % (channels * 2) !== 0
  ) {
    throw new VoiceError(
      "AUDIO_FORMAT_UNSUPPORTED",
      "Native PCM16 data has an incomplete frame.",
    );
  }
  const view = new DataView(data);
  const frames = data.byteLength / 2 / channels;
  const mono = new Float64Array(frames);
  for (let frame = 0; frame < frames; frame += 1) {
    let total = 0;
    for (let channel = 0; channel < channels; channel += 1) {
      total += view.getInt16((frame * channels + channel) * 2, true);
    }
    mono[frame] = total / channels;
  }
  return mono;
}

function writePcm16(samples: readonly number[]): ArrayBuffer {
  const output = new ArrayBuffer(samples.length * 2);
  const view = new DataView(output);
  for (let index = 0; index < samples.length; index += 1) {
    const value = Math.max(-32768, Math.min(32767, Math.round(samples[index])));
    view.setInt16(index * 2, value, true);
  }
  return output;
}

/** Stateful linear PCM16 resampler. Phase is preserved across native buffer boundaries. */
export class Pcm16StreamNormalizer {
  private sourceRate: number | null = null;
  private sourceChannels: number | null = null;
  private totalInputFrames = 0;
  private nextOutputPosition = 0;
  private previousSample: number | null = null;

  constructor(private readonly targetRate = 24000) {}

  push(buffer: NativePcmBuffer): ArrayBuffer {
    if (
      !Number.isFinite(buffer.sampleRate) ||
      buffer.sampleRate <= 0 ||
      buffer.channels < 1
    ) {
      throw new VoiceError(
        "AUDIO_FORMAT_UNSUPPORTED",
        "Native stream metadata is invalid.",
      );
    }
    if (
      this.sourceRate !== null &&
      (this.sourceRate !== buffer.sampleRate ||
        this.sourceChannels !== buffer.channels)
    ) {
      throw new VoiceError(
        "AUDIO_FORMAT_UNSUPPORTED",
        "Native stream format changed during capture.",
      );
    }
    this.sourceRate = buffer.sampleRate;
    this.sourceChannels = buffer.channels;

    if (buffer.sampleRate === this.targetRate && buffer.channels === 1) {
      if (buffer.data.byteLength % 2 !== 0) {
        throw new VoiceError(
          "AUDIO_FORMAT_UNSUPPORTED",
          "Native PCM16 data has an incomplete sample.",
        );
      }
      this.totalInputFrames += buffer.data.byteLength / 2;
      this.nextOutputPosition = this.totalInputFrames;
      const view = new Uint8Array(buffer.data);
      return view.slice().buffer;
    }

    try {
      const mono = readMonoFrames(buffer.data, buffer.channels);
      if (mono.length === 0) return new ArrayBuffer(0);
      const chunkStart = this.totalInputFrames;
      const chunkEnd = chunkStart + mono.length;
      const step = buffer.sampleRate / this.targetRate;
      const output: number[] = [];

      const sampleAt = (frame: number): number => {
        if (frame === chunkStart - 1 && this.previousSample !== null)
          return this.previousSample;
        const local = Math.max(
          0,
          Math.min(mono.length - 1, frame - chunkStart),
        );
        return mono[local];
      };

      while (this.nextOutputPosition < chunkEnd) {
        const left = Math.floor(this.nextOutputPosition);
        const fraction = this.nextOutputPosition - left;
        if (left >= chunkEnd - 1 && fraction > 0) break;
        const leftValue = sampleAt(left);
        const rightValue = fraction === 0 ? leftValue : sampleAt(left + 1);
        output.push(leftValue + (rightValue - leftValue) * fraction);
        this.nextOutputPosition += step;
      }

      this.previousSample = mono[mono.length - 1];
      this.totalInputFrames = chunkEnd;
      return writePcm16(output);
    } catch (error) {
      if (error instanceof VoiceError) throw error;
      throw new VoiceError("RESAMPLE_FAILED", "PCM16 resampling failed.", {
        cause: error,
      });
    }
  }

  flush(): ArrayBuffer {
    if (this.sourceRate === null || this.previousSample === null)
      return new ArrayBuffer(0);
    const step = this.sourceRate / this.targetRate;
    const output: number[] = [];
    while (this.nextOutputPosition < this.totalInputFrames) {
      output.push(this.previousSample);
      this.nextOutputPosition += step;
    }
    return writePcm16(output);
  }
}
