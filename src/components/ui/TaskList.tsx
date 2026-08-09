import React, { useCallback } from 'react';
import { FlatList, Platform, type ListRenderItemInfo, type StyleProp, type ViewStyle } from 'react-native';
import type { TaskListItem } from '@/domain/entities';
import { TaskCard } from './TaskCard';

interface TaskListProps {
  tasks: TaskListItem[];
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  contentContainerStyle?: StyleProp<ViewStyle>;
  header?: React.ReactElement | null;
  empty?: React.ReactElement | null;
}

export function TaskList({
  tasks,
  onToggle,
  onDelete,
  contentContainerStyle,
  header,
  empty,
}: TaskListProps) {
  const renderTask = useCallback(
    ({ item }: ListRenderItemInfo<TaskListItem>) => (
      <TaskCard task={item} onToggle={onToggle} onDelete={onDelete} />
    ),
    [onDelete, onToggle],
  );

  return (
    <FlatList
      data={tasks}
      keyExtractor={(task) => task.id}
      renderItem={renderTask}
      initialNumToRender={10}
      maxToRenderPerBatch={10}
      windowSize={7}
      removeClippedSubviews={Platform.OS === 'android'}
      contentContainerStyle={contentContainerStyle}
      contentInsetAdjustmentBehavior="automatic"
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
    />
  );
}
