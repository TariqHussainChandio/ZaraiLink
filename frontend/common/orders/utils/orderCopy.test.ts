import { orderNextStep } from './orderCopy';

const names = { buyer: 'Ali Khan', seller: 'Green Farms' };

describe('orderNextStep', () => {
  it('tells a buyer who they are waiting for', () => {
    expect(orderNextStep('pending', 'buyer', names, false)).toBe('Waiting for Green Farms to confirm your order.');
  });

  it('tells a seller what to do next', () => {
    expect(orderNextStep('pending', 'seller', names, false)).toBe('Ali Khan is waiting for you to confirm this order.');
    expect(orderNextStep('dispatched', 'seller', names, false)).toBe('Mark it completed once Ali Khan has the goods.');
  });

  it('mentions stock at dispatch for a dealer only', () => {
    expect(orderNextStep('ready', 'seller', names, true)).toContain('stock');
    expect(orderNextStep('ready', 'seller', names, false)).not.toContain('stock');
  });

  it('says the seller returned the money after a refund, never the platform (BR-11)', () => {
    expect(orderNextStep('refunded', 'buyer', names, false)).toBe('Green Farms returned your money directly.');
  });

  it('describes a dispatch without a courier: ZaraiLink tracks no delivery (BR-10)', () => {
    expect(orderNextStep('dispatched', 'buyer', names, false)).not.toMatch(/courier|track|on its way/i);
  });

  it('gives an administrator the facts', () => {
    expect(orderNextStep('pending', 'other', names, false)).toBe('Green Farms has not confirmed yet.');
  });

  it('reads a status this build does not know as a plain line, for every viewer', () => {
    for (const viewer of ['buyer', 'seller', 'other'] as const) {
      expect(orderNextStep('on_hold' as never, viewer, names, false)).toBe('This order is at a stage this version of the app does not know yet.');
    }
  });
});
