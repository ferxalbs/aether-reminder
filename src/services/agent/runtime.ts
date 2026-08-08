import type { ActionReceipt } from "@/domain/receipts";
import { createDomainServices, type DomainServices } from "@/domain/services";
import { AgentRuntimeRepository } from "@/db/repositories/agentRuntimeRepository";
import type { SqlDatabase } from "@/db/types";
import { getLocalDateString } from "@/temporal/localCalendar";
import {
  canRunAsAgent,
  type InferenceMessage,
  type InferenceProvider,
  type InferenceUsage,
  type ModelCapabilities,
} from "@/services/ai/inference";
import { openRouterInferenceProvider } from "@/services/ai/inference/openRouterProvider";
import { AIProviderError, getAIErrorMessage } from "@/services/ai/providers";
import { evaluateToolPolicy, isWriteRisk } from "./policy";
import { AGENT_SYSTEM_PROMPT, buildContextMessage } from "./prompt";
import { defaultToolRegistry, type ToolRegistry } from "./tools";
import type { ToolExecutionContext } from "./tools/types";
import type {
  AgentBudget,
  AgentEvent,
  AgentInput,
  AgentResponse,
  AgentRuntime,
  AgentSemanticState,
  EntityReference,
} from "./types";
import { DEFAULT_AGENT_BUDGET as DEFAULT_BUDGET } from "./types";

export interface AetherAgentRuntimeOptions {
  db: SqlDatabase;
  services?: DomainServices;
  provider?: InferenceProvider;
  tools?: ToolRegistry;
  /** Override clock for tests. */
  now?: () => number;
}

type PendingToolCall = {
  toolCallId: string;
  toolId: string;
  argsText: string;
};

/**
 * Single-root AETHER Agent Runtime.
 * Event-driven; Orb (Slice 4) derives UI from AgentEvent + semantic state.
 */
export class AetherAgentRuntime implements AgentRuntime {
  private readonly services: DomainServices;
  private readonly provider: InferenceProvider;
  private readonly tools: ToolRegistry;
  private readonly persistence: AgentRuntimeRepository;
  private readonly now: () => number;
  private readonly controllers = new Map<string, AbortController>();
  private writeTail: Promise<void> = Promise.resolve();

  constructor(options: AetherAgentRuntimeOptions) {
    this.services = options.services ?? createDomainServices(options.db);
    this.provider = options.provider ?? openRouterInferenceProvider;
    this.tools = options.tools ?? defaultToolRegistry;
    this.persistence = new AgentRuntimeRepository(options.db);
    this.now = options.now ?? (() => Date.now());
  }

  async cancel(runId: string): Promise<void> {
    const controller = this.controllers.get(runId);
    if (controller) {
      controller.abort();
    }
    try {
      await this.persistence.updateRun(runId, {
        status: "cancelled",
        semanticState: "idle",
        finished: true,
      });
    } catch {
      // run may not exist yet
    }
  }

