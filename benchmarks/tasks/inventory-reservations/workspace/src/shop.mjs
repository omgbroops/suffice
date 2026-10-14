import { makeStock } from './stock-repository.mjs';
import { createReservations } from './reservation-store.mjs';
import { reserveRequest } from './checkout.mjs';
export function createShop(initial) {
  const stock = makeStock(initial);
  const reservations = createReservations();
  return {
    reserve: request => reserveRequest(request, { stock, reservations }),
    stock: (tenant, sku) => stock.read(tenant, sku),
  };
}
