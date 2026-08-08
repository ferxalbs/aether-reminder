import type {
  InferenceProvider,
  InferenceRequest,
  ModelCapabilities,
  ModelEvent,
} from '@/services/ai/inference/types';

/**
 * Deterministic inference provider for agent conformance tests.
 * No timers used to fake streaming success — real async iteration.
 */
export class ScriptedInferenceProvider implements InferenceProvider {
  readonly id = 'scripted';
  private turnIndex = 0;
  private capabilities: ModelCapabilities;
  private turns: ((req: InferenceRequest, signal: AbortSignal) => AsyncIterable<ModelEvent>)[];

  constructor(options?: {
    capabilities?: Partial<ModelCapabilities>;
    turns?: ((req: InferenceRequest, signal: AbortSignal) => AsyncIterable<ModelEvent>)[];
  }) {
    this.capabilities = {
      textInput: true,
      textOutput: true,
      streaming: true,
      tools: true,
      toolChoice: true,
      structuredOutputs: true,
      compatibility: 'FULL_AGENT',
      ...options?.capabilities,
    };
    this.turns = options?.turns ?? [];
  }

  reset(): void {
    this.turnIndex = 0;
  }

  setTurns(
    turns: ((req: InferenceRequest, signal: AbortSignal) => AsyncIterable<ModelEvent>)[]
  ): void {
    this.turns = turns;
    this.turnIndex = 0;
  }

  pushTextTurn(text: string): void {
    this.turns.push(async function* () {
      yield { type: 'stream.started', modelId: 'scripted' };
      for (const ch of text.match(/.{1,8}/g) ?? [text]) {
        yield { type: 'text.delta', text: ch };
      }
      yield { type: 'stream.completed', finishReason: 'stop', usage: { totalTokens: 10 } };
    });
  }

  pushToolTurn(
    tools: { id: string; name: string; arguments: object | string }[],
    text = ''
  ): void {
    this.turns.push(async function* () {
      yield { type: 'stream.started', modelId: 'scripted' };
      if (text) yield { type: 'text.delta', text };
      for (const [index, t] of tools.entries()) {
        const args = typeof t.arguments === 'string' ? t.arguments : JSON.stringify(t.arguments);
        yield {
          type: 'tool_call.delta',
          toolCallId: t.id,
          index,
          name: t.name,
          argumentsDelta: args,
        };
        yield {
          type: 'tool_call.completed',
          toolCallId: t.id,
          index,
          name: t.name,
          arguments: args,
        };
      }
      yield { type: 'stream.completed', finishReason: 'tool_calls' };
    });
  }

  pushErrorTurn(code: string, message: string): void {
    this.turns.push(async function* () {
      yield { type: 'stream.started', modelId: 'scripted' };
      yield { type: 'stream.error', error: { code, message } };
    });
  }

  pushHangTurn(): void {
    this.turns.push(async function* (_req, signal) {
      yield { type: 'stream.started', modelId: 'scripted' };
      yield { type: 'text.delta', text: 'partial…' };
      await new Promise<void>((resolve) => {
        if (signal.aborted) {
          resolve();
          return;
        }
        signal.addEventListener('abort', () => resolve(), { once: true });
      });
      yield { type: 'stream.aborted' };
    });
  }

  async getCapabilities(): Promise<ModelCapabilities> {
    return this.capabilities;
  }

  async *stream(request: InferenceRequest, signal: AbortSignal): AsyncIterable<ModelEvent> {
    const turn = this.turns[this.turnIndex++];
    if (!turn) {
      yield { type: 'stream.started', modelId: request.modelId };
      yield { type: 'text.delta', text: 'No more scripted turns.' };
      yield { type: 'stream.completed', finishReason: 'stop' };
      return;
    }
    yield* turn(request, signal);
  }
}
