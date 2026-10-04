-- Optional driver delivery photo (validated image bytes, served by a dedicated endpoint)
ALTER TABLE "DeliveryDrop" ADD COLUMN "photo" BYTEA, ADD COLUMN "photoMimeType" VARCHAR(50);
ALTER TABLE "DeliveryDrop" ADD CONSTRAINT "DeliveryDrop_photo_pair" CHECK (("photo" IS NULL) = ("photoMimeType" IS NULL));
