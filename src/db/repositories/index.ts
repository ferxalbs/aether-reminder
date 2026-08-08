import { getDatabase } from '../client';
import type { SqlDatabase } from '../types';
import { ProjectsRepository } from './projectsRepository';
import { RemindersRepository } from './remindersRepository';
import { TaskEventsRepository } from './taskEventsRepository';
import { TasksRepository } from './tasksRepository';

export { ProjectsRepository } from './projectsRepository';
export { RemindersRepository } from './remindersRepository';
export { TaskEventsRepository } from './taskEventsRepository';
export { TasksRepository } from './tasksRepository';

export function createRepositories(db: SqlDatabase = getDatabase()) {
  return {
    tasks: new TasksRepository(db),
    reminders: new RemindersRepository(db),
    projects: new ProjectsRepository(db),
    taskEvents: new TaskEventsRepository(db),
  };
}

export type Repositories = ReturnType<typeof createRepositories>;