  async *run(input: AgentInput): AsyncIterable<AgentEvent> {
    const budget = resolveBudget(input.budget, this.now);
    const sessionId =
      input.sessionId ??
      (await this.persistence.createSession({
        surface: input.context.surface,
        locale: input.context.locale,
        timezone: input.context.timezone,
      }));

    const runId = await this.persistence.createRun({
      sessionId,
      modelId: input.modelId,
      invocationSource: input.context.invocationSource,
      userMessage: input.message,
      budget,
    });

    const controller = new AbortController();
    this.controllers.set(runId, controller);

    let seq = 0;
    let state: AgentSemanticState = "contextualizing";
    const receipts: ActionReceipt[] = [];
    const entities: EntityReference[] = [];
    let toolCallCount = 0;
    let modelTurns = 0;
    let usageAcc: InferenceUsage = {};

    const emit = async function* (
      this: AetherAgentRuntime,
      event: AgentEvent,
    ): AsyncGenerator<AgentEvent> {
      seq += 1;
      try {
        await this.persistence.appendEvent({
          runId,
          seq,
          type: event.type,
          payload: stripEventForStorage(event),
        });
      } catch {
        // Persistence failure should not hide the event from the consumer
      }
      yield event;
    }.bind(this);

    const setState = async function* (
      this: AetherAgentRuntime,
      next: AgentSemanticState,
    ): AsyncGenerator<AgentEvent> {
      if (next === state) return;
      const previous = state;
      state = next;
      await this.persistence.updateRun(runId, { semanticState: next });
      yield* emit({ type: "state.changed", runId, state: next, previous });
    }.bind(this);

    try {
      yield* emit({
        type: "run.started",
        runId,
        sessionId,
        modelId: input.modelId,
        state,
      });

      yield* emit({
        type: "context.ready",
        runId,
        context: input.context,
        state,
      });

      if (this.now() > budget.deadlineMs) {
        yield* setState("error");
        yield* emit({
          type: "run.failed",
          runId,
          code: "BUDGET_EXCEEDED",
          message: "Run deadline exceeded before start.",
          state: "error",
        });
        await this.persistence.updateRun(runId, {
          status: "failed",
          errorCode: "BUDGET_EXCEEDED",
          errorMessage: "Run deadline exceeded before start.",
          finished: true,
        });
        return;
      }

      let capabilities: ModelCapabilities;
      try {
        capabilities = await this.provider.getCapabilities(
          input.modelId,
          input.apiKey,
        );
      } catch (error) {
        const providerError = error instanceof AIProviderError
          ? error
          : new AIProviderError('NETWORK_ERROR', 'The OpenRouter model could not be validated.');
        const message = error instanceof AIProviderError
          ? getAIErrorMessage(error)
          : 'The OpenRouter model could not be validated.';
        yield* setState("error");
        yield* emit({
          type: "run.failed",
          runId,
          code: providerError.code,
          message,
          state: "error",
        });
        await this.persistence.updateRun(runId, {
          status: "failed",
          errorCode: providerError.code,
          errorMessage: message,
          finished: true,
        });
        return;
      }
      if (!canRunAsAgent(capabilities)) {
        yield* setState("error");
        yield* emit({
          type: "run.failed",
          runId,
          code: "INCOMPATIBLE_MODEL",
          message: `Model ${input.modelId} is ${capabilities.compatibility} and cannot operate as a full agent (tools required).`,
          state: "error",
        });
        await this.persistence.updateRun(runId, {
          status: "failed",
          errorCode: "INCOMPATIBLE_MODEL",
          errorMessage: `compatibility=${capabilities.compatibility}`,
          finished: true,
        });
        return;
      }

      const messages: InferenceMessage[] = [
        { role: "system", content: AGENT_SYSTEM_PROMPT },
        {
          role: "user",
          content: buildContextMessage({
            ...input.context,
            localDate: input.context.selectedDate ?? getLocalDateString(),
          }),
        },
        { role: "user", content: input.message },
      ];

      const inferenceTools = this.tools.toInferenceTools();
      let finalText = "";

      while (modelTurns < budget.maxModelTurns) {
        if (controller.signal.aborted) {
          yield* emit({ type: "run.cancelled", runId, state: "idle" });
          await this.persistence.updateRun(runId, {
            status: "cancelled",
            semanticState: "idle",
            finished: true,
          });
          return;
        }
        if (this.now() > budget.deadlineMs) {
          yield* setState("error");
          yield* emit({
            type: "run.failed",
            runId,
            code: "BUDGET_EXCEEDED",
            message: "Run deadline exceeded.",
            state: "error",
          });
          await this.persistence.updateRun(runId, {
            status: "failed",
            errorCode: "BUDGET_EXCEEDED",
            errorMessage: "Run deadline exceeded.",
            finished: true,
          });
          return;
        }

        modelTurns += 1;
        yield* setState("thinking");
        yield* emit({
          type: "model.started",
          runId,
          modelId: input.modelId,
          capabilities,
          state,
        });

        let turnText = "";
        const pendingTools: PendingToolCall[] = [];
        let streamFailed: { code: string; message: string } | null = null;
        let aborted = false;

        for await (const ev of this.provider.stream(
          {
            modelId: input.modelId,
            messages,
            apiKey: input.apiKey,
            tools: inferenceTools,
            toolChoice: "auto",
            maxTokens: budget.maxOutputTokens,
            temperature: 0.2,
          },
          controller.signal,
        )) {
          if (ev.type === "text.delta") {
            turnText += ev.text;
            finalText += ev.text;
            yield* setState("responding");
            yield* emit({
              type: "response.delta",
              runId,
              text: ev.text,
              state: "responding",
            });
          } else if (ev.type === "tool_call.completed") {
            pendingTools.push({
              toolCallId: ev.toolCallId,
              toolId: ev.name,
              argsText: ev.arguments,
            });
          } else if (ev.type === "stream.error") {
            streamFailed = { code: ev.error.code, message: ev.error.message };
          } else if (ev.type === "stream.aborted") {
            aborted = true;
          } else if (ev.type === "stream.completed" && ev.usage) {
            usageAcc = mergeUsage(usageAcc, ev.usage);
          }
        }

        if (aborted || controller.signal.aborted) {
          yield* emit({ type: "run.cancelled", runId, state: "idle" });
          await this.persistence.updateRun(runId, {
            status: "cancelled",
            semanticState: "idle",
            usage: usageAcc,
            finished: true,
          });
          return;
        }

        if (streamFailed) {
          yield* setState("error");
          yield* emit({
            type: "run.failed",
            runId,
            code: streamFailed.code,
            message: streamFailed.message,
            state: "error",
          });
          await this.persistence.updateRun(runId, {
            status: "failed",
            errorCode: streamFailed.code,
            errorMessage: streamFailed.message,
            usage: usageAcc,
            finished: true,
          });
          return;
        }

        if (pendingTools.length === 0) {
          // Text-only completion
          const response: AgentResponse = {
            text: finalText.trim() || turnText.trim() || "Done.",
            receipts: receipts.length ? receipts : undefined,
            entities: entities.length ? entities : undefined,
          };
          yield* emit({
            type: "response.completed",
            runId,
            response,
            state: "responding",
          });
          await this.persistence.updateRun(runId, {
            status: "completed",
            semanticState: "idle",
            usage: usageAcc,
            finished: true,
          });
          yield* setState("idle");
          return;
        }

        // Append assistant message with tool calls for multi-turn continuity
        messages.push({
          role: "assistant",
          content: turnText || null,
          tool_calls: pendingTools.map((t) => ({
            id: t.toolCallId,
            type: "function" as const,
            function: { name: t.toolId, arguments: t.argsText },
          })),
        });

        // Partition reads vs writes
        const reads: PendingToolCall[] = [];
        const writes: PendingToolCall[] = [];
        for (const call of pendingTools) {
          const tool = this.tools.get(call.toolId);
          if (!tool || isWriteRisk(tool.risk)) writes.push(call);
          else reads.push(call);
        }

        // Concurrent reads (bounded)
        const readBatches = chunk(reads, budget.maxParallelReads);
        for (const batch of readBatches) {
          if (toolCallCount + batch.length > budget.maxToolCalls) {
            yield* setState("error");
            yield* emit({
              type: "run.failed",
              runId,
              code: "BUDGET_EXCEEDED",
              message: "Max tool calls exceeded.",
              state: "error",
            });
            await this.persistence.updateRun(runId, {
              status: "failed",
              errorCode: "BUDGET_EXCEEDED",
              errorMessage: "Max tool calls exceeded.",
              finished: true,
            });
            return;
          }

          yield* setState("executing");
          const results = await Promise.all(
            batch.map((call) =>
              this.executeToolCall({
                runId,
                call,
                input,
                capabilities,
                controller,
              }),
            ),
          );

          for (const result of results) {
            toolCallCount += 1;
            for (const event of result.events) {
              yield* emit(event);
            }
            if (result.toolMessage) {
              messages.push(result.toolMessage);
            }
            if (result.receipt) receipts.push(result.receipt);
            if (result.entity) entities.push(result.entity);
            if (result.blockedOnConfirmation) {
              yield* setState("waiting_confirmation");
              await this.persistence.updateRun(runId, {
                status: "waiting_confirmation",
                semanticState: "waiting_confirmation",
              });
              return;
            }
          }
        }

        // Serialized writes
        for (const call of writes) {
          if (toolCallCount >= budget.maxToolCalls) {
            yield* setState("error");
            yield* emit({
              type: "run.failed",
              runId,
              code: "BUDGET_EXCEEDED",
              message: "Max tool calls exceeded.",
              state: "error",
            });
            await this.persistence.updateRun(runId, {
              status: "failed",
              errorCode: "BUDGET_EXCEEDED",
              errorMessage: "Max tool calls exceeded.",
              finished: true,
            });
            return;
          }

          yield* setState("executing");
          const result = await this.enqueueWrite(() =>
            this.executeToolCall({
              runId,
              call,
              input,
              capabilities,
              controller,
            }),
          );
          toolCallCount += 1;
          for (const event of result.events) {
            yield* emit(event);
          }
          if (result.toolMessage) {
            messages.push(result.toolMessage);
          }
          if (result.receipt) receipts.push(result.receipt);
          if (result.entity) entities.push(result.entity);
          if (result.blockedOnConfirmation) {
            yield* setState("waiting_confirmation");
            await this.persistence.updateRun(runId, {
              status: "waiting_confirmation",
              semanticState: "waiting_confirmation",
            });
            return;
          }
        }

        // Continue loop for model to observe tool results
        finalText = "";
      }

      yield* setState("error");
      yield* emit({
        type: "run.failed",
        runId,
        code: "BUDGET_EXCEEDED",
        message: "Max model turns exceeded.",
        state: "error",
      });
      await this.persistence.updateRun(runId, {
        status: "failed",
        errorCode: "BUDGET_EXCEEDED",
        errorMessage: "Max model turns exceeded.",
        usage: usageAcc,
        finished: true,
      });
    } catch (error) {
      const message =
        error instanceof AIProviderError
          ? getAIErrorMessage(error)
          : "Agent run failed.";
      yield* setState("error");
      yield* emit({
        type: "run.failed",
        runId,
        code: "UNKNOWN",
        message,
        state: "error",
      });
      await this.persistence.updateRun(runId, {
        status: "failed",
        errorCode: "UNKNOWN",
        errorMessage: message,
        finished: true,
      });
    } finally {
      this.controllers.delete(runId);
    }
  }

