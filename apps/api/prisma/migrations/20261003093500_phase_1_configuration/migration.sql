-- CreateEnum
CREATE TYPE "ReferenceKind" AS ENUM ('ALLERGEN', 'DIETARY_TAG', 'KITCHEN_STATION', 'PORTION_SIZE', 'PACKAGING_TYPE', 'PUBLIC_EMAIL_DOMAIN');

-- CreateEnum
CREATE TYPE "FoodTemperature" AS ENUM ('HOT', 'COLD', 'AMBIENT');

-- CreateEnum
CREATE TYPE "PriceRule" AS ENUM ('MANUAL', 'COST', 'REFERENCE');

-- CreateTable
CREATE TABLE "ReferenceValue" (
    "id" UUID NOT NULL,
    "kind" "ReferenceKind" NOT NULL,
    "name" VARCHAR(254) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ReferenceValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dish" (
    "id" UUID NOT NULL,
    "sku" VARCHAR(80) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "description" VARCHAR(2000) NOT NULL DEFAULT '',
    "imageUrl" VARCHAR(2048),
    "temperature" "FoodTemperature" NOT NULL DEFAULT 'HOT',
    "costMinor" INTEGER NOT NULL DEFAULT 0,
    "stationId" UUID,
    "minQuantity" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Dish_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Option" (
    "id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "description" VARCHAR(2000) NOT NULL DEFAULT '',
    "costMinor" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Option_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DishAllergen" (
    "dishId" UUID NOT NULL,
    "referenceId" UUID NOT NULL,

    CONSTRAINT "DishAllergen_pkey" PRIMARY KEY ("dishId","referenceId")
);

-- CreateTable
CREATE TABLE "DishDietaryTag" (
    "dishId" UUID NOT NULL,
    "referenceId" UUID NOT NULL,

    CONSTRAINT "DishDietaryTag_pkey" PRIMARY KEY ("dishId","referenceId")
);

-- CreateTable
CREATE TABLE "OptionAllergen" (
    "optionId" UUID NOT NULL,
    "referenceId" UUID NOT NULL,

    CONSTRAINT "OptionAllergen_pkey" PRIMARY KEY ("optionId","referenceId")
);

-- CreateTable
CREATE TABLE "OptionDietaryTag" (
    "optionId" UUID NOT NULL,
    "referenceId" UUID NOT NULL,

    CONSTRAINT "OptionDietaryTag_pkey" PRIMARY KEY ("optionId","referenceId")
);

-- CreateTable
CREATE TABLE "DishOptionGroup" (
    "id" UUID NOT NULL,
    "dishId" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DishOptionGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupOption" (
    "groupId" UUID NOT NULL,
    "optionId" UUID NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "GroupOption_pkey" PRIMARY KEY ("groupId","optionId")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "secret" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuItem" (
    "id" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "dishId" UUID NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceTier" (
    "id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "rule" "PriceRule" NOT NULL DEFAULT 'MANUAL',
    "numerator" INTEGER NOT NULL DEFAULT 1,
    "denominator" INTEGER NOT NULL DEFAULT 1,
    "referenceTierId" UUID,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PriceTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DishTierPrice" (
    "tierId" UUID NOT NULL,
    "dishId" UUID NOT NULL,
    "amountMinor" INTEGER NOT NULL,

    CONSTRAINT "DishTierPrice_pkey" PRIMARY KEY ("tierId","dishId")
);

-- CreateTable
CREATE TABLE "OptionTierPrice" (
    "tierId" UUID NOT NULL,
    "optionId" UUID NOT NULL,
    "amountMinor" INTEGER NOT NULL,

    CONSTRAINT "OptionTierPrice_pkey" PRIMARY KEY ("tierId","optionId")
);

-- CreateTable
CREATE TABLE "KitchenSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "timezone" VARCHAR(40) NOT NULL DEFAULT 'Asia/Kolkata',
    "currency" CHAR(3) NOT NULL DEFAULT 'USD',
    "defaultPriceTierId" UUID NOT NULL,
    "workingDays" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5]::INTEGER[],
    "holidays" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cutoffTime" VARCHAR(5) NOT NULL DEFAULT '16:00',
    "cutoffWorkingDays" INTEGER NOT NULL DEFAULT 2,
    "riskThresholdMinutes" INTEGER NOT NULL DEFAULT 15,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "KitchenSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "billingName" VARCHAR(150) NOT NULL,
    "billingEmail" VARCHAR(254) NOT NULL,
    "billingAddress" VARCHAR(1000) NOT NULL,
    "billingContactName" VARCHAR(150) NOT NULL,
    "phone" VARCHAR(40),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "ownerEmployeeId" UUID,
    "defaultAddressId" UUID,
    "priceTierId" UUID,
    "deliveryTime" VARCHAR(5) NOT NULL DEFAULT '12:30',
    "deliveryMinutes" INTEGER NOT NULL DEFAULT 60,
    "packagingId" UUID,
    "defaultDriverId" UUID,
    "driverInstructions" VARCHAR(2000) NOT NULL DEFAULT '',
    "workingDays" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5]::INTEGER[],
    "holidays" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyDomain" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "domain" VARCHAR(254) NOT NULL,

    CONSTRAINT "CompanyDomain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyAddress" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "label" VARCHAR(100) NOT NULL,
    "line1" VARCHAR(250) NOT NULL,
    "line2" VARCHAR(250),
    "city" VARCHAR(100) NOT NULL,
    "region" VARCHAR(100) NOT NULL,
    "postalCode" VARCHAR(30) NOT NULL,
    "country" VARCHAR(100) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CompanyAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "phone" VARCHAR(40),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "canChooseAddress" BOOLEAN NOT NULL DEFAULT false,
    "canChangeTime" BOOLEAN NOT NULL DEFAULT false,
    "canChangePackaging" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeAllergen" (
    "employeeId" UUID NOT NULL,
    "referenceId" UUID NOT NULL,

    CONSTRAINT "EmployeeAllergen_pkey" PRIMARY KEY ("employeeId","referenceId")
);

