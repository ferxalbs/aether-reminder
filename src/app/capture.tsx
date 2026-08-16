import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { Typography } from "@/components/ui/Typography";
import { useTasksUiStore } from "@/stores/tasksUi.store";
import { Colors, LayoutTokens, Radius, Spacing } from "@/theme/tokens";
import { useIsDark } from "@/theme/useResolvedTheme";
import {
  CaptureError,
  clearPendingNativeCaptureId,
  createCaptureEnvelope,
  createCaptureOrchestrator,
  discardNativeCaptureAssets,
  getPendingNativeCaptureId,
  getPendingNativeLaunchIngress,
  initializeCaptureInbox,
  type CaptureDraft,
  type CaptureEnvelope,
} from "@/services/capture";
import type { CaptureSource } from "@/domain/entities";
import { getDatabaseErrorMessage } from "@/db/errors";
import { reportNonFatalError } from "@/lib/nonFatalError";

function sourcesFrom(envelope: CaptureEnvelope): CaptureSource[] {
  const sources: CaptureSource[] = [];
  for (const part of envelope.parts) {
    if (part.kind === "url") sources.push({ kind: "url", url: part.url });
    if (part.kind === "image") sources.push({ ...part });
  }
  return sources;
}

export default function CaptureRoute() {
  const isDark = useIsDark();
  const insets = useSafeAreaInsets();
  const [envelope, setEnvelope] = useState<CaptureEnvelope | null>(null);
  const [draft, setDraft] = useState<CaptureDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshAllSurfaces = useTasksUiStore(
    (state) => state.refreshAllSurfaces,
  );
  const refreshAttention = useTasksUiStore((state) => state.refreshAttention);
  const background = isDark ? Colors.backgroundDark : Colors.backgroundLight;
  const secondary = isDark
    ? Colors.secondaryTextDark
    : Colors.secondaryTextLight;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const captureId = getPendingNativeCaptureId();
        const inbox = await initializeCaptureInbox();
        const external = captureId ? await inbox.get(captureId) : null;
        const nextEnvelope =
          external ??
          createCaptureEnvelope({
            ingress: getPendingNativeLaunchIngress(),
            parts: [{ kind: "text", text: "New reminder" }],
            reviewRequired: true,
          });
        const orchestrator = await createCaptureOrchestrator();
        let nextDraft: CaptureDraft;
        try {
          nextDraft = orchestrator.prepare(nextEnvelope);
          if (!external) nextDraft.title = "";
        } catch (cause) {
          if (
            !(cause instanceof CaptureError) ||
            cause.category !== "domain_validation"
          )
            throw cause;
          nextDraft = {
            title: "",
            priority: "medium",
            sources: sourcesFrom(nextEnvelope),
          };
        }
        if (!cancelled) {
          setEnvelope(nextEnvelope);
          setDraft(nextDraft);
        }
      } catch (cause) {
        reportNonFatalError("capture-route-load", cause);
        if (!cancelled) setError(getDatabaseErrorMessage(cause));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const image = useMemo(
    () =>
      draft?.sources.find(
        (source): source is Extract<CaptureSource, { kind: "image" }> =>
          source.kind === "image",
      ),
    [draft?.sources],
  );
  const url = useMemo(
    () =>
      draft?.sources.find(
        (source): source is Extract<CaptureSource, { kind: "url" }> =>
          source.kind === "url",
      ),
    [draft?.sources],
  );

  const save = useCallback(async () => {
    if (!envelope || !draft || !draft.title.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const inbox = await initializeCaptureInbox();
      const orchestrator = await createCaptureOrchestrator({
        persistEvents: true,
        invalidations: {
          async taskCommitted() {
            await Promise.all([refreshAllSurfaces(), refreshAttention()]);
          },
        },
      });
      const stored = await inbox.get(envelope.id);
      if (stored) {
        await inbox.markReviewed(stored.id);
        const claimed = await inbox.claim(stored.id);
        if (!claimed)
          throw new CaptureError(
            "database_busy",
            "This capture is already being processed.",
            true,
          );
        try {
          const result = await orchestrator.commit(
            { ...claimed.envelope, reviewRequired: false },
            draft,
          );
          await inbox.markCommitted(
            stored.id,
            claimed.claimToken,
            result.task.id,
          );
        } catch (cause) {
          const category =
            cause instanceof CaptureError ? cause.category : "unknown";
          const retryable =
            cause instanceof CaptureError ? cause.retryable : true;
          await inbox.markFailure(
            stored.id,
            claimed.claimToken,
            category,
            retryable,
          );
          throw cause;
        }
        clearPendingNativeCaptureId(stored.id);
      } else {
        await orchestrator.commit(envelope, draft);
      }
      router.replace("/");
    } catch (cause) {
      reportNonFatalError("capture-route-save", cause);
      setError(
        cause instanceof Error ? cause.message : "Capture could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }, [draft, envelope, refreshAllSurfaces, refreshAttention, saving]);

  const discard = useCallback(() => {
    if (!envelope) return;
    void (async () => {
      const inbox = await initializeCaptureInbox();
      if (await inbox.get(envelope.id)) await inbox.discard(envelope.id);
      await discardNativeCaptureAssets(envelope.id);
      clearPendingNativeCaptureId(envelope.id);
      router.replace("/");
    })().catch((cause: unknown) => {
      reportNonFatalError("capture-route-discard", cause);
      setError("Capture could not be discarded safely.");
    });
  }, [envelope]);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={[styles.root, { backgroundColor: background }]}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingTop: insets.top + Spacing.xl,
            paddingBottom: insets.bottom + Spacing.xl,
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.content}>
          <Typography variant="headline" accessibilityRole="header">
            Add to AETHER
          </Typography>
          <Typography variant="body" color={secondary}>
            Review the capture, then add one reminder.
          </Typography>

          {loading ? (
            <ActivityIndicator accessibilityLabel="Loading capture" />
          ) : null}
          {image ? (
            <Image
              source={{ uri: image.assetRef }}
              contentFit="contain"
              accessibilityLabel={
                image.displayName
                  ? `Shared image: ${image.displayName}`
                  : "Shared image preview"
              }
              style={[
                styles.image,
                {
                  backgroundColor: isDark
                    ? Colors.surfaceRaisedDark
                    : Colors.surfaceRaisedLight,
                },
              ]}
            />
          ) : null}
          {url ? (
            <Typography
              selectable
              variant="caption"
              color={secondary}
              numberOfLines={3}
            >
              {url.url}
            </Typography>
          ) : null}
          {draft ? (
            <TextField
              label={image ? "What should AETHER remember?" : "Reminder"}
              value={draft.title}
              onChangeText={(title) =>
                setDraft((current) =>
                  current ? { ...current, title } : current,
                )
              }
              autoFocus
              returnKeyType="done"
              onSubmitEditing={() => {
                void save();
              }}
              error={error ?? undefined}
              accessibilityHint="Edit the reminder title before saving"
            />
          ) : error ? (
            <Typography accessibilityRole="alert" color={secondary}>
              {error}
            </Typography>
          ) : null}
          {draft?.dueDate ? (
            <Typography variant="caption" color={secondary}>
              {draft.dueDate}
              {draft.dueTime ? ` · ${draft.dueTime}` : ""}
            </Typography>
          ) : null}
          <View style={styles.actions}>
            <Button
              label="Add reminder"
              onPress={() => {
                void save();
              }}
              loading={saving}
              disabled={!draft?.title.trim() || loading}
              fullWidth
            />
            <Button
              label="Cancel"
              onPress={discard}
              variant="ghost"
              disabled={saving}
              fullWidth
            />
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: Spacing.lg,
    justifyContent: "center",
  },
  content: {
    width: "100%",
    maxWidth: LayoutTokens.navigationMaxWidth,
    alignSelf: "center",
    gap: Spacing.lg,
  },
  image: { width: "100%", aspectRatio: 16 / 10, borderRadius: Radius.lg },
  actions: { gap: Spacing.sm, marginTop: Spacing.sm },
});
