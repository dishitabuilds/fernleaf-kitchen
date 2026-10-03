import type { PrismaClient } from '../../apps/api/src/generated/prisma/client';
import { seedUsers } from '../../apps/api/prisma/seed-users';
import { seedConfiguration } from '../../apps/api/prisma/seed-configuration';

export async function clearConfiguration(prisma: PrismaClient): Promise<void> {
  await prisma.company.updateMany({data:{ownerEmployeeId:null,defaultAddressId:null}});
  await prisma.companyHiddenCategory.deleteMany(); await prisma.companyHiddenMenuItem.deleteMany();
  await prisma.employeeAllergen.deleteMany(); await prisma.employeeDietaryTag.deleteMany();
  await prisma.companyDomain.deleteMany(); await prisma.companyAddress.deleteMany(); await prisma.employee.deleteMany(); await prisma.company.deleteMany();
  await prisma.kitchenSettings.deleteMany();
  await prisma.dishTierPrice.deleteMany(); await prisma.optionTierPrice.deleteMany();
  await prisma.priceTier.updateMany({data:{rule:'MANUAL',referenceTierId:null}}); await prisma.priceTier.deleteMany();
  await prisma.menuItem.deleteMany(); await prisma.category.deleteMany();
  await prisma.groupOption.deleteMany(); await prisma.dishOptionGroup.deleteMany();
  await prisma.dishAllergen.deleteMany(); await prisma.dishDietaryTag.deleteMany(); await prisma.optionAllergen.deleteMany(); await prisma.optionDietaryTag.deleteMany();
  await prisma.dish.deleteMany(); await prisma.option.deleteMany(); await prisma.referenceValue.deleteMany();
}

export async function resetPhase1Fixture(prisma: PrismaClient): Promise<void> {
  await clearConfiguration(prisma);
  await prisma.session.deleteMany(); await prisma.staffUser.deleteMany();
  await seedUsers(prisma); await seedConfiguration(prisma);
}
