import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Keyboard,
} from 'react-native';
import { X, Flag, Sparkles } from 'lucide-react-native';
import { TaskPriority } from '@/types';
import { Colors, Radius, Spacing } from '@/theme/tokens';
import { Typography } from './Typography';
import { Button } from './Button';
import { IconButton } from './IconButton';
import { AnimatedPressable } from './AnimatedPressable';
import { useSettingsStore } from '@/stores/settings.store';
import { useTasksStore } from '@/stores/tasks.store';

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

  const theme = useSettingsStore((s) => s.theme);
  const isDark = theme === 'dark' || (theme === 'system' && true);
  const addTask = useTasksStore((s) => s.addTask);

  const handleSave = () => {
    if (!title.trim()) return;
    addTask({
      title: title.trim(),
      notes: notes.trim() || undefined,
      priority,
      dueDate: new Date().toISOString().split('T')[0],
    });

    setTitle('');
    setNotes('');
    setPriority('medium');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={() => Keyboard.dismiss()}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
            <View
              style={[
                styles.modalContent,
                {
                  backgroundColor: isDark ? Colors.zinc900 : Colors.white,
                  borderColor: isDark ? Colors.zinc800 : Colors.zinc200,
                },
              ]}
            >
              {/* Header */}
              <View style={styles.header}>
                <View style={styles.titleRow}>
                  <Sparkles size={18} color={isDark ? Colors.white : Colors.black} />
                  <Typography variant="title" style={styles.headerTitle}>
                    New Task
                  </Typography>
                </View>
                <IconButton
                  icon={<X size={18} color={Colors.zinc500} />}
                  onPress={onClose}
                  variant="ghost"
                  size={36}
                />
              </View>

              {/* Title Input */}
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="What needs to be done?"
                placeholderTextColor={Colors.zinc500}
                autoFocus
                style={[
                  styles.titleInput,
                  {
                    color: isDark ? Colors.white : Colors.zinc950,
                  },
                ]}
              />

              {/* Notes Input */}
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="Add details, links, or notes..."
                placeholderTextColor={Colors.zinc500}
                multiline
                numberOfLines={3}
                style={[
                  styles.notesInput,
                  {
                    color: isDark ? Colors.zinc300 : Colors.zinc700,
                  },
                ]}
              />

              {/* Priority Selector */}
              <Typography variant="caption" color={Colors.zinc500} style={styles.sectionLabel}>
                PRIORITY LEVEL
              </Typography>
              <View style={styles.priorityRow}>
                {(['low', 'medium', 'high'] as TaskPriority[]).map((p) => {
                  const isSelected = priority === p;
                  return (
                    <AnimatedPressable
                      key={p}
                      onPress={() => setPriority(p)}
                      scaleTo={0.94}
                      style={[
                        styles.priorityChip,
                        {
                          backgroundColor: isSelected
                            ? isDark
                              ? Colors.white
                              : Colors.black
                            : isDark
                            ? Colors.zinc800
                            : Colors.zinc100,
                        },
                      ]}
                    >
                      <Flag
                        size={12}
                        color={
                          isSelected
                            ? isDark
                              ? Colors.black
                              : Colors.white
                            : Colors.zinc500
                        }
                      />
                      <Typography
                        variant="caption"
                        color={
                          isSelected
                            ? isDark
                              ? Colors.black
                              : Colors.white
                            : Colors.zinc500
                        }
                        style={{ textTransform: 'capitalize', fontWeight: '600' }}
                      >
                        {p}
                      </Typography>
                    </AnimatedPressable>
                  );
                })}
              </View>

              {/* Submit Action */}
              <View style={styles.actions}>
                <Button
                  label="Create Task"
                  onPress={handleSave}
                  variant="primary"
                  fullWidth
                  disabled={!title.trim()}
                />
              </View>
            </View>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  keyboardView: {
    width: '100%',
  },
  modalContent: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Platform.OS === 'ios' ? 40 : Spacing.lg,
    borderWidth: 1,
    borderBottomWidth: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    marginLeft: 4,
  },
  titleInput: {
    fontSize: 18,
    fontWeight: '600',
    paddingVertical: 10,
    marginBottom: Spacing.sm,
  },
  notesInput: {
    fontSize: 14,
    minHeight: 60,
    textAlignVertical: 'top',
    marginBottom: Spacing.md,
  },
  sectionLabel: {
    marginBottom: Spacing.xs,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  priorityRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  priorityChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: Radius.md,
    gap: 6,
  },
  actions: {
    marginTop: Spacing.xs,
  },
});
