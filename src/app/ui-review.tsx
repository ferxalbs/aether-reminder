import { useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Plus, Trash2, X } from 'lucide-react-native';
import type { TaskListItem } from '@/domain/entities';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { IconButton } from '@/components/ui/IconButton';
import { Picker } from '@/components/ui/Picker';
import { Sheet } from '@/components/ui/Sheet';
import { TaskCard } from '@/components/ui/TaskCard';
import { TextField } from '@/components/ui/TextField';
import { Typography } from '@/components/ui/Typography';
import { Colors, getMinimumTouchTarget, Radius, Spacing } from '@/theme/tokens';
import { useIsDark } from '@/theme/useResolvedTheme';

const initialTask: TaskListItem = {
  id: 'ui-review-task',
  title: 'Inspect the unified controls',
  notes: 'The checkbox and delete action show the shared touch-target floor.',
  completed: false,
  createdAt: '2026-08-08T00:00:00.000Z',
  priority: 'medium',
};

export default function UIReviewScreen() {
  const isDark = useIsDark();
  const [task, setTask] = useState(initialTask);
  const [title, setTitle] = useState('AETHER review');
  const [mode, setMode] = useState('system');
  const [sheetVisible, setSheetVisible] = useState(false);

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: isDark ? Colors.black : Colors.zinc50 }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Typography variant="display">UI review</Typography>
          <Typography variant="body" color={Colors.zinc500}>
            {Platform.OS} · minimum interactive target {getMinimumTouchTarget(Platform.OS)}dp
          </Typography>
        </View>

        <Card variant="glass" style={styles.surface}>
          <Typography variant="title">New shared primitives</Typography>
          <TextField
            label="Task title"
            value={title}
            onChangeText={setTitle}
            helperText="Label, focus state, and Dynamic Type are owned by the field."
          />
          <Picker
            label="Appearance preference"
            value={mode}
            onValueChange={setMode}
            options={[
              { value: 'dark', label: 'Dark' },
              { value: 'light', label: 'Light' },
              { value: 'system', label: 'System' },
            ]}
          />
          <Button label="Open shared sheet" onPress={() => setSheetVisible(true)} />
        </Card>

        <Card variant="glass" style={styles.surface}>
          <View style={styles.row}>
            <View style={styles.copy}>
              <Typography variant="title">Resized existing controls</Typography>
              <Typography variant="caption" color={Colors.zinc500}>
                IconButton size=36 is clamped to the platform minimum.
              </Typography>
            </View>
            <IconButton
              icon={<Plus size={18} color={isDark ? Colors.white : Colors.black} />}
              onPress={() => undefined}
              accessibilityLabel="Preview add action"
              size={36}
              variant="glass"
            />
          </View>
          <TaskCard
            task={task}
            onToggle={() => setTask((current) => ({ ...current, completed: !current.completed }))}
            onDelete={() => undefined}
          />
        </Card>
      </ScrollView>

      <Sheet
        visible={sheetVisible}
        onRequestClose={() => setSheetVisible(false)}
        title="Shared sheet"
        subtitle="Native iOS page sheet; Android elevated bottom surface."
        headerAction={(
          <IconButton
            icon={<X size={18} color={isDark ? Colors.zinc300 : Colors.zinc600} />}
            onPress={() => setSheetVisible(false)}
            accessibilityLabel="Close shared sheet"
            size={36}
            variant="ghost"
          />
        )}
        footer={<Button label="Done" onPress={() => setSheetVisible(false)} fullWidth />}
      >
        <View style={styles.sheetCopy}>
          <Typography variant="body">
            This checkpoint intentionally does not change any production screen. Review this surface, then visit Home and Tasks to inspect their existing 36dp controls after the shared touch-target changes.
          </Typography>
          <View style={[styles.sheetCallout, { backgroundColor: isDark ? Colors.zinc900 : Colors.zinc100 }]}>
            <Trash2 size={18} color={isDark ? Colors.white : Colors.black} />
            <Typography variant="caption" style={styles.copy}>
              Delete actions use the same IconButton contract everywhere.
            </Typography>
          </View>
        </View>
      </Sheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    padding: Spacing.md,
    paddingBottom: Spacing.huge,
    gap: Spacing.lg,
  },
  header: {
    gap: Spacing.xs,
  },
  surface: {
    gap: Spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  copy: {
    flex: 1,
  },
  sheetCopy: {
    paddingHorizontal: Spacing.md,
    gap: Spacing.md,
  },
  sheetCallout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.zinc100,
  },
});
