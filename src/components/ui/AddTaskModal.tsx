import React from 'react';
import type { TaskListItem } from '@/domain/entities';
import { TaskEditorSheet } from './TaskEditorSheet';

/** @deprecated Use TaskEditorSheet for both create and edit flows. */
export interface AddTaskModalProps {
  visible: boolean;
  onClose: () => void;
  initialTitle?: string;
  task?: TaskListItem | null;
}

/** Compatibility wrapper for callers that still use the old component name. */
export const AddTaskModal: React.FC<AddTaskModalProps> = ({
  visible,
  onClose,
  initialTitle,
  task,
}) => (
  <TaskEditorSheet
    visible={visible}
    onClose={onClose}
    mode={task ? 'edit' : 'create'}
    task={task}
    initialTitle={initialTitle}
  />
);
