import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from './keys';

/**
 * Refreshes everything an order or payment change affects: the order lists and details, payments, and the dashboard
 * figures. Shared by the order and payment hooks; kept outside both so neither feature imports the other's hooks
 * (A1: no import cycle through a module's public entry point).
 */
export function useInvalidateOrders() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.payments.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all }),
    ]);
}
