import { apiFetchPage, type Page } from '../../../services/api/client';
import type { LinkableInventoryProduct } from '../types/marketplace';

/** The backend's largest page (app/common/pagination.py MAX_LIMIT). */
const PAGE_LIMIT = 100;

/**
 * The signed-in dealer's active inventory products, every page, for the listing form's "Linked inventory product"
 * picker (D8). Called by path rather than through frontend/inventory, which this module may not import; the API
 * answers only an approved dealer, so callers ask only for one.
 */
export async function fetchLinkableInventoryProducts(): Promise<
  LinkableInventoryProduct[]
> {
  const products: LinkableInventoryProduct[] = [];
  let next: Page<unknown>['next'] = { limit: PAGE_LIMIT, offset: 0 };
  while (next) {
    const page: Page<LinkableInventoryProduct[]> = await apiFetchPage(
      '/api/v1/inventory/products',
      {
        query: { limit: next.limit, offset: next.offset },
      },
    );
    products.push(...page.data);
    next = page.next;
  }
  return products;
}
