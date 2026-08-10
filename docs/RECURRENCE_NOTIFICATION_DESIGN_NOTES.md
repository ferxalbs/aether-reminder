# Recurrence design decisions

- A completed recurrence occurrence remains a completed task in history.
- The next occurrence is a distinct task with a deterministic ID.
- The recurrence rule points only at its current occurrence and retains one rollback link to the latest completed occurrence.
- Known recurrence advancement does not invoke an LLM.
- Enabled reminder semantics are copied forward only by the winning compare-and-swap advancement.
- OS notification actions always route through the shared command executor.
