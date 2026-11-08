/**
 * P7 (7D) real-stack test: the expert and admin hooks against the real FastAPI and the real local Supabase.
 * Setup and how to run it: see frontend/testUtils/realStack.ts (`ZARAILINK_REALSTACK=1 npx jest realstack`).
 *
 * The admin write paths need a second factor (aal2) and a database-side role promotion, which the backend smoke
 * suite already drives with a real admin (`world.admin`); what this test adds is what the app's hooks see: an expert
 * applying, and every admin call being refused for a user who is not an admin.
 */
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import React from 'react';
import { API_URL, installNodeFetch, realStackEnabled, signUp } from '../../testUtils/realStack';
import { useAuthStore } from '../../state/authStore';
import { createTestQueryClient } from '../../testUtils/renderWithProviders';

installNodeFetch();

let mockToken: string | null = null;
jest.mock('../../services/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: mockToken ? { access_token: mockToken } : null } }),
      refreshSession: async () => ({ data: { session: null }, error: new Error('no refresh in this test') }),
      signOut: async () => ({ error: null }),
    },
    storage: { from: () => ({ upload: async () => ({ error: null }), createSignedUrls: async () => ({ data: [], error: null }) }) },
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: () => undefined,
  },
}));

const describeReal = realStackEnabled ? describe : describe.skip;

const idOf = (token: string) => JSON.parse(atob((token.split('.')[1] ?? '').replace(/-/g, '+').replace(/_/g, '/'))).sub as string;

describeReal('expert and admin hooks against the real backend', () => {
  let expertToken = '';
  let farmerToken = '';
  let experts: typeof import('./experts');
  let consultations: typeof import('../../common/consultations/hooks/consultations');
  let admin: typeof import('../../admin/hooks/admin');
  let queryClient: QueryClient;

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  function signInAs(token: string) {
    mockToken = token;
    useAuthStore.setState({ user: { id: idOf(token) } as never });
    queryClient = createTestQueryClient();
  }

  beforeAll(async () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = API_URL;
    // Pending, as every expert is until approved: since A3b an approved expert's application is closed.
    expertToken = await signUp('expert', { pending: true });
    farmerToken = await signUp('farmer');
    experts = require('./experts');
    consultations = require('../../common/consultations/hooks/consultations');
    admin = require('../../admin/hooks/admin');
  }, 60_000);

  afterEach(() => queryClient.clear());

  it('lets an expert apply and see their pending profile, which no one else can find in the expert list', async () => {
    signInAs(expertToken);
    const expert = await renderHook(() => ({ own: experts.useOwnExpertProfile(true), save: experts.useSaveExpertProfile() }), { wrapper });
    await waitFor(() => expect(expert.result.current.own.data).toBeNull());

    await act(async () => {
      await expert.result.current.save.mutateAsync({
        exists: false,
        input: {
          qualifications: 'BSc Agriculture',
          degree: 'BSc',
          experience: '5 years',
          professionalDescription: 'Wheat and rice',
          contact: '0300-0000000',
          country: null,
          province: null,
          city: null,
          specializations: ['plant_diseases'],
        },
      });
    });
    await waitFor(() => expect(expert.result.current.own.data?.verification_status).toBe('pending'));

    // A farmer browsing experts does not see an expert who has not been approved.
    signInAs(farmerToken);
    const browse = await renderHook(() => experts.useExperts(undefined), { wrapper });
    await waitFor(() => expect(browse.result.current.isPending).toBe(false));
    expect((browse.result.current.data ?? []).map(e => e.id)).not.toContain(idOf(expertToken));

    // ...and cannot ask that expert for a consultation.
    const request = await renderHook(() => consultations.useRequestConsultation(idOf(farmerToken)), { wrapper });
    const refused = await act(async () =>
      request.result.current
        .mutateAsync({ images: [], input: { expertId: idOf(expertToken), subject: 'Yellow leaves', cropId: null, problemDescription: 'Help', farmId: null, images: [], priority: 'medium' } })
        .catch((e: unknown) => e),
    );
    expect(refused).toEqual(expect.objectContaining({ kind: expect.stringMatching(/forbidden|notFound|validation|conflict/) }));
  }, 60_000);

  it('refuses every admin hook to a farmer and to an expert', async () => {
    for (const token of [farmerToken, expertToken]) {
      signInAs(token);
      const calls = await renderHook(
        () => ({
          stats: admin.usePlatformStats(),
          users: admin.useProfilePages({}, false),
          audit: admin.useAuditLogPages(undefined, false),
          orders: admin.useOrderPages(false),
          reports: admin.useReportPages(undefined, false),
          verifications: admin.useExpertVerifications(undefined),
          suspend: admin.useSetProfileSuspended(),
        }),
        { wrapper },
      );
      for (const name of ['stats', 'users', 'audit', 'orders', 'reports', 'verifications'] as const) {
        await waitFor(() => expect(calls.result.current[name].error).toMatchObject({ status: 403 }));
        expect(calls.result.current[name].data).toBeUndefined();
      }
      const denied = await act(async () => calls.result.current.suspend.mutateAsync({ id: idOf(farmerToken), suspended: true }).catch((e: unknown) => e));
      expect(denied).toMatchObject({ status: 403 });
    }
  }, 90_000);
});
