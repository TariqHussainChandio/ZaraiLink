/**
 * A3b real-stack test: a dealer's application through the app's own service code, against the real FastAPI, the real
 * local Storage and the real database rules (no fakes of ours). Setup and how to run it: frontend/testUtils/realStack.ts
 * (`ZARAILINK_REALSTACK=1 npx jest realstack`).
 */
import type { ApiError as ApiErrorType } from '../../../services/api/errors';
import { API_URL, installNodeFetch, realStackEnabled, signUp, storageFor } from '../../../testUtils/realStack';

installNodeFetch();

const describeReal = realStackEnabled ? describe : describe.skip;
const PDF = new TextEncoder().encode('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

async function loadApp(token: string) {
  process.env.EXPO_PUBLIC_API_BASE_URL = API_URL;
  jest.resetModules();
  jest.doMock('../../../services/supabase/client', () => ({
    supabase: {
      auth: {
        getSession: async () => ({ data: { session: { access_token: token } } }),
        refreshSession: async () => ({ data: { session: null }, error: new Error('no refresh in this test') }),
        signOut: async () => ({ error: null }),
      },
      storage: storageFor(token),
    },
  }));
  // The picked file is read from the device by URI; here the "device" hands back the PDF's bytes.
  const apiFetch = globalThis.fetch;
  globalThis.fetch = ((url: string, init?: unknown) =>
    url.startsWith('file://')
      ? Promise.resolve({ arrayBuffer: () => Promise.resolve(PDF.buffer) })
      : (apiFetch as (u: string, i?: unknown) => Promise<unknown>)(url, init)) as never;
  return jest.requireActual<typeof import('../services/applicationService')>('../services/applicationService');
}

function userIdOf(token: string): string {
  const payload = (token.split('.')[1] ?? '').replace(/-/g, '+').replace(/_/g, '/');
  return (JSON.parse(atob(payload)) as { sub: string }).sub;
}

const business = {
  business_name: 'Realstack Agri Inputs',
  business_type: 'distributor' as const,
  registration_number: 'RS-1',
  business_address: '1 Realstack Road',
  country: 'Pakistan',
  province: 'Punjab',
  city: 'Multan',
};

describeReal('a dealer application, against the real backend and Storage (A3b)', () => {
  it('fills in, uploads, submits; then the application is frozen', async () => {
    const token = await signUp('dealer', { pending: true });
    const userId = userIdOf(token);
    const service = await loadApp(token);

    await expect(service.fetchDealerApplication()).resolves.toBeNull();
    await service.saveDealerApplication(business);
    const required = (await service.fetchRequiredDocuments()).filter(d => d.is_required);
    expect(required.map(d => d.code)).toEqual(expect.arrayContaining(['business_registration', 'business_licence']));

    for (const requirement of required) {
      const attached = await service.attachDocument(
        'dealer',
        userId,
        { uri: `file:///cache/${requirement.code}.pdf`, mimeType: 'application/pdf', fileName: `${requirement.code}.pdf` },
        requirement.id,
      );
      // The type and size are what Storage recorded, not what the app said.
      expect(attached).toMatchObject({ mime_type: 'application/pdf', size_bytes: PDF.byteLength, required_document_id: requirement.id });
    }
    expect(await service.fetchApplicationDocuments('dealer')).toHaveLength(required.length);

    await service.submitApplication();

    const locked = (await service.saveDealerApplication(business).catch((e: unknown) => e)) as ApiErrorType;
    expect(locked).toMatchObject({ status: 403, code: 'application_locked' });
    // Storage itself refuses a new file while the application is under review.
    await expect(
      service.attachDocument('dealer', userId, { uri: 'file:///cache/late.pdf', mimeType: 'application/pdf', fileName: 'late.pdf' }, null),
    ).rejects.toThrow();
  }, 90_000);
});
