-- Fee limits in force when the order was quoted, and the market price / margin behind its rate.
ALTER TABLE "orders" ADD COLUMN "feeMin" DECIMAL(14,2),
ADD COLUMN "feeMax" DECIMAL(14,2),
ADD COLUMN "marketRate" DECIMAL(14,4),
ADD COLUMN "margin" DECIMAL(14,2);
