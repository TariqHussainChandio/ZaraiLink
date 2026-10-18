import { apiFetchPage } from '../../../services/api/client';
import { fetchLinkableInventoryProducts } from './inventoryProductsService';

jest.mock('../../../services/api/client');

const mockApiFetchPage = apiFetchPage as jest.MockedFunction<
  typeof apiFetchPage
>;

const product = (id: string) => ({
  id,
  sku: `SKU-${id}`,
  name: `Product ${id}`,
  unit: 'bag',
  is_active: true,
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('fetchLinkableInventoryProducts', () => {
  it("reads every page of the dealer's products, so the picker offers all of them", async () => {
    mockApiFetchPage
      .mockResolvedValueOnce({
        data: [product('1'), product('2')],
        next: { limit: 100, offset: 100 },
      } as never)
      .mockResolvedValueOnce({ data: [product('3')], next: null } as never);

    const products = await fetchLinkableInventoryProducts();

    expect(products.map(p => p.id)).toEqual(['1', '2', '3']);
    expect(mockApiFetchPage).toHaveBeenNthCalledWith(
      1,
      '/api/v1/inventory/products',
      {
        query: { limit: 100, offset: 0 },
      },
    );
    expect(mockApiFetchPage).toHaveBeenNthCalledWith(
      2,
      '/api/v1/inventory/products',
      {
        query: { limit: 100, offset: 100 },
      },
    );
  });

  it('passes a refusal through, so the form can say the products could not be loaded', async () => {
    mockApiFetchPage.mockRejectedValueOnce(new Error('account_not_approved'));
    await expect(fetchLinkableInventoryProducts()).rejects.toThrow(
      'account_not_approved',
    );
  });
});
