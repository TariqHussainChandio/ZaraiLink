import type { OrderStatus } from '../types/orders';

// An installed build meets statuses the API added after it shipped; the order still opens, with a plain line.
const UNKNOWN = 'This order is at a stage this version of the app does not know yet.';

export type OrderViewer = 'buyer' | 'seller' | 'other';

interface Names {
  /** The other side as this viewer sees them: the seller for a buyer, the buyer for a seller. */
  buyer: string;
  seller: string;
}

/** The order's status and what happens next, in a sentence, for whoever is looking (D15, "Order"): a badge says where the
 * order is, this says what is waiting and on whom. ZaraiLink tracks no delivery (BR-10), so after dispatch the sentence is
 * about the two people settling it, not about a courier. A viewer who is neither side (an administrator) gets the facts. */
export function orderNextStep(status: OrderStatus, viewer: OrderViewer, { buyer, seller }: Names, dealer: boolean): string {
  if (viewer === 'buyer') {
    const BUYER: Record<OrderStatus, string> = {
      pending: `Waiting for ${seller} to confirm your order.`,
      confirmed: `${seller} confirmed your order.`,
      processing: `${seller} is preparing your order.`,
      ready: `Your order is ready. ${seller} dispatches it next.`,
      dispatched: `${seller} dispatched your order. They mark it completed once you have the goods.`,
      completed: 'Completed. You can rate this seller, or report a problem.',
      cancelled: 'This order was cancelled.',
      rejected: `${seller} rejected this order.`,
      payment_failed: `${seller} did not receive your payment. Message them to sort it out.`,
      disputed: 'You reported a problem with this order. An administrator is looking into it.',
      refunded: `${seller} returned your money directly.`,
      expired: `${seller} did not answer in time, so this order expired.`,
    };
    return BUYER[status] ?? UNKNOWN;
  }
  if (viewer === 'seller') {
    const SELLER: Record<OrderStatus, string> = {
      pending: `${buyer} is waiting for you to confirm this order.`,
      confirmed: 'Start preparing the order when you are ready.',
      processing: 'Mark it ready once it is packed.',
      ready: dealer ? 'Dispatch it. Your stock is reduced when you do.' : 'Dispatch it when the goods leave you.',
      dispatched: `Mark it completed once ${buyer} has the goods.`,
      completed: 'Completed.',
      cancelled: 'This order was cancelled.',
      rejected: 'You rejected this order.',
      payment_failed: `You marked ${buyer}'s payment as not received.`,
      disputed: `${buyer} reported a problem. An administrator is looking into it.`,
      refunded: `You returned ${buyer}'s money.`,
      expired: 'This order expired before you answered.',
    };
    return SELLER[status] ?? UNKNOWN;
  }
  const OTHER: Record<OrderStatus, string> = {
    pending: `${seller} has not confirmed yet.`,
    confirmed: `${seller} confirmed this order.`,
    processing: `${seller} is preparing this order.`,
    ready: `Ready for ${seller} to dispatch.`,
    dispatched: `${seller} dispatched this order.`,
    completed: 'Completed.',
    cancelled: 'Cancelled.',
    rejected: `${seller} rejected this order.`,
    payment_failed: 'The payment was marked as not received.',
    disputed: `${buyer} reported a problem.`,
    refunded: 'Refunded by the seller.',
    expired: 'Expired before the seller answered.',
  };
  return OTHER[status] ?? UNKNOWN;
}
