ALTER TABLE "company_credentials"
  ADD COLUMN "access_token_expires_at" TIMESTAMP(3),
  ADD COLUMN "connected_via_embedded_signup" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "connected_at" TIMESTAMP(3);
