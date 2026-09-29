-- One bank reference (UTR) can only settle one order, even if two admins save at the same moment.
CREATE UNIQUE INDEX "orders_utr_unique" ON "orders" ("utr") WHERE "utr" IS NOT NULL;
