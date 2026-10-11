// An audit entry as the API returns it (SRDS §51): the raw event name in `action` and the label the screen shows in
// `action_label`, and the catalogue of event names the filter offers. The generated contract is the source of truth
// (AGENTS.md rule 9), so this only re-exports it.
export type { AuditEventNameEntry, AuditLogEntryWithActor } from '../../services/api/generated/types.gen';
