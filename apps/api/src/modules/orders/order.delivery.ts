import type { CompanyPurchaseSnapshot, DeliveryPurchaseSnapshot, OrderInput, StaffIdentity } from '@fernleaf/contracts';
import { ApiError } from '../../common/api-error';
import { assertCalendarDate, assertLocalTime, isDeliveryDateAllowed } from '../../domain/calendar';
import type { Prisma } from '../../generated/prisma/client';
import type { CutoffsService } from '../cutoffs/cutoffs.service';
import { OverrideDto } from './orders.dto';
import { addressKey, fingerprint, json, orderInclude } from './order.mapping';

type OrderRecord = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

export async function overrideDelivery(tx: Prisma.TransactionClient, order: OrderRecord, dto: OverrideDto, cutoffs: CutoffsService, actor: StaffIdentity) {
  if (!['DRAFT', 'PLACED', 'CONFIRMED'].includes(order.status)) throw new ApiError(409, 'ORDER_LOCKED', 'Only active, undelivered orders can have logistics changed.');
  if (order.dropId) {
    const drop = await tx.deliveryDrop.findUnique({ where: { id: order.dropId } });
    if (drop && ['OUT_FOR_DELIVERY', 'DELIVERED'].includes(drop.status)) throw new ApiError(409, 'DROP_ALREADY_DEPARTED', 'This order is travelling with its drop. Open the grouped drop for a reasoned correction affecting all active members.');
  }
  const before = order.deliverySnapshot as unknown as DeliveryPurchaseSnapshot;
  const capturedCompany = order.companySnapshot as unknown as CompanyPurchaseSnapshot;
  const company = await tx.company.findUnique({ where: { id: order.companyId } });
  if (!company) throw new ApiError(409, 'ORDER_COMPANY_MISSING', 'The purchased company is unavailable.');
  const deliveryDate = dto.deliveryDate ?? order.deliveryDate;
  assertCalendarDate(deliveryDate);
  if (!isDeliveryDateAllowed(deliveryDate, company)) throw new ApiError(400, 'COMPANY_DATE_CLOSED', 'The purchased company does not accept delivery on this date.');
  if (dto.addressId && dto.customAddress) throw new ApiError(400, 'ADDRESS_AMBIGUOUS', 'Choose a saved or custom address, not both.');
  let address = before.address;
  if (dto.customAddress) address = { ...dto.customAddress, id: null, line2: dto.customAddress.line2 ?? null };
  else if (dto.addressId) {
    const saved = await tx.companyAddress.findFirst({ where: { id: dto.addressId, companyId: order.companyId, active: true } });
    if (!saved) throw new ApiError(400, 'DELIVERY_ADDRESS_INVALID', 'Select an active address belonging to the purchased company.');
    address = { id: saved.id, label: saved.label, line1: saved.line1, line2: saved.line2,
      city: saved.city, region: saved.region, postalCode: saved.postalCode, country: saved.country };
  }
  const deliveryTime = dto.deliveryTime ?? before.deliveryTime;
  assertLocalTime(deliveryTime);
  let packaging = before.packaging;
  if (dto.packagingId !== undefined) {
    if (dto.packagingId === null) packaging = null;
    else {
      const value = await tx.referenceValue.findFirst({ where: { id: dto.packagingId, kind: 'PACKAGING_TYPE', active: true } });
      if (!value) throw new ApiError(400, 'PACKAGING_INVALID', 'Select active packaging.');
      packaging = { id: value.id, name: value.name };
    }
  }
  const deliveryAt = new Date(`${deliveryDate}T${deliveryTime}:00+05:30`);
  const plannedDispatchReadyAt = new Date(deliveryAt.getTime() - capturedCompany.deliveryMinutes * 60000);
  const plannedKitchenReadyAt = new Date(plannedDispatchReadyAt.getTime() - 30 * 60000);
  const delivery: DeliveryPurchaseSnapshot = { ...before, address, deliveryDate, deliveryTime, deliveryAt: deliveryAt.toISOString(),
    packaging, plannedDispatchReadyAt: plannedDispatchReadyAt.toISOString(), plannedKitchenReadyAt: plannedKitchenReadyAt.toISOString() };
  const nextAddressKey = addressKey(delivery);
  const groupingChanged = nextAddressKey !== order.addressKey || deliveryAt.getTime() !== order.deliveryAt.getTime();
  const packagingChanged = fingerprint(packaging) !== fingerprint(before.packaging);
  const cutoff = await cutoffs.ensureDate(tx, deliveryDate);
  const originalInput = order.input as unknown as OrderInput;
  // Normalize the stored delivery input, removing an obsolete custom/saved
  // counterpart, so a later draft placement validates the intended address.
  const { addressId: _saved, customAddress: _custom, ...rest } = originalInput;
  void _saved; void _custom;
  const input: OrderInput = { ...rest, deliveryDate, deliveryTime, packagingId: packaging?.id ?? null,
    ...(address.id ? { addressId: address.id } : { customAddress: { label: address.label, line1: address.line1, line2: address.line2,
      city: address.city, region: address.region, postalCode: address.postalCode, country: address.country } }) };
  const changed = await tx.order.updateMany({ where: { id: order.id, version: dto.version, status: order.status }, data: {
    deliveryDate, deliveryAt, cutoffAt: cutoff.cutoffAt, addressKey: nextAddressKey, deliverySnapshot: json(delivery),
    plannedDispatchReadyAt, plannedKitchenReadyAt, input: json(input), version: { increment: 1 },
  } });
  if (!changed.count) throw new ApiError(409, 'STALE_VERSION', 'This order changed. Reload before trying again.');
  if (order.status === 'CONFIRMED' && groupingChanged) await cutoffs.moveConfirmedDelivery(tx, order.id, order.dropId, actor, dto.reason);
  else if (order.status === 'CONFIRMED' && packagingChanged && order.dropId) await cutoffs.refreshDropAfterMembershipChange(tx, order.dropId, actor, dto.reason);
  return { before, after: delivery };
}
