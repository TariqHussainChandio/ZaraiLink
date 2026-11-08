import React from 'react';
import { Banner } from '../../../components';
import { useAuthStore } from '../../../../state/authStore';

/** Why an administrator did not approve the application, for as long as it is being corrected. Shown on the status screen
 * and on every step of the wizard, because the person needs it while they fix the thing it describes, not only before. The
 * text is the administrator's own words, so it is shown as written. */
export function RejectionReason() {
  const rejected = useAuthStore(state => state.profile?.account_status === 'rejected');
  const reason = useAuthStore(state => state.profile?.account_status_reason);
  if (!rejected) return null;
  return (
    <Banner tone="danger" title="Not approved. Reason from the administrator">
      {reason || 'No reason was given. Check your details and documents, then send the application again.'}
    </Banner>
  );
}
