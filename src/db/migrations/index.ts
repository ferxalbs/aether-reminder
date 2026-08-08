import { migration0001Core } from './0001_core';
import { migration0002Indexes } from './0002_indexes';
import { migration0003AgentRuntime } from './0003_agent_runtime';
import type { Migration } from './types';

/** Ordered, immutable migration list. Never edit applied migrations — append. */
export const MIGRATIONS: readonly Migration[] = [
  migration0001Core,
  migration0002Indexes,
  migration0003AgentRuntime,
];

export const LATEST_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1]?.version ?? 0;

export type { Migration };