  private enqueueWrite<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.writeTail.then(fn, fn);
    this.writeTail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async executeToolCall(options: {
    runId: string;
    call: PendingToolCall;
    input: AgentInput;
    capabilities: ModelCapabilities;
    controller: AbortController;
  }): Promise<{
    events: AgentEvent[];
    toolMessage?: InferenceMessage;
    receipt?: ActionReceipt;
    entity?: EntityReference;
    blockedOnConfirmation?: boolean;
  }> {
    const { runId, call, input } = options;
    const events: AgentEvent[] = [];
    const tool = this.tools.get(call.toolId);

    if (!tool) {
      const err = `Unknown tool: ${call.toolId}`;
      events.push({
        type: "tool.failed",
        runId,
        toolCallId: call.toolCallId,
        toolId: call.toolId,
        error: err,
        state: "executing",
      });
      return {
        events,
        toolMessage: {
          role: "tool",
          tool_call_id: call.toolCallId,
          content: JSON.stringify({ ok: false, error: err }),
        },
      };
    }

    let args: unknown;
    try {
      args = call.argsText ? JSON.parse(call.argsText) : {};
      if (args === null || typeof args !== "object" || Array.isArray(args)) {
        throw new Error("Tool arguments must be a JSON object");
      }
    } catch (e) {
      const err = e instanceof Error ? e.message : "Malformed tool arguments";
      events.push({
        type: "tool.proposed",
        runId,
        toolCallId: call.toolCallId,
        toolId: call.toolId,
        args: call.argsText,
        risk: tool.risk,
        state: "executing",
      });
      events.push({
        type: "tool.failed",
        runId,
        toolCallId: call.toolCallId,
        toolId: call.toolId,
        error: err,
        state: "executing",
      });
      return {
        events,
        toolMessage: {
          role: "tool",
          tool_call_id: call.toolCallId,
          content: JSON.stringify({ ok: false, error: err }),
        },
      };
    }

    const ctx: ToolExecutionContext = {
      services: this.services,
      context: input.context,
      runId,
      eventSource: "agent",
      onNavigate: input.onNavigate,
    };

    let affectedCount = 1;
    if (tool.estimateAffectedCount) {
      affectedCount = await tool.estimateAffectedCount(args, ctx);
    }

    // Force bulk risk when delete-all style counts exceed threshold
    let risk = tool.risk;
    if (affectedCount > 3 && isWriteRisk(risk)) {
      risk = "BULK_MUTATION";
    }

    events.push({
      type: "tool.proposed",
      runId,
      toolCallId: call.toolCallId,
      toolId: call.toolId,
      args,
      risk,
      state: "executing",
    });

    const policy = evaluateToolPolicy({
      risk,
      affectedCount,
      toolId: call.toolId,
    });
    const begin = await this.persistence.beginToolExecution({
      runId,
      toolCallId: call.toolCallId,
      toolId: call.toolId,
      args,
      risk,
      policyDecision: policy.decision,
    });

    // Idempotent replay — never re-mutate
    if (begin.kind === "replay") {
      const row = begin.row;
      if (row.status === "completed" && row.result_json) {
        const result = JSON.parse(row.result_json) as unknown;
        events.push({
          type: "tool.completed",
          runId,
          toolCallId: call.toolCallId,
          toolId: call.toolId,
          result,
          state: "executing",
        });
        return {
          events,
          toolMessage: {
            role: "tool",
            tool_call_id: call.toolCallId,
            content: JSON.stringify(result),
          },
        };
      }
      if (row.status === "failed") {
        const err = row.error_message ?? "Previous tool execution failed";
        events.push({
          type: "tool.failed",
          runId,
          toolCallId: call.toolCallId,
          toolId: call.toolId,
          error: err,
          state: "executing",
        });
        return {
          events,
          toolMessage: {
            role: "tool",
            tool_call_id: call.toolCallId,
            content: JSON.stringify({ ok: false, error: err }),
          },
        };
      }
    }

    const executionId =
      begin.kind === "fresh" ? begin.executionId : begin.row.id;

    if (policy.decision === "deny") {
      await this.persistence.updateToolExecution(executionId, {
        status: "skipped",
        policyDecision: "deny",
        errorMessage: policy.reason,
        finished: true,
      });
      events.push({
        type: "tool.failed",
        runId,
        toolCallId: call.toolCallId,
        toolId: call.toolId,
        error: policy.reason,
        state: "executing",
      });
      return {
        events,
        toolMessage: {
          role: "tool",
          tool_call_id: call.toolCallId,
          content: JSON.stringify({ ok: false, error: policy.reason }),
        },
      };
    }

    if (policy.decision === "require_confirmation") {
      const approved =
        input.confirmations?.approveAll === true ||
        input.confirmations?.approvedToolCallIds?.includes(call.toolCallId) ===
          true;

      if (!approved) {
        await this.persistence.updateToolExecution(executionId, {
          status: "awaiting_confirmation",
          policyDecision: "require_confirmation",
        });
        events.push({
          type: "tool.confirmation_required",
          runId,
          toolCallId: call.toolCallId,
          toolId: call.toolId,
          args,
          risk: policy.risk,
          reason: policy.reason,
          state: "waiting_confirmation",
        });
        return { events, blockedOnConfirmation: true };
      }
    }

    events.push({
      type: "tool.started",
      runId,
      toolCallId: call.toolCallId,
      toolId: call.toolId,
      state: "executing",
    });

    await this.persistence.updateToolExecution(executionId, {
      status: "running",
      started: true,
    });

    try {
      const result = await tool.execute(args, ctx);
      if (!result.ok) {
        await this.persistence.updateToolExecution(executionId, {
          status: "failed",
          errorMessage: result.error ?? "Tool failed",
          finished: true,
        });
        events.push({
          type: "tool.failed",
          runId,
          toolCallId: call.toolCallId,
          toolId: call.toolId,
          error: result.error ?? "Tool failed",
          state: "executing",
        });
        return {
          events,
          toolMessage: {
            role: "tool",
            tool_call_id: call.toolCallId,
            content: JSON.stringify({ ok: false, error: result.error }),
          },
        };
      }

      const payload = {
        ok: true,
        data: result.data,
        receiptId: result.receipt?.id,
      };
      await this.persistence.updateToolExecution(executionId, {
        status: "completed",
        result: payload,
        finished: true,
      });
      events.push({
        type: "tool.completed",
        runId,
        toolCallId: call.toolCallId,
        toolId: call.toolId,
        result: payload,
        receipt: result.receipt,
        state: "executing",
      });

      let entity: EntityReference | undefined;
      if (
        result.data &&
        typeof result.data === "object" &&
        result.data !== null
      ) {
        const data = result.data as Record<string, unknown>;
        if (data.task && typeof data.task === "object" && data.task !== null) {
          const task = data.task as { id?: string; title?: string };
          if (task.id) {
            entity = { type: "task", id: task.id, label: task.title };
          }
        }
      }

      return {
        events,
        toolMessage: {
          role: "tool",
          tool_call_id: call.toolCallId,
          content: JSON.stringify(payload),
        },
        receipt: result.receipt,
        entity,
      };
    } catch (e) {
      const err = e instanceof Error ? e.message : "Tool execution failed";
      await this.persistence.updateToolExecution(executionId, {
        status: "failed",
        errorMessage: err,
        finished: true,
      });
      events.push({
        type: "tool.failed",
        runId,
        toolCallId: call.toolCallId,
        toolId: call.toolId,
        error: err,
        state: "executing",
      });
      return {
        events,
        toolMessage: {
          role: "tool",
          tool_call_id: call.toolCallId,
          content: JSON.stringify({ ok: false, error: err }),
        },
      };
    }
  }
}

