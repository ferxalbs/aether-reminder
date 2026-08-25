import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type AgentEvent, type ContextSnapshot } from "@/services/agent";
import { getDatabase } from "@/db";
import { getAetherCore } from "@/core";
import type { ActionReceipt } from "@/domain/receipts";
import {
  AIProviderError,
  getAIErrorMessage,
  isRetryableAIProviderError,
  isRetryableAIProviderErrorCode,
} from "@/services/ai/providers";

import {
  AETHER_HOSTED_MODEL_ID,
  isAetherCloudConfigured,
} from "@/services/cloud";
import { reportNonFatalError } from "@/lib/nonFatalError";
import type {
  AssistantMessage,
  AssistantReceipt,
  PendingAssistantConfirmation,
} from "./assistantTypes";

interface AgentSessionControllerOptions {
  context: ContextSnapshot;
  onNavigate: (destination: string, entityId?: string) => void;
  onMutation: (toolId: string) => void;
  onReceipt: (receipt: ActionReceipt) => void;
}

interface SubmitOptions {
  appendUserMessage?: boolean;
  invocationSource?: ContextSnapshot["invocationSource"];
}

function messageId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function runStartErrorMessage(caught: unknown): string {
  if (caught instanceof AIProviderError) return getAIErrorMessage(caught);
  return "Assistant is temporarily unavailable.";
}

