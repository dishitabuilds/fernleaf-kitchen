-- Portions [Should]: a group optionally sells its options in sizes, each with a surcharge on top of the option price.
CREATE TABLE "GroupPortionSize" (
    "groupId" UUID NOT NULL,
    "portionSizeId" UUID NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    CONSTRAINT "GroupPortionSize_pkey" PRIMARY KEY ("groupId","portionSizeId"),
    CONSTRAINT "GroupPortionSize_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "DishOptionGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GroupPortionSize_portionSizeId_fkey" FOREIGN KEY ("portionSizeId") REFERENCES "ReferenceValue"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "OptionPortionPrice" (
    "groupId" UUID NOT NULL,
    "optionId" UUID NOT NULL,
    "portionSizeId" UUID NOT NULL,
    "surchargeMinor" INTEGER NOT NULL,
    CONSTRAINT "OptionPortionPrice_pkey" PRIMARY KEY ("groupId","optionId","portionSizeId"),
    CONSTRAINT "OptionPortionPrice_surcharge_range" CHECK ("surchargeMinor" >= 0 AND "surchargeMinor" <= 100000000),
    CONSTRAINT "OptionPortionPrice_groupId_optionId_fkey" FOREIGN KEY ("groupId","optionId") REFERENCES "GroupOption"("groupId","optionId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OptionPortionPrice_groupId_portionSizeId_fkey" FOREIGN KEY ("groupId","portionSizeId") REFERENCES "GroupPortionSize"("groupId","portionSizeId") ON DELETE CASCADE ON UPDATE CASCADE
);

ALTER TABLE "SelectionSnapshot" ADD COLUMN "portionSizeId" UUID, ADD COLUMN "portionName" VARCHAR(150), ADD COLUMN "portionSurchargeMinor" INTEGER;
ALTER TABLE "SelectionSnapshot" ADD CONSTRAINT "SelectionSnapshot_portion_complete" CHECK (
  ("portionSizeId" IS NULL AND "portionName" IS NULL AND "portionSurchargeMinor" IS NULL) OR
  ("portionSizeId" IS NOT NULL AND "portionName" IS NOT NULL AND "portionSurchargeMinor" >= 0));