function resolveBudget(
  partial: Partial<AgentBudget> | undefined,
  now: () => number,
): AgentBudget {
  return {
    maxModelTurns: partial?.maxModelTurns ?? DEFAULT_BUDGET.maxModelTurns,
    maxToolCalls: partial?.maxToolCalls ?? DEFAULT_BUDGET.maxToolCalls,
    maxParallelReads:
      partial?.maxParallelReads ?? DEFAULT_BUDGET.maxParallelReads,
    maxOutputTokens: partial?.maxOutputTokens ?? DEFAULT_BUDGET.maxOutputTokens,
    deadlineMs:
      partial?.deadlineMs && partial.deadlineMs > 0
        ? partial.deadlineMs
        : now() + 60_000,
  };
}

function mergeUsage(a: InferenceUsage, b: InferenceUsage): InferenceUsage {
  return {
    promptTokens: (a.promptTokens ?? 0) + (b.promptTokens ?? 0) || undefined,
    completionTokens:
      (a.completionTokens ?? 0) + (b.completionTokens ?? 0) || undefined,
    totalTokens: (a.totalTokens ?? 0) + (b.totalTokens ?? 0) || undefined,
    cost: (a.cost ?? 0) + (b.cost ?? 0) || undefined,
  };
}

function chunk<T>(arr: T[], size: number): T[][] {
  if (size <= 0) return [arr];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

function stripEventForStorage(event: AgentEvent): unknown {
  // Avoid persisting huge text deltas repeatedly — store type-specific minimal payload
  switch (event.type) {
    case "response.delta":
      return { textLength: event.text.length };
    case "context.ready":
      return {
        surface: event.context.surface,
        invocationSource: event.context.invocationSource,
        selectedTaskId: event.context.selectedTaskId,
        selectedDate: event.context.selectedDate,
      };
    case "model.started":
      return {
        modelId: event.modelId,
        compatibility: event.capabilities.compatibility,
      };
    case "tool.proposed":
    case "tool.confirmation_required":
      return {
        toolCallId: event.toolCallId,
        toolId: event.toolId,
        risk: event.risk,
      };
    case "tool.completed":
      return { toolCallId: event.toolCallId, toolId: event.toolId, ok: true };
    case "tool.failed":
      return {
        toolCallId: event.toolCallId,
        toolId: event.toolId,
        error: event.error,
      };
    case "run.failed":
      return { code: event.code, message: event.message };
    case "response.completed":
      return {
        textLength: event.response.text.length,
        receiptCount: event.response.receipts?.length ?? 0,
      };
    default:
      return { type: event.type };
  }
}

export function createAgentRuntime(
  options: AetherAgentRuntimeOptions,
): AetherAgentRuntime {
  return new AetherAgentRuntime(options);
}