export function useAgentSessionController({
  context,
  onNavigate,
  onMutation,
  onReceipt,
}: AgentSessionControllerOptions) {
  const core = useMemo(() => getAetherCore(getDatabase()), []);
  const runtime = core.agent;
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [receipts, setReceipts] = useState<AssistantReceipt[]>([]);
  const [pendingConfirmation, setPendingConfirmation] =
    useState<PendingAssistantConfirmation | null>(null);
  const [semanticState, setSemanticState] = useState<
    | "idle"
    | "contextualizing"
    | "thinking"
    | "executing"
    | "waiting_confirmation"
    | "responding"
    | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [entities, setEntities] = useState<
    { type: "task" | "reminder" | "project"; id: string; label?: string }[]
  >([]);
  const sessionIdRef = useRef<string | undefined>(undefined);
  const currentRunRef = useRef<string | undefined>(undefined);
  const runningRef = useRef(false);
  const entitiesRef = useRef(entities);
  const handleEventRef = useRef<
    (event: AgentEvent, assistantMessageId: string) => void
  >(() => undefined);
  const retrySubmissionRef = useRef<{
    message: string;
    options: SubmitOptions;
  } | null>(null);
  const [canRetry, setCanRetry] = useState(false);

  const submit = useCallback(
    async (rawMessage: string, options: SubmitOptions = {}) => {
      const message = rawMessage.trim();
      if (!message || runningRef.current) return false;

      if (!isAetherCloudConfigured()) {
        setSemanticState("error");
        setError("Assistant setup is unavailable right now.");
        setCanRetry(false);
        return false;
      }

      runningRef.current = true;
      setCanRetry(false);
      retrySubmissionRef.current = null;
      const modelId = AETHER_HOSTED_MODEL_ID;

      const appendUserMessage = options.appendUserMessage !== false;
      const assistantMessageId = messageId("assistant");
      if (appendUserMessage) {
        setMessages((previous) => [
          ...previous,
          { id: messageId("user"), role: "user", text: message },
          { id: assistantMessageId, role: "assistant", text: "" },
        ]);
      } else {
        setMessages((previous) => [
          ...previous,
          { id: assistantMessageId, role: "assistant", text: "" },
        ]);
      }
      setError(null);
      setPendingConfirmation(null);
      setIsRunning(true);
      setSemanticState("contextualizing");
      retrySubmissionRef.current = {
        message,
        options: { ...options, appendUserMessage: false },
      };

      try {
        const runContext: ContextSnapshot = {
          ...context,
          invocationSource: options.invocationSource ?? "assistant",
          conversationEntities: entitiesRef.current.slice(-8),
        };
        for await (const event of runtime.run({
          message,
          context: runContext,
          sessionId: sessionIdRef.current,
          modelId,
          onNavigate,
        })) {
          handleEventRef.current(event, assistantMessageId);
        }
      } catch (caught) {
        const messageText = runStartErrorMessage(caught);
        reportNonFatalError("agent-run", caught);
        const retryable = isRetryableAIProviderError(caught);
        setCanRetry(retryable);
        if (!retryable) retrySubmissionRef.current = null;
        setMessages((previous) =>
          previous.map((item) =>
            item.id === assistantMessageId && item.text.length === 0
              ? { ...item, text: messageText }
              : item,
          ),
        );
        setSemanticState("error");
        setError(messageText);
      } finally {
        runningRef.current = false;
        setIsRunning(false);
        currentRunRef.current = undefined;
      }
      return true;
    },
    // The runtime is intentionally stable; the context is captured at send time.
    [context, onNavigate, runtime],
  );

  const handleEvent = useCallback(
    (event: AgentEvent, assistantMessageId: string) => {
      setSemanticState(event.state);
      switch (event.type) {
        case "run.started":
          sessionIdRef.current = event.sessionId;
          currentRunRef.current = event.runId;
          break;
        case "response.delta":
          setMessages((previous) =>
            previous.map((item) =>
              item.id === assistantMessageId
                ? { ...item, text: item.text + event.text }
                : item,
            ),
          );
          break;
        case "tool.completed":
          onMutation(event.toolId);
          if (event.receipt) {
            const assistantReceipt = {
              receipt: event.receipt,
              toolId: event.toolId,
            };
            setReceipts((previous) => [...previous, assistantReceipt]);
            onReceipt(event.receipt);
          }
          break;
        case "tool.confirmation_required":
          setPendingConfirmation({
            action: event.pendingAction,
            reason: event.reason,
          });
          break;
        case "tool.failed":
          setCanRetry(false);
          setError(event.error);
          break;
        case "response.completed":
          setMessages((previous) =>
            previous.map((item) =>
              item.id === assistantMessageId && item.text.length === 0
                ? { ...item, text: event.response.text }
                : item,
            ),
          );
          if (event.response.entities?.length) {
            entitiesRef.current = event.response.entities;
            setEntities(event.response.entities);
          }
          break;
        case "run.failed":
          setCanRetry(isRetryableAIProviderErrorCode(event.code));
          if (!isRetryableAIProviderErrorCode(event.code))
            retrySubmissionRef.current = null;
          setMessages((previous) =>
            previous.map((item) =>
              item.id === assistantMessageId && item.text.length === 0
                ? { ...item, text: event.message }
                : item,
            ),
          );
          setError(event.message);
          break;
        case "run.cancelled":
          setMessages((previous) =>
            previous.map((item) =>
              item.id === assistantMessageId && item.text.length === 0
                ? { ...item, text: "Run cancelled." }
                : item,
            ),
          );
          setError("Run cancelled.");
          break;
        default:
          break;
      }
    },
    [onMutation, onReceipt],
  );
  useEffect(() => {
    handleEventRef.current = handleEvent;
  }, [handleEvent]);

  const confirm = useCallback(() => {
    const pending = pendingConfirmation;
    if (!pending || runningRef.current) return;
    runningRef.current = true;
    setPendingConfirmation(null);
    setIsRunning(true);
    const assistantMessageId = messageId("assistant");
    setMessages((previous) => [
      ...previous,
      { id: assistantMessageId, role: "assistant", text: "" },
    ]);
    void (async () => {
      try {
        for await (const event of runtime.confirm(pending.action, {
          context,
          onNavigate,
        })) {
          handleEventRef.current(event, assistantMessageId);
        }
      } catch (caught) {
        const messageText = runStartErrorMessage(caught);
        reportNonFatalError("agent-confirm", caught);
        setMessages((previous) =>
          previous.map((item) =>
            item.id === assistantMessageId
              ? { ...item, text: messageText }
              : item,
          ),
        );
        setSemanticState("error");
        setError(messageText);
      } finally {
        runningRef.current = false;
        setIsRunning(false);
      }
    })();
  }, [context, onNavigate, pendingConfirmation, runtime]);

  const cancelConfirmation = useCallback(() => {
    if (pendingConfirmation) {
      void runtime
        .discard(pendingConfirmation.action)
        .catch((caught: unknown) => {
          reportNonFatalError("agent-discard", caught);
          setError("AETHER could not discard the pending action. Try again.");
        });
    }
    setPendingConfirmation(null);
    setSemanticState("idle");
    setError(null);
  }, [pendingConfirmation, runtime]);

  const cancel = useCallback(() => {
    const runId = currentRunRef.current;
    if (runId) {
      void runtime.cancel(runId).catch((caught: unknown) => {
        reportNonFatalError("agent-cancel", caught);
        setError("AETHER could not cancel the run. Try again.");
      });
    }
  }, [runtime]);

  const retry = useCallback(() => {
    const submission = retrySubmissionRef.current;
    if (!submission || runningRef.current) return;
    void submit(submission.message, submission.options);
  }, [submit]);

  return {
    messages,
    receipts,
    pendingConfirmation,
    semanticState,
    error,
    canRetry,
    isRunning,
    entities,
    submit,
    retry,
    confirm,
    cancelConfirmation,
    cancel,
  };
}
