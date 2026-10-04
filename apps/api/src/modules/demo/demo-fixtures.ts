import { createHash } from 'node:crypto';
import type { OrderInput, OrderStatus } from '@fernleaf/contracts';
import { Prisma, type PrismaClient, type DropStatus } from '../../generated/prisma/client';
import { calculateCutoff, isDeliveryDateAllowed, kitchenDate } from '../../domain/calendar';
import { Clock } from '../../common/clock';
import type { PrismaService } from '../../database/prisma.service';
import { CutoffsService } from '../cutoffs/cutoffs.service';
import { MenuService } from '../menu/menu.service';
import { quoteInTransaction } from '../orders/order.quote';
import { addressKey, json } from '../orders/order.mapping';

// Namespaced UUIDs are the scenario/date keys. Nothing relies on an arbitrary
// first order, invoice, or company, and existing fixtures are never overwritten.
export function demoId(key: string): string {
  const hex = createHash('sha256').update(`fernleaf-review-v1:${key}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
export const DEMO_COMPANY_IDS = [0, 1, 2].map((index) => demoId(`company:${index}`));
const TIER_ID = demoId('configuration-installed');
const COST_TIER_ID = demoId('cost-tier');
const CATEGORY_ID = demoId('lunch-category');
const SECRET_ID = demoId('secret-category');
const ACTOR = 'Generated demo history';
const REASON = 'Synthetic reviewer scenario; historical operations constructed separately from ordinary order APIs.';
const POLICY = { maximumSelectionsPerGroup: 1, ordinaryCustomAddresses: false, rejectDuplicateDishLines: true };
export interface DemoFixtureResult { date: string; insertedOrders: number; existingOrders: number; unavailableScenarios: number }

function shiftedDate(date: string, days: number): string {
  const cursor = new Date(`${date}T00:00:00Z`); cursor.setUTCDate(cursor.getUTCDate() + days);
  return cursor.toISOString().slice(0, 10);
}
const minutesBefore = (at: Date, minutes: number) => new Date(at.getTime() - minutes * 60_000);

async function installConfiguration(tx: Prisma.TransactionClient): Promise<void> {
  if (await tx.priceTier.findUnique({ where: { id: TIER_ID } })) return;
  const driver = await tx.staffUser.findFirst({ where: { email: 'driver@test.com', role: 'DRIVER', active: true } });
  const packaging = await tx.referenceValue.findFirst({ where: { kind: 'PACKAGING_TYPE', active: true }, orderBy: { sortOrder: 'asc' } });
  await tx.priceTier.create({ data: { id: TIER_ID, name: 'Review menu standard', rule: 'MANUAL' } });
  await tx.priceTier.create({ data: { id: COST_TIER_ID, name: 'Review cost plus 40%', rule: 'COST', numerator: 140, denominator: 100 } });
  await tx.category.createMany({ data: [{ id: CATEGORY_ID, name: 'Daily review meals', sortOrder: 10 }, { id: SECRET_ID, name: 'Seasonal tasting preview', secret: true, sortOrder: 11 }] });
  for (const [index, name] of ['Hot meals', 'Salads and sandwiches', 'Bakery'].entries()) {
    await tx.referenceValue.create({ data: { id: demoId(`station:${index}`), kind: 'KITCHEN_STATION', name: `${name} (demo)`, sortOrder: index + 10 } });
  }
  const options = [['Brown rice', 80], ['Jeera rice', 120], ['Lemon dressing', 40], ['Yoghurt sauce', 60], ['Extra roasted vegetables', 100]] as const;
  for (const [index, [name, amountMinor]] of options.entries()) {
    await tx.option.create({ data: { id: demoId(`option:${index}`), name: `${name} (review)`, costMinor: Math.ceil(amountMinor / 2), description: 'Reusable synthetic menu option.' } });
    await tx.optionTierPrice.create({ data: { tierId: TIER_ID, optionId: demoId(`option:${index}`), amountMinor } });
  }
  const dishes = [
    ['Paneer tikka bowl', 850, 'HOT'], ['Lemon herb chicken bowl', 950, 'HOT'], ['Chickpea vegetable curry', 780, 'HOT'],
    ['Tofu stir fry', 820, 'HOT'], ['Rajma rice lunch', 750, 'HOT'], ['Roasted vegetable couscous', 800, 'HOT'],
    ['Greek salad box', 720, 'COLD'], ['Hummus vegetable wrap', 700, 'COLD'], ['Pesto pasta salad', 760, 'COLD'],
    ['Lentil soup and roll', 680, 'HOT'], ['Seasonal fruit yoghurt', 450, 'COLD'], ['Chef tasting platter', 1250, 'AMBIENT'],
  ] as const;
  for (const [index, [name, amountMinor, temperature]] of dishes.entries()) {
    const dishId = demoId(`dish:${index}`), groupId = demoId(`grain:${index}`);
    await tx.dish.create({ data: { id: dishId, sku: `REVIEW-MEAL-${index + 1}`, name, temperature, costMinor: Math.ceil(amountMinor / 2), minQuantity: 1,
      description: 'Freshly prepared boxed lunch. Synthetic reviewer catalogue.', stationId: demoId(`station:${index < 6 || index === 9 ? 0 : index === 11 ? 2 : 1}`) } });
    await tx.dishTierPrice.create({ data: { tierId: TIER_ID, dishId, amountMinor } });
    await tx.menuItem.create({ data: { id: demoId(`menu:${index}`), categoryId: index === 11 ? SECRET_ID : CATEGORY_ID, dishId, sortOrder: index } });
    if (index < 6) {
      await tx.dishOptionGroup.create({ data: { id: groupId, dishId, name: 'Choose grain', required: true, sortOrder: 0 } });
      await tx.groupOption.createMany({ data: [0, 1].map((option, sortOrder) => ({ groupId, optionId: demoId(`option:${option}`), sortOrder })) });
    }
    await tx.dishOptionGroup.create({ data: { id: demoId(`extra:${index}`), dishId, name: 'Optional accompaniment', required: false, sortOrder: 1 } });
    await tx.groupOption.createMany({ data: [2, 3, 4].map((option, sortOrder) => ({ groupId: demoId(`extra:${index}`), optionId: demoId(`option:${option}`), sortOrder })) });
  }
  const names = ['Review Day Meals', 'Northstar Design Studio', 'Cedar Health Centre'];
  const people = ['Asha Rao', 'Arjun Mehta', 'Nisha Shah', 'Kabir Patel', 'Maya Iyer', 'Rohan Das', 'Priya Nair', 'Sameer Sen'];
  for (const [index, companyId] of DEMO_COMPANY_IDS.entries()) {
    const addressId = demoId(`address:${index}`), ownerId = demoId(`employee:${index}:0`), domain = `review-${index}.fernleaf.example`;
    await tx.company.create({ data: { id: companyId, name: names[index], billingName: `${names[index]} Pvt Ltd`, billingEmail: `accounts@${domain}`,
      billingAddress: `${50 + index} Demo Park, Bengaluru 560001`, billingContactName: people[index], phone: '+91 80000 00000',
      workingDays: index === 1 ? [1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5, 6], holidays: [], priceTierId: index === 1 ? COST_TIER_ID : TIER_ID,
      packagingId: packaging?.id, defaultDriverId: driver?.id, deliveryTime: ['12:30', '13:00', '13:30'][index], deliveryMinutes: [45, 60, 30][index],
      driverInstructions: 'Synthetic review stop. Deliver to reception; contact the listed employee.' } });
    await tx.companyDomain.create({ data: { companyId, domain } });
    await tx.companyAddress.create({ data: { id: addressId, companyId, label: 'Reception', line1: `${50 + index} Demo Park`, city: 'Bengaluru', region: 'Karnataka', postalCode: '560001', country: 'India' } });
    for (const [person, name] of people.entries()) await tx.employee.create({ data: { id: demoId(`employee:${index}:${person}`), companyId,
      name, email: `employee${person + 1}@${domain}`, phone: '+91 80000 00000', canChooseAddress: person % 2 === 0, canChangeTime: true, canChangePackaging: person % 2 === 0 } });
    await tx.company.update({ where: { id: companyId }, data: { defaultAddressId: addressId, ownerEmployeeId: ownerId } });
    if (index === 1) await tx.companyHiddenCategory.create({ data: { companyId, categoryId: SECRET_ID } });
  }
}

type Scenario = { date: string; company: number; key: string; time?: string; status: OrderStatus; stage?: DropStatus };

// This is intentionally callable only by the CLI and scheduler, never a HTTP
// controller. All prices/menu choices still use the same authoritative resolver.
export async function seedDemoFixtures(prisma: PrismaClient, now = new Date()): Promise<DemoFixtureResult> {
  const today = kitchenDate(now), result = { date: today, insertedOrders: 0, existingOrders: 0, unavailableScenarios: 0 };
  const database = prisma as PrismaService;
  const menu = new MenuService(database), cutoffs = new CutoffsService(database, new Clock());
  await prisma.$transaction(async (tx) => {
    // One deployment can briefly have several API replicas during a rollout.
    // PostgreSQL serializes the installer and insert-if-missing scenario check.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(704102026)`;
    await installConfiguration(tx);
  }, { timeout: 60_000 });
  const scenarios: Scenario[] = [];
  for (const offset of [-7, -3, -1]) for (let company = 0; company < 3; company++) scenarios.push({ date: shiftedDate(today, offset), company, key: 'history', status: 'DELIVERED', stage: 'DELIVERED' });
  scenarios.push(
    { date: today, company: 0, key: 'kitchen-work', status: 'CONFIRMED', stage: 'AWAITING_KITCHEN' },
    { date: today, company: 0, key: 'dispatch-work', time: '14:15', status: 'CONFIRMED', stage: 'KITCHEN_READY' },
    { date: today, company: 2, key: 'driver-work', status: 'CONFIRMED', stage: 'OUT_FOR_DELIVERY' },
    { date: today, company: 0, key: 'cancelled', time: '15:00', status: 'CANCELLED' },
    { date: today, company: 2, key: 'rejected', time: '15:30', status: 'REJECTED' },
  );
  // Use genuinely future cutoffs for editable examples, even after calendar edits.
  const settings = await prisma.kitchenSettings.findUniqueOrThrow({ where: { id: 1 } });
  for (const offset of [5, 7]) {
    let date = shiftedDate(today, offset);
    for (let shift = 0; shift < 60 && calculateCutoff(date, settings, settings.cutoffWorkingDays, settings.cutoffTime) <= now; shift++) date = shiftedDate(date, 1);
    scenarios.push({ date, company: 0, key: `scheduled-${offset}`, status: offset === 5 ? 'PLACED' : 'DRAFT' });
  }
  for (const scenario of scenarios) {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(704102026)`;
      const company = await tx.company.findUnique({ where: { id: DEMO_COMPANY_IDS[scenario.company] } });
      const admin = await tx.staffUser.findFirst({ where: { email: 'admin@test.com', active: true, role: 'ADMIN' } });
      if (!company?.active || !admin || !isDeliveryDateAllowed(scenario.date, company)) { result.unavailableScenarios++; return; }
      const scenarioKey = `${scenario.date}:${scenario.company}:${scenario.key}`;
      const orderIds = [0, 1].map((member) => demoId(`order:${scenarioKey}:${member}`));
      // Treat a partly modified/deleted scenario as reviewer-owned. Never restore
      // its other members into a stop a reviewer might already have departed.
      if (await tx.order.count({ where: { id: { in: orderIds } } })) { result.existingOrders += 2; return; }
      const quotes = [];
      for (let member = 0; member < 2; member++) {
        const employeeId = demoId(`employee:${scenario.company}:${member + 1}`);
        const employee = await tx.employee.findUnique({ where: { id: employeeId } });
        if (!employee?.active || employee.companyId !== company.id) { result.unavailableScenarios++; return; }
        const preview = await menu.previewInTransaction(tx, employeeId);
        const available = preview.categories.flatMap((category) => category.dishes).filter((dish) => dish.priceMinor !== null);
        if (!available.length) { result.unavailableScenarios++; return; }
        const dish = available[(scenario.company * 2 + member) % available.length];
        const selections = dish.groups.filter((group) => group.required).map((group) => ({ groupId: group.id, optionId: group.options[0].id }));
        const quantity = Math.max(dish.minQuantity ?? 1, member === 0 ? 4 : 6);
        const input: OrderInput = { employeeId, deliveryDate: scenario.date, deliveryTime: scenario.time ?? company.deliveryTime,
          lines: [{ menuItemId: dish.menuItemId, quantity, combinations: [{ quantity, selections }] }] };
        const quote = await quoteInTransaction(tx, input, { override: true }, POLICY, menu, cutoffs);
        quotes.push({ input, quote });
      }
      const first = quotes[0].quote, deliveryAt = new Date(first.delivery.deliveryAt), key = addressKey(first.delivery);
      const completed = scenario.stage && scenario.stage !== 'AWAITING_KITCHEN';
      const departure = new Date(Math.min(minutesBefore(now, 5).getTime(), new Date(first.delivery.plannedDispatchReadyAt).getTime()));
      const readyAt = minutesBefore(departure, 30), startedAt = minutesBefore(readyAt, 40);
      const confirmedAt = minutesBefore(startedAt, 60), placedAt = minutesBefore(confirmedAt, 60);
      const deliveredAt = scenario.status === 'DELIVERED' ? minutesBefore(deliveryAt, 10) : null;
      let dropId: string | undefined;
      if (scenario.stage) {
        dropId = demoId(`drop:${scenarioKey}`);
        // A live order at these company/address/time coordinates owns its stop.
        if (await tx.deliveryDrop.findUnique({ where: { companyId_addressKey_deliveryAt: { companyId: company.id, addressKey: key, deliveryAt } } })) { result.unavailableScenarios++; return; }
        const traveling = ['OUT_FOR_DELIVERY', 'DELIVERED'].includes(scenario.stage), dispatched = traveling || scenario.stage === 'DISPATCH_READY';
        await tx.deliveryDrop.create({ data: { id: dropId, companyId: company.id, deliveryDate: scenario.date, deliveryAt, addressKey: key,
          addressSnapshot: json(first.delivery.address), driverInstructions: first.delivery.driverInstructions, driverId: first.delivery.defaultDriverId,
          status: scenario.stage, kitchenReadyAt: completed ? readyAt : null, dispatchReadyAt: dispatched ? minutesBefore(departure, 10) : null,
          departedAt: traveling ? departure : null, targetAtDeparture: traveling ? deliveryAt : null, deliveredAt, onTime: deliveredAt ? true : null,
          note: scenario.status === 'DELIVERED' ? 'Generated past demo delivery, received at reception.' : null, createdAt: confirmedAt } });
        for (const [type, at] of [['GROUP_CREATED', confirmedAt], ...(completed ? [['KITCHEN_READY', readyAt]] : []), ...(dispatched ? [['DISPATCH_READY', minutesBefore(departure, 10)]] : []),
          ...(traveling ? [['OUT_FOR_DELIVERY', departure]] : []), ...(deliveredAt ? [['DELIVERED', deliveredAt]] : [])] as [string, Date][]) {
          await tx.dropEvent.create({ data: { dropId, actionKey: `demo:${type}`, type, actorName: ACTOR, reason: REASON, details: { demo: true }, createdAt: at } });
        }
      }
      for (const [member, { input, quote }] of quotes.entries()) {
        const orderId = orderIds[member], draft = scenario.status === 'DRAFT', confirmed = ['CONFIRMED', 'DELIVERED'].includes(scenario.status);
        await tx.order.create({ data: { id: orderId, employeeId: quote.employee.id, companyId: quote.company.id, employeeName: quote.employee.name, companyName: quote.company.name,
          employeeSnapshot: json(quote.employee), companySnapshot: json(quote.company), deliveryDate: scenario.date, deliveryAt: new Date(quote.delivery.deliveryAt),
          cutoffAt: new Date(quote.cutoffAt), addressKey: addressKey(quote.delivery), deliverySnapshot: json(quote.delivery), input: json(input),
          purchaseSnapshot: draft ? Prisma.DbNull : json(quote), totalMinor: quote.totalMinor, status: scenario.status, createdById: admin.id, dropId,
          plannedDispatchReadyAt: new Date(quote.delivery.plannedDispatchReadyAt), plannedKitchenReadyAt: new Date(quote.delivery.plannedKitchenReadyAt),
          placedAt: draft ? null : placedAt, confirmedAt: confirmed ? confirmedAt : null, kitchenStartedAt: completed ? startedAt : null,
          kitchenReadyAt: completed ? readyAt : null, deliveredAt, cancelledAt: scenario.status === 'CANCELLED' ? confirmedAt : null,
          rejectedAt: scenario.status === 'REJECTED' ? confirmedAt : null, createdAt: placedAt,
        } });
        for (const [sortOrder, line] of quote.lines.entries()) await tx.orderLine.create({ data: { orderId, dishId: line.dish.id, menuItemId: line.menuItemId,
          sortOrder, quantity: line.quantity, basePriceMinor: line.basePriceMinor, totalMinor: line.totalMinor, dishSnapshot: json(line.dish),
          combinations: { create: line.combinations.map((combination) => ({ canonicalKey: combination.canonicalKey, quantity: combination.quantity,
            unitPriceMinor: combination.unitPriceMinor, totalMinor: combination.totalMinor,
            selections: { create: combination.selections.map((selection, index) => ({ ...selection, sortOrder: index, allergens: json(selection.allergens), dietaryTags: json(selection.dietaryTags) })) },
            ...(confirmed ? { prepUnit: { create: { stationId: line.dish.station?.id, stationName: line.dish.station?.name,
              status: completed ? 'DONE' : 'PENDING', startedAt: completed ? startedAt : null, doneAt: completed ? readyAt : null } } } : {}),
          })) } } });
        if (!draft) await tx.orderRevision.create({ data: { orderId, version: 1, snapshot: json(quote), actorId: admin.id, reason: REASON, createdAt: placedAt } });
        const events: [string, Date][] = [[draft ? 'DRAFT_CREATED' : 'PLACED', placedAt]];
        if (confirmed) events.push(['CONFIRMED', confirmedAt]);
        if (completed) events.push(['KITCHEN_STARTED', startedAt], ['KITCHEN_READY', readyAt]);
        if (scenario.status === 'CANCELLED' || scenario.status === 'REJECTED') events.push([scenario.status, confirmedAt]);
        if (deliveredAt) events.push(['DELIVERED', deliveredAt]);
        for (const [type, at] of events) await tx.orderEvent.create({ data: { orderId, actionKey: `demo:${type}`, type, actorId: admin.id, actorName: ACTOR, reason: REASON,
          details: { demo: true, scenario: scenario.key }, createdAt: at } });
        result.insertedOrders++;
      }
      // Only generated historical purchases are invoiced, never reviewer orders.
      if (scenario.status === 'DELIVERED') {
        const invoiceId = demoId(`invoice:${scenarioKey}`), totalMinor = quotes.reduce((total, entry) => total + entry.quote.totalMinor, 0);
        const paid = scenario.company !== 1;
        await tx.invoice.create({ data: { id: invoiceId, companyId: company.id, companySnapshot: json(first.company), totalMinor,
          paidAmountMinor: paid ? totalMinor : 0, paidAt: paid ? deliveryAt : null, issuedAt: minutesBefore(deliveryAt, 60) } });
        await tx.order.updateMany({ where: { id: { in: orderIds }, invoiceId: null }, data: { invoiceId } });
        if (scenario.company === 2) await tx.billingCredit.create({ data: { invoiceId, orderId: orderIds[0], amountMinor: 100,
          reason: 'Generated demo credit for packaging substitution.', actionKey: `demo-credit:${scenarioKey}`, createdAt: deliveryAt } });
      }
    }, { timeout: 60_000 });
  }
  return result;
}
