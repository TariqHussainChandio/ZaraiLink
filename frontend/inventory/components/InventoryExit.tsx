import React, { createContext, useContext } from 'react';

const InventoryExitContext = createContext<(() => void) | null>(null);

/** Gives every screen of the inventory system the way back to the marketplace: the root screen's own goBack, so it
 * leaves the whole system rather than stepping back one tab or one screen. */
export function InventoryExitProvider({ onExit, children }: { onExit: () => void; children: React.ReactNode }) {
  return <InventoryExitContext.Provider value={onExit}>{children}</InventoryExitContext.Provider>;
}

/** "Back to ZaraiLink". Only defined inside the inventory system's navigator. */
export function useExitInventory(): () => void {
  const exit = useContext(InventoryExitContext);
  if (!exit) throw new Error('useExitInventory is used outside the inventory system');
  return exit;
}