-- CreateTable
CREATE TABLE "EmployeeDietaryTag" (
    "employeeId" UUID NOT NULL,
    "referenceId" UUID NOT NULL,

    CONSTRAINT "EmployeeDietaryTag_pkey" PRIMARY KEY ("employeeId","referenceId")
);

-- CreateTable
CREATE TABLE "CompanyHiddenCategory" (
    "companyId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,

    CONSTRAINT "CompanyHiddenCategory_pkey" PRIMARY KEY ("companyId","categoryId")
);

-- CreateTable
CREATE TABLE "CompanyHiddenMenuItem" (
    "companyId" UUID NOT NULL,
    "menuItemId" UUID NOT NULL,

    CONSTRAINT "CompanyHiddenMenuItem_pkey" PRIMARY KEY ("companyId","menuItemId")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReferenceValue_kind_name_key" ON "ReferenceValue"("kind", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Dish_sku_key" ON "Dish"("sku");

-- CreateIndex
CREATE INDEX "DishOptionGroup_dishId_sortOrder_idx" ON "DishOptionGroup"("dishId", "sortOrder");

-- CreateIndex
CREATE INDEX "MenuItem_categoryId_sortOrder_idx" ON "MenuItem"("categoryId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "MenuItem_categoryId_dishId_key" ON "MenuItem"("categoryId", "dishId");

-- CreateIndex
CREATE UNIQUE INDEX "PriceTier_name_key" ON "PriceTier"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Company_ownerEmployeeId_id_key" ON "Company"("ownerEmployeeId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Company_defaultAddressId_id_key" ON "Company"("defaultAddressId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyDomain_domain_key" ON "CompanyDomain"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyAddress_id_companyId_key" ON "CompanyAddress"("id", "companyId");

-- CreateIndex
CREATE INDEX "Employee_companyId_active_idx" ON "Employee"("companyId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_id_companyId_key" ON "Employee"("id", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_companyId_email_key" ON "Employee"("companyId", "email");

-- AddForeignKey
ALTER TABLE "Dish" ADD CONSTRAINT "Dish_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "ReferenceValue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DishAllergen" ADD CONSTRAINT "DishAllergen_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "Dish"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DishAllergen" ADD CONSTRAINT "DishAllergen_referenceId_fkey" FOREIGN KEY ("referenceId") REFERENCES "ReferenceValue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DishDietaryTag" ADD CONSTRAINT "DishDietaryTag_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "Dish"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DishDietaryTag" ADD CONSTRAINT "DishDietaryTag_referenceId_fkey" FOREIGN KEY ("referenceId") REFERENCES "ReferenceValue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptionAllergen" ADD CONSTRAINT "OptionAllergen_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "Option"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptionAllergen" ADD CONSTRAINT "OptionAllergen_referenceId_fkey" FOREIGN KEY ("referenceId") REFERENCES "ReferenceValue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptionDietaryTag" ADD CONSTRAINT "OptionDietaryTag_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "Option"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptionDietaryTag" ADD CONSTRAINT "OptionDietaryTag_referenceId_fkey" FOREIGN KEY ("referenceId") REFERENCES "ReferenceValue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DishOptionGroup" ADD CONSTRAINT "DishOptionGroup_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "Dish"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupOption" ADD CONSTRAINT "GroupOption_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "DishOptionGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupOption" ADD CONSTRAINT "GroupOption_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "Option"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "Dish"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceTier" ADD CONSTRAINT "PriceTier_referenceTierId_fkey" FOREIGN KEY ("referenceTierId") REFERENCES "PriceTier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DishTierPrice" ADD CONSTRAINT "DishTierPrice_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "PriceTier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DishTierPrice" ADD CONSTRAINT "DishTierPrice_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "Dish"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptionTierPrice" ADD CONSTRAINT "OptionTierPrice_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "PriceTier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptionTierPrice" ADD CONSTRAINT "OptionTierPrice_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "Option"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitchenSettings" ADD CONSTRAINT "KitchenSettings_defaultPriceTierId_fkey" FOREIGN KEY ("defaultPriceTierId") REFERENCES "PriceTier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_ownerEmployeeId_id_fkey" FOREIGN KEY ("ownerEmployeeId", "id") REFERENCES "Employee"("id", "companyId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_defaultAddressId_id_fkey" FOREIGN KEY ("defaultAddressId", "id") REFERENCES "CompanyAddress"("id", "companyId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_priceTierId_fkey" FOREIGN KEY ("priceTierId") REFERENCES "PriceTier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_packagingId_fkey" FOREIGN KEY ("packagingId") REFERENCES "ReferenceValue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_defaultDriverId_fkey" FOREIGN KEY ("defaultDriverId") REFERENCES "StaffUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyDomain" ADD CONSTRAINT "CompanyDomain_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyAddress" ADD CONSTRAINT "CompanyAddress_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeAllergen" ADD CONSTRAINT "EmployeeAllergen_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeAllergen" ADD CONSTRAINT "EmployeeAllergen_referenceId_fkey" FOREIGN KEY ("referenceId") REFERENCES "ReferenceValue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDietaryTag" ADD CONSTRAINT "EmployeeDietaryTag_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDietaryTag" ADD CONSTRAINT "EmployeeDietaryTag_referenceId_fkey" FOREIGN KEY ("referenceId") REFERENCES "ReferenceValue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyHiddenCategory" ADD CONSTRAINT "CompanyHiddenCategory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyHiddenCategory" ADD CONSTRAINT "CompanyHiddenCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyHiddenMenuItem" ADD CONSTRAINT "CompanyHiddenMenuItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyHiddenMenuItem" ADD CONSTRAINT "CompanyHiddenMenuItem_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Bounds, canonical keys and structural rules apply even outside the HTTP DTOs.
ALTER TABLE "Dish" ADD CONSTRAINT "Dish_money_quantity" CHECK ("costMinor" >= 0 AND ("minQuantity" IS NULL OR "minQuantity" > 0));
ALTER TABLE "Dish" ADD CONSTRAINT "Dish_sku_normalized" CHECK ("sku" = upper(btrim("sku")) AND length("sku") > 0);
ALTER TABLE "Option" ADD CONSTRAINT "Option_cost_nonnegative" CHECK ("costMinor" >= 0);
ALTER TABLE "DishTierPrice" ADD CONSTRAINT "Dish_price_nonnegative" CHECK ("amountMinor" >= 0);
ALTER TABLE "OptionTierPrice" ADD CONSTRAINT "Option_price_nonnegative" CHECK ("amountMinor" >= 0);
ALTER TABLE "PriceTier" ADD CONSTRAINT "Tier_rule_valid" CHECK (
  "numerator" BETWEEN 0 AND 1000000 AND "denominator" BETWEEN 1 AND 1000000
  AND (("rule" = 'REFERENCE' AND "referenceTierId" IS NOT NULL AND "referenceTierId" <> "id")
    OR ("rule" <> 'REFERENCE' AND "referenceTierId" IS NULL))
);
ALTER TABLE "KitchenSettings" ADD CONSTRAINT "Settings_singleton" CHECK ("id" = 1 AND "timezone" = 'Asia/Kolkata' AND "currency" = 'USD');
ALTER TABLE "KitchenSettings" ADD CONSTRAINT "Settings_calendar_bounds" CHECK (
  cardinality("workingDays") BETWEEN 1 AND 7 AND "workingDays" <@ ARRAY[0,1,2,3,4,5,6]
  AND "cutoffWorkingDays" BETWEEN 0 AND 30 AND "riskThresholdMinutes" BETWEEN 0 AND 1440
  AND "cutoffTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND "version" > 0
);
ALTER TABLE "Company" ADD CONSTRAINT "Company_calendar_delivery_bounds" CHECK (
  cardinality("workingDays") BETWEEN 1 AND 7 AND "workingDays" <@ ARRAY[0,1,2,3,4,5,6]
  AND "deliveryMinutes" BETWEEN 0 AND 1440 AND "deliveryTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND "version" > 0
);
ALTER TABLE "CompanyDomain" ADD CONSTRAINT "CompanyDomain_normalized" CHECK ("domain" = lower(btrim("domain")));
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_email_normalized" CHECK ("email" = lower(btrim("email")));
ALTER TABLE "ReferenceValue" ADD CONSTRAINT "Reference_order_nonnegative" CHECK ("sortOrder" >= 0);
ALTER TABLE "DishOptionGroup" ADD CONSTRAINT "Group_order_nonnegative" CHECK ("sortOrder" >= 0);
ALTER TABLE "GroupOption" ADD CONSTRAINT "Choice_order_nonnegative" CHECK ("sortOrder" >= 0);
ALTER TABLE "Category" ADD CONSTRAINT "Category_order_nonnegative" CHECK ("sortOrder" >= 0);
ALTER TABLE "MenuItem" ADD CONSTRAINT "Item_order_nonnegative" CHECK ("sortOrder" >= 0);
