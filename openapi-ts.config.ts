import { defineConfig } from '@hey-api/openapi-ts';

// P7 (7A): the typed API client, generated from the backend's OpenAPI document. Regenerate with `npm run api:generate`
// after `cd backend && uv run python ../scripts/export_openapi.py`; CI regenerates both and fails on any difference.
export default defineConfig({
  input: './backend/openapi.json',
  output: { path: './src/api/generated', postProcess: [] },
  plugins: [
    '@hey-api/typescript',
    '@hey-api/client-fetch',
    { name: '@hey-api/sdk', operations: { strategy: 'flat' } },
  ],
});
