import type { PrismaClient } from '../src/generated/prisma/client';

// Stable synthetic keys identify the initial configuration fixture.
export const SEED_IDS = {
  defaultTier: '10000000-0000-4000-8000-000000000001',
  costTier: '10000000-0000-4000-8000-000000000002',
  missingTier: '10000000-0000-4000-8000-000000000003',
  company: '20000000-0000-4000-8000-000000000001',
  owner: '30000000-0000-4000-8000-000000000001',
  employee: '30000000-0000-4000-8000-000000000002',
  address: '40000000-0000-4000-8000-000000000001',
  dish: '50000000-0000-4000-8000-000000000001',
  missingDish: '50000000-0000-4000-8000-000000000002',
  secretDish: '50000000-0000-4000-8000-000000000003',
  option: '60000000-0000-4000-8000-000000000001',
  group: '70000000-0000-4000-8000-000000000001',
  category: '80000000-0000-4000-8000-000000000001',
  secretCategory: '80000000-0000-4000-8000-000000000002',
};

export async function seedConfiguration(prisma: PrismaClient): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Configuration is installed atomically once. Later seed runs must preserve
    // deletions as well as edits (for example, a deliberately removed price).
    if (await tx.kitchenSettings.findUnique({ where: { id: 1 } })) return;
    for (const [id,name,rule] of [
      [SEED_IDS.defaultTier, 'Standard', 'MANUAL'],
      [SEED_IDS.costTier, 'Cost plus 15%', 'COST'],
      [SEED_IDS.missingTier, 'Company manual', 'MANUAL'],
    ] as const) await tx.priceTier.upsert({ where: { id }, update: {}, create: { id,name,rule,numerator: rule === 'COST' ? 115 : 1, denominator: rule === 'COST' ? 100 : 1 } });
    await tx.kitchenSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1, defaultPriceTierId: SEED_IDS.defaultTier } });
    for (const [kind,names] of [
      ['ALLERGEN',['Dairy','Peanuts','Gluten']],
      ['DIETARY_TAG',['Vegetarian','Vegan']],
      ['KITCHEN_STATION',['Hot kitchen','Cold kitchen']],
      ['PORTION_SIZE',['Regular','Large']],
      ['PACKAGING_TYPE',['Meal box','Reusable tray']],
      ['PUBLIC_EMAIL_DOMAIN',['gmail.com','yahoo.com','outlook.com','hotmail.com','icloud.com','aol.com','live.com','proton.me','protonmail.com','googlemail.com']],
    ] as const) for (let index=0;index<names.length;index++) await tx.referenceValue.upsert({ where: { kind_name: { kind, name: names[index] } }, update: {}, create: { kind, name: names[index], sortOrder:index } });
    const station = await tx.referenceValue.findUniqueOrThrow({ where: { kind_name:{kind:'KITCHEN_STATION',name:'Hot kitchen'} } });
    const packaging = await tx.referenceValue.findUniqueOrThrow({ where:{kind_name:{kind:'PACKAGING_TYPE',name:'Meal box'}} });
    for (const [id,sku,name,costMinor] of [
      [SEED_IDS.dish,'DEMO-RICE','Roasted vegetable rice box',211],
      [SEED_IDS.missingDish,'DEMO-SOUP','Seasonal soup — awaiting price',180],
      [SEED_IDS.secretDish,'DEMO-SECRET','Chef’s preview lunch',350],
    ] as const) await tx.dish.upsert({ where:{id},update:{},create:{id,sku,name,costMinor,description:'Synthetic configuration example.',temperature:'HOT',stationId:station.id,minQuantity:1} });
    await tx.option.upsert({where:{id:SEED_IDS.option},update:{},create:{id:SEED_IDS.option,name:'Brown rice',costMinor:50,description:'Reusable grain choice.'}});
    await tx.dishOptionGroup.upsert({where:{id:SEED_IDS.group},update:{},create:{id:SEED_IDS.group,dishId:SEED_IDS.dish,name:'Grain',required:true}});
    await tx.groupOption.upsert({where:{groupId_optionId:{groupId:SEED_IDS.group,optionId:SEED_IDS.option}},update:{},create:{groupId:SEED_IDS.group,optionId:SEED_IDS.option}});
    for (const [id,name,secret] of [[SEED_IDS.category,'Lunch boxes',false],[SEED_IDS.secretCategory,'Chef’s preview',true]] as const) await tx.category.upsert({where:{id},update:{},create:{id,name,secret}});
    for (const [categoryId,dishId] of [[SEED_IDS.category,SEED_IDS.dish],[SEED_IDS.category,SEED_IDS.missingDish],[SEED_IDS.secretCategory,SEED_IDS.secretDish]]) await tx.menuItem.upsert({where:{categoryId_dishId:{categoryId,dishId}},update:{},create:{categoryId,dishId}});
    for (const [dishId,amountMinor] of [[SEED_IDS.dish,800],[SEED_IDS.secretDish,900]] as const) await tx.dishTierPrice.upsert({where:{tierId_dishId:{tierId:SEED_IDS.defaultTier,dishId}},update:{},create:{tierId:SEED_IDS.defaultTier,dishId,amountMinor}});
    await tx.optionTierPrice.upsert({where:{tierId_optionId:{tierId:SEED_IDS.defaultTier,optionId:SEED_IDS.option}},update:{},create:{tierId:SEED_IDS.defaultTier,optionId:SEED_IDS.option,amountMinor:80}});
    const driver = await tx.staffUser.findUnique({where:{email:'driver@test.com'}});
    await tx.company.upsert({where:{id:SEED_IDS.company},update:{},create:{id:SEED_IDS.company,name:'Fernleaf Demo Labs',billingName:'Fernleaf Demo Labs',billingEmail:'billing@fernleaf-demo.example',billingContactName:'Demo accounts team',billingAddress:'42 Example Street, Bengaluru',packagingId:packaging.id,defaultDriverId:driver?.role === 'DRIVER' && driver.active ? driver.id : null,workingDays:[0,1,2,3,4,5,6]}});
    await tx.companyDomain.upsert({where:{domain:'fernleaf-demo.example'},update:{},create:{companyId:SEED_IDS.company,domain:'fernleaf-demo.example'}});
    await tx.companyAddress.upsert({where:{id:SEED_IDS.address},update:{},create:{id:SEED_IDS.address,companyId:SEED_IDS.company,label:'Main office',line1:'42 Example Street',city:'Bengaluru',region:'Karnataka',postalCode:'560001',country:'India'}});
    for (const [id,name,email] of [[SEED_IDS.owner,'Demo company owner','owner@fernleaf-demo.example'],[SEED_IDS.employee,'Demo employee','employee@fernleaf-demo.example']]) await tx.employee.upsert({where:{id},update:{},create:{id,companyId:SEED_IDS.company,name,email,canChooseAddress:true,canChangeTime:true,canChangePackaging:true}});
    // Fill missing setup pointers only; never reset an existing owner/default address.
    await tx.company.updateMany({where:{id:SEED_IDS.company,ownerEmployeeId:null},data:{ownerEmployeeId:SEED_IDS.owner}});
    await tx.company.updateMany({where:{id:SEED_IDS.company,defaultAddressId:null},data:{defaultAddressId:SEED_IDS.address}});
  });
}
