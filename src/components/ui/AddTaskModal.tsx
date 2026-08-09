import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { X, Flag, Sparkles } from 'lucide-react-native';
import { TaskPriority } from '@/types';
import { Colors, Spacing } from '@/theme/tokens';
import { useIsDark } from '@/theme/useResolvedTheme';
import { getLocalDateString } from '@/temporal/localCalendar';
import { Typography } from './Typography';
import { Button } from './Button';
import { IconButton } from './IconButton';
import { Picker } from './Picker';
import { Sheet } from './Sheet';
import { TextField } from './TextField';
import { useTasksUiStore } from '@/stores/tasksUi.store';
import { runTaskMutation } from '@/lib/taskMutation';

export interface AddTaskModalProps {
  visible: boolean;
  onClose: () => void;
  initialTitle?: string;
}

export const AddTaskModal: React.FC<AddTaskModalProps> = ({
  visible,
  onClose,
  initialTitle = '',
}) => {
  const [title, setTitle] = useState(initialTitle);
  const [notes, setNotes] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const isDark = useIsDark();
  const createTask = useTasksUiStore((s) => s.createTask);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSave = () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    setSaveError(null);
    void runTaskMutation(
      () => createTask({
        title: title.trim(),
        notes: notes.trim() || undefined,
        priority,
        dueDate: getLocalDateString(),
        source: 'manual',
      }),
      'task-create',
      setSaveError,
    )
      .then((result) => {
        if (!result.ok) return;
        setTitle('');
        setNotes('');
        setPriority('medium');
        onClose();
      })
      .finally(() => {
        setSaving(false);
      });
  };

  return (
    <Sheet
      visible={visible}
      onRequestClose={onClose}
      title="New Reminder"
      subtitle="Capture the next step while it is fresh."
      accessibilityLabel="New task"
      headerAction={(
        <IconButton
          icon={<X size={18} color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight} />}
          onPress={onClose}
          accessibilityLabel="Close new task dialog"
          variant="ghost"
        />
      )}
      footer={(
        <Button
          label="Add Reminder"
          onPress={handleSave}
          variant="primary"
          fullWidth
          loading={saving}
          disabled={!title.trim() || saving}
        />
      )}
    >
      <View style={styles.content}>
        <View style={styles.intro}>
          <Sparkles size={18} color={isDark ? Colors.brandCyan : Colors.brandBlue} />
          <Typography variant="caption" color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight} style={styles.introCopy}>
            Tasks are saved locally and scheduled for today.
          </Typography>
        </View>
        <TextField
          label="Task title"
          value={title}
          onChangeText={(value) => {
            setTitle(value);
            if (saveError) setSaveError(null);
          }}
          placeholder="What needs to be done?"
          autoFocus
          error={saveError ?? undefined}
        />
        <TextField
          label="Notes"
          value={notes}
          onChangeText={setNotes}
          placeholder="Add details, links, or notes…"
          multiline
          numberOfLines={3}
          leading={<Flag size={16} color={isDark ? Colors.secondaryTextDark : Colors.secondaryTextLight} />}
        />
        <Picker<TaskPriority>
          label="Priority level"
          value={priority}
          onValueChange={setPriority}
          options={[
            { value: 'low', label: 'Low' },
            { value: 'medium', label: 'Medium' },
            { value: 'high', label: 'High' },
          ]}
        />

      </View>
    </Sheet>
  );
};

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Spacing.md,
    gap: Spacing.md,
  },
  intro: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  introCopy: { flex: 1 },
});
