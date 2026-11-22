import { useMemo } from 'react';
import type { InventoryLocation, ProductView } from '../types/inventory';
import { useLocations, useProducts } from './inventory';

/** Products and locations by id, for screens that show ledger rows, stock levels or alerts (which carry only ids). */
export function useLookups() {
  const { data: products } = useProducts();
  const { data: locations } = useLocations();
  return useMemo(() => {
    const productById = new Map<string, ProductView>((products ?? []).map(product => [product.id, product]));
    const locationById = new Map<string, InventoryLocation>((locations ?? []).map(location => [location.id, location]));
    return { productById, locationById, products: products ?? [], locations: locations ?? [] };
  }, [products, locations]);
}
