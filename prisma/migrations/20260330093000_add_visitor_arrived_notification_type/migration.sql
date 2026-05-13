DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumlabel = 'VISITOR_ARRIVED'
      AND enumtypid = '"NotificationType"'::regtype
  ) THEN
    ALTER TYPE "NotificationType" ADD VALUE 'VISITOR_ARRIVED' AFTER 'REQUEST_CANCELED';
  END IF;
END $$;
