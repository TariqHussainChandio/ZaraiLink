export interface AuditLogEntry {
  id: string;
  actor_id: string | null;
  action: string;
  target_entity: string;
  target_id: string | null;
  previous_state: Record<string, unknown> | null;
  new_state: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface AuditLogEntryWithActor extends AuditLogEntry {
  actor: { id: string; full_name: string } | null;
}
