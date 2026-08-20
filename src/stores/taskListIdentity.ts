import type { TaskListItem } from "@/domain/entities";

const TASK_LIST_ITEM_FIELDS: readonly (keyof TaskListItem)[] = [
  "id",
  "title",
  "notes",
  "priority",
  "dueDate",
  "dueTime",
  "completed",
  "aiSuggested",
];

export function preserveTaskListItemIdentity(
  previous: readonly TaskListItem[],
  next: readonly TaskListItem[],
): TaskListItem[] {
  if (previous.length === 0 || next.length === 0) return [...next];
  const previousById = new Map(previous.map((task) => [task.id, task]));
  return next.map((task) => {
    const prior = previousById.get(task.id);
    return prior && TASK_LIST_ITEM_FIELDS.every((field) => prior[field] === task[field])
      ? prior
      : task;
  });
}
