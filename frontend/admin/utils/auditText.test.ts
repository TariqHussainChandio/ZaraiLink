import type { AuditLogEntryWithActor } from '../types/audit';
import { changeSummary, describeAudit } from './auditText';

const entry = (overrides: Partial<AuditLogEntryWithActor> = {}): AuditLogEntryWithActor => ({
  id: 'log-1',
  actor_id: 'admin-1',
  action: 'user_suspended',
  action_label: 'User Suspended',
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
    const d = describeAudit(entry({ action: 'user_role_changed', previous_state: { role: 'farmer' }, new_state: { role: 'dealer' } }));
    expect(d.sentence).toBe("Sana changed an account's role");
    expect(changeSummary(d)).toBe('Farmer → Dealer');
  });

  it('reads a listing moderation as Hidden or Listed, from the new state alone', () => {
    const hidden = describeAudit(entry({ action: 'product_moderated', target_entity: 'listings', new_state: { status: 'inactive' } }));
    expect(hidden.sentence).toBe('Sana hid a listing');
    expect(hidden.changes).toEqual([{ label: 'Status', from: null, to: 'Hidden' }]);
    expect(describeAudit(entry({ action: 'product_moderated', target_entity: 'listings', new_state: { status: 'active' } })).sentence).toBe(
      'Sana restored a listing',
    );
  });

  it('takes a report note as the reason', () => {
    const d = describeAudit(
      entry({ action: 'report_dismissed', target_entity: 'reports', new_state: { status: 'dismissed' }, metadata: { notes: 'Does not break the rules' } }),
    );
    expect(d.sentence).toBe('Sana dismissed a report');
    expect(d.reason).toBe('Does not break the rules');
    expect(d.changes[0]?.to).toBe('Dismissed');
  });

  it('reads a hidden review with its reason, never as a deletion (A7)', () => {
    const d = describeAudit(
      entry({
        action: 'review_moderated',
        target_entity: 'reviews',
        previous_state: { hidden_at: null, hidden_reason: null },
        new_state: { hidden_at: '2026-08-01T10:00:00Z', hidden_reason: 'Abusive' },
        metadata: { change: 'hide' },
      }),
    );
    expect(d.sentence).toBe('Sana hid a review');
    expect(d.reason).toBe('Abusive');
    expect(d.changes).toEqual([{ label: 'Review', from: 'Shown', to: 'Hidden' }]);
    expect(describeAudit(entry({ action: 'review_moderated', metadata: { change: 'restore' } })).sentence).toBe('Sana restored a review');
  });

  it('tells an order cancellation from a settled dispute, with the reason', () => {
    const cancelled = describeAudit(
      entry({
        action: 'order_administrative_action',
        target_entity: 'orders',
        new_state: { status: 'cancelled', admin_action_reason: 'Fraud' },
        metadata: { change: 'cancel' },
      }),
    );
    expect(cancelled.sentence).toBe('Sana cancelled an order');
    expect(cancelled.reason).toBe('Fraud');
    expect(describeAudit(entry({ action: 'order_administrative_action', metadata: { change: 'resolve_dispute' } })).sentence).toBe(
      'Sana settled an order dispute',
    );
  });

  it('reads a closed consultation', () => {
    const d = describeAudit(
      entry({ action: 'consultation_moderated', target_entity: 'consultations', new_state: { status: 'closed', moderation_reason: 'Duplicate' }, metadata: { change: 'close' } }),
    );
    expect(d.sentence).toBe('Sana closed a consultation');
    expect(d.reason).toBe('Duplicate');
  });

  it('reads a settings change by its kind, from the trigger or an old name kept in metadata', () => {
    expect(describeAudit(entry({ action: 'category_changed', target_entity: 'categories', new_state: { name: 'Seeds' }, metadata: { change: 'create' } })).sentence).toBe(
      'Sana added the category "Seeds"',
    );
    expect(describeAudit(entry({ action: 'category_changed', target_entity: 'categories', metadata: { change: 'delete_category' } })).sentence).toBe(
      'Sana deleted a category',
    );
  });

  it('shows only the fields that differ when both states are recorded', () => {
    const d = describeAudit(
      entry({
        action: 'required_document_changed',
        target_entity: 'required_documents',
        previous_state: { id: 'd1', label: 'CNIC front', is_required: true, updated_at: 'x' },
        new_state: { id: 'd1', label: 'CNIC front', is_required: false, updated_at: 'y' },
        metadata: { change: 'required_document_updated' },
      }),
    );
    expect(d.sentence).toBe('Sana changed the required document "CNIC front"');
    expect(d.changes).toEqual([{ label: 'Needed', from: 'Required', to: 'Optional' }]);
  });

  it('falls back to the system and to the API label for an event it does not know', () => {
    const d = describeAudit(entry({ actor: null, action: 'archive_things', action_label: 'Archive Things', target_entity: 'widgets' }));
    expect(d.sentence).toBe('The system archive things');
    expect(d.item).toBe('Widgets');
  });
});
