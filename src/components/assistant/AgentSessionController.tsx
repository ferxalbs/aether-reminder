import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchAvailableModels } from '@/services/ai/openrouter';
import { createAgentRuntime, type AgentEvent, type ContextSnapshot } from '@/services/agent';
import { getDatabase } from '@/db';
import type { ActionReceipt } from '@/domain/receipts';
import { useSettingsStore } from '@/stores/settings.store';
import type {
  AssistantMessage,
  AssistantReceipt,
  PendingAssistantConfirmation,
} from './assistantTypes';

interface AgentSessionControllerOptions {
  context: ContextSnapshot;
  onNavigate: (destination: string, entityId?: string) => void;
  onMutation: (toolId: string) => void;
  onReceipt: (receipt: ActionReceipt) => void;
}

interface SubmitOptions {
  approveAll?: boolean;
  appendUserMessage?: boolean;
  invocationSource?: ContextSnapshot['invocationSource'];
}

function messageId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function resolveAgentModel(selectedModel: string, apiKey: string): Promise<string> {
  if (selectedModel.trim()) return selectedModel.trim();
  const models = await fetchAvailableModels(apiKey);
  const agentModel = models.find(
    (model) =>
      model.availability === 'available' &&
      (model.compatibility === 'FULL_AGENT' || model.compatibility === 'AGENT')
  );
  if (!agentModel) {
    throw new Error('Choose a streaming tool-capable model in Settings before asking AETHER.');
  }
  return agentModel.id;
}

export function useAgentSessionController({
  context,
  onNavigate,
  onMutation,
  onReceipt,
}: AgentSessionControllerOptions) {
  const apiKey = useSettingsStore((state) => state.openRouterApiKey);
  const apiKeyLoaded = useSettingsStore((state) => state.apiKeyLoaded);
  const selectedModel = useSettingsStore((state) => state.selectedModel);
  const runtime = useMemo(() => createAgentRuntime({ db: getDatabase() }), []);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [receipts, setReceipts] = useState<AssistantReceipt[]>([]);
  const [pendingConfirmation, setPendingConfirmation] =
    useState<PendingAssistantConfirmation | null>(null);
  const [semanticState, setSemanticState] = useState<
    'idle' | 'contextualizing' | 'thinking' | 'executing' | 'waiting_confirmation' | 'responding' | 'error'
  >('idle');
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [entities, setEntities] = useState<{ type: 'task' | 'reminder' | 'project'; id: string; label?: string }[]>([]);
  const sessionIdRef = useRef<string | undefined>(undefined);
  const currentRunRef = useRef<string | undefined>(undefined);
  const lastRequestRef = useRef<string | undefined>(undefined);
  const entitiesRef = useRef(entities);
  const handleEventRef = useRef<(event: AgentEvent, assistantMessageId: string) => void>(() => undefined);

  const submit = useCallback(
    async (rawMessage: string, options: SubmitOptions = {}) => {
      const message = rawMessage.trim();
      if (!message || isRunning) return;
      if (!apiKeyLoaded) {
        setError('Secure storage is still loading. Try again in a moment.');
        return;
      }
      if (!apiKey) {
        setError('Add an OpenRouter API key in Settings to ask AETHER.');
        return;
      }

      const appendUserMessage = options.appendUserMessage !== false;
      const assistantMessageId = messageId('assistant');
      if (appendUserMessage) {
        setMessages((previous) => [
          ...previous,
          { id: messageId('user'), role: 'user', text: message },
          { id: assistantMessageId, role: 'assistant', text: '' },
        ]);
      } else {
        setMessages((previous) => [
          ...previous,
          { id: assistantMessageId, role: 'assistant', text: '' },
        ]);
      }
      setError(null);
      setPendingConfirmation(null);
      setIsRunning(true);
      setSemanticState('contextualizing');
      lastRequestRef.current = message;

      try {
        const modelId = await resolveAgentModel(selectedModel, apiKey);
        const runContext: ContextSnapshot = {
          ...context,
          invocationSource: options.invocationSource ?? 'assistant',
          conversationEntities: entitiesRef.current.slice(-8),
        };
        for await (const event of runtime.run({
          message,
          context: runContext,
          sessionId: sessionIdRef.current,
          modelId,
          apiKey,
          onNavigate,
          confirmations: options.approveAll ? { approveAll: true } : undefined,
        })) {
          handleEventRef.current(event, assistantMessageId);
        }
      } catch (caught) {
        const messageText = caught instanceof Error ? caught.message : 'AETHER could not start this run.';
        setSemanticState('error');
        setError(messageText);
      } finally {
        setIsRunning(false);
        currentRunRef.current = undefined;
      }
    },
    // The runtime is intentionally stable; the context is captured at send time.
    [apiKey, apiKeyLoaded, context, isRunning, onNavigate, runtime, selectedModel]
  );

  const handleEvent = useCallback(
    (event: AgentEvent, assistantMessageId: string) => {
      setSemanticState(event.state);
      switch (event.type) {
        case 'run.started':
          sessionIdRef.current = event.sessionId;
          currentRunRef.current = event.runId;
          break;
        case 'response.delta':
          setMessages((previous) =>
            previous.map((item) =>
              item.id === assistantMessageId ? { ...item, text: item.text + event.text } : item
            )
          );
          break;
        case 'tool.completed':
          onMutation(event.toolId);
          if (event.receipt) {
            const assistantReceipt = { receipt: event.receipt, toolId: event.toolId };
            setReceipts((previous) => [...previous, assistantReceipt]);
            onReceipt(event.receipt);
          }
          break;
        case 'tool.confirmation_required':
          setPendingConfirmation({
            toolCallId: event.toolCallId,
            toolId: event.toolId,
            args: event.args,
            reason: event.reason,
          });
          break;
        case 'tool.failed':
          setError(event.error);
          break;
        case 'response.completed':
          setMessages((previous) =>
            previous.map((item) =>
              item.id === assistantMessageId && item.text.length === 0
                ? { ...item, text: event.response.text }
                : item
            )
          );
          if (event.response.entities?.length) {
            entitiesRef.current = event.response.entities;
            setEntities(event.response.entities);
          }
          break;
        case 'run.failed':
          setError(event.message);
          break;
        case 'run.cancelled':
          setError('Run cancelled.');
          break;
        default:
          break;
      }
    },
    [onMutation, onReceipt]
  );
  useEffect(() => {
    handleEventRef.current = handleEvent;
  }, [handleEvent]);

  const confirm = useCallback(() => {
    const request = lastRequestRef.current;
    if (!request || isRunning) return;
    void submit(request, { approveAll: true, appendUserMessage: false });
  }, [isRunning, submit]);

  const cancelConfirmation = useCallback(() => {
    setPendingConfirmation(null);
    setSemanticState('idle');
    setError(null);
  }, []);

  const cancel = useCallback(() => {
    const runId = currentRunRef.current;
    if (runId) void runtime.cancel(runId);
  }, [runtime]);

  return {
    messages,
    receipts,
    pendingConfirmation,
    semanticState,
    error,
    isRunning,
    entities,
    submit,
    confirm,
    cancelConfirmation,
    cancel,
  };
}
