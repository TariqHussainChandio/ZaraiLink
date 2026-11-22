import { useDealerApplication } from '../../common/auth';
import { useAuthStore } from '../../state/authStore';

/** The name the inventory system's app bar shows: the dealer's registered business (SRDS §7), else their own name. */
export function useBusinessName(): string {
  const { data } = useDealerApplication();
  const fullName = useAuthStore(state => state.profile?.full_name);
  return data?.business_name || fullName || 'My business';
}
