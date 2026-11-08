import type { AuditLogEntryWithActor } from '../types/audit';
import { AUDIT_AREAS, changeSummary, describeAudit } from './auditText';

const entry = (overrides: Partial<AuditLogEntryWithActor> = {}): AuditLogEntryWithActor => ({
  id: 'log-1',
  actor_id: 'admin-1',
  action: 'suspend_user',
  target_entity: 'profiles',
  target_id: 'user-9',
  previous_state: null,
  new_state: null,
  metadata: null,
  created_at: '2026-08-01T10:00:00Z',
  actor: { id: 'admin-1', full_name: 'Sana' },
  ...overrides,
});

describe('describeAudit', () => {
  it('writes an account suspension as a sentence with the change in words', () => {
    const d = describeAudit(entry({ previous_state: { is_suspended: false }, new_state: { is_suspended: true } }));
    expect(d.sentence).toBe('Sana suspended an account');
    expect(d.changes).toEqual([{ label: 'Account', from: 'Active', to: 'Suspended' }]);
    expect(d.item).toBe('Account');
    expect(changeSummary(d)).toBe('Active → Suspended');
  });

  it('names an application decision by its role and shows the status change and the reason', () => {
    const d = describeAudit(
      entry({
        action: 'dealer_application_rejected',
        previous_state: { account_status: 'pending', account_status_reason: null },
        new_state: { account_status: 'rejected', account_status_reason: 'CNIC photo blurred' },
        metadata: { reason: 'CNIC photo blurred' },
      }),
    );
    expect(d.sentence).toBe('Sana rejected a dealer application');
    expect(changeSummary(d)).toBe('Under review → Not approved');
    expect(d.reason).toBe('CNIC photo blurred');
    // The reason is its own line, not repeated as a change.
    expect(d.changes).toHaveLength(1);
  });

  it('reads a role change with role names, not machine values', () => {
    const d = describeAudit(entry({ action: 'change_role', previous_state: { role: 'farmer' }, new_state: { role: 'dealer' } }));
    expect(d.sentence).toBe("Sana changed an account's role");
    expect(changeSummary(d)).toBe('Farmer → Dealer');
  });

  it('reads a listing moderation as Hidden or Listed, from the new state alone', () => {
    const hidden = describeAudit(entry({ action: 'update_listing_status', target_entity: 'listings', new_state: { status: 'inactive' } }));
    expect(hidden.sentence).toBe('Sana hid a listing');
    expect(hidden.changes).toEqual([{ label: 'Status', from: null, to: 'Hidden' }]);
    expect(describeAudit(entry({ action: 'update_listing_status', target_entity: 'listings', new_state: { status: 'active' } })).sentence).toBe(
      'Sana restored a listing',
    );
  });

  it('takes a report note as the reason', () => {
    const d = describeAudit(
      entry({ action: 'dismiss_report', target_entity: 'reports', new_state: { status: 'dismissed' }, metadata: { notes: 'Does not break the rules' } }),
    );
    expect(d.sentence).toBe('Sana dismissed a report');
    expect(d.reason).toBe('Does not break the rules');
    expect(d.changes[0]?.to).toBe('Dismissed');
  });

  it('shows only the fields that differ when both states are recorded', () => {
    const d = describeAudit(
      entry({
        action: 'required_document_updated',
        target_entity: 'required_documents',
        previous_state: { id: 'd1', label: 'CNIC front', is_required: true, updated_at: 'x' },
        new_state: { id: 'd1', label: 'CNIC front', is_required: false, updated_at: 'y' },
      }),
    );
    expect(d.sentence).toBe('Sana changed the required document "CNIC front"');
    expect(d.changes).toEqual([{ label: 'Needed', from: 'Required', to: 'Optional' }]);
  });

  it('falls back to the system and to a readable action for one it does not know', () => {
    const d = describeAudit(entry({ actor: null, action: 'archive_things', target_entity: 'widgets' }));
    expect(d.sentence).toBe('The system archive things');
    expect(d.item).toBe('Widgets');
  });
});

describe('AUDIT_AREAS', () => {
  it('sorts entries into areas people use, not table names', () => {
    const area = (value: string) => AUDIT_AREAS.find(a => a.value === value);
    const application = entry({ action: 'expert_application_approved' });
    const suspension = entry();
    expect(area('applications')?.match?.(application)).toBe(true);
    expect(area('applications')?.match?.(suspension)).toBe(false);
    expect(area('accounts')?.match?.(suspension)).toBe(true);
    expect(area('accounts')?.match?.(application)).toBe(false);
    expect(area('settings')?.match?.(entry({ target_entity: 'categories', action: 'create_category' }))).toBe(true);
    expect(area('listings')?.entity).toBe('listings');
  });
});
