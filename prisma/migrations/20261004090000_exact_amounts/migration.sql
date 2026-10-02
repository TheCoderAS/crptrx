-- Orders now use exactly the amount the user typed, so several open orders may
-- share an amount. Payments are told apart by sender wallet or TxID instead.
DROP INDEX IF EXISTS "orders_open_amount_unique";
