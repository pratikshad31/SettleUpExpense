-- Existing idempotency rows have no request hash and use a globally scoped key.
-- They are short-lived cache entries, so discard them when moving to scoped reservations.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.idempotency_records'::regclass
      AND conname = 'idempotency_records_idempotency_key_key'
  ) THEN
    DELETE FROM idempotency_records;
    ALTER TABLE idempotency_records
      DROP CONSTRAINT idempotency_records_idempotency_key_key;
  END IF;
END
$$;

ALTER TABLE idempotency_records
  ADD COLUMN IF NOT EXISTS request_hash CHAR(64);

ALTER TABLE idempotency_records
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'complete';

ALTER TABLE idempotency_records
  ALTER COLUMN response_code DROP NOT NULL,
  ALTER COLUMN response_body DROP NOT NULL,
  ALTER COLUMN status SET DEFAULT 'in_progress';

UPDATE idempotency_records
SET request_hash = repeat('0', 64)
WHERE request_hash IS NULL;

ALTER TABLE idempotency_records
  ALTER COLUMN request_hash SET NOT NULL;

ALTER TABLE idempotency_records
  DROP CONSTRAINT IF EXISTS idempotency_records_status_check,
  DROP CONSTRAINT IF EXISTS idempotency_records_check;

ALTER TABLE idempotency_records
  ADD CONSTRAINT idempotency_records_status_check
    CHECK (status IN ('in_progress', 'complete')),
  ADD CONSTRAINT idempotency_records_check
    CHECK (
      (status = 'in_progress' AND response_code IS NULL AND response_body IS NULL)
      OR (status = 'complete' AND response_code IS NOT NULL AND response_body IS NOT NULL)
    );

DROP INDEX IF EXISTS idx_idempotency_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_idempotency_user_route_key
  ON idempotency_records(user_id, route, idempotency_key);
