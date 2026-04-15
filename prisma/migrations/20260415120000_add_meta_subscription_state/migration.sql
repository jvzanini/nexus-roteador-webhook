CREATE TYPE "MetaSubscriptionStatus" AS ENUM ('not_configured','pending','active','stale','error');

ALTER TABLE "company_credentials"
  ADD COLUMN "meta_system_user_token" TEXT,
  ADD COLUMN "meta_subscription_status" "MetaSubscriptionStatus" NOT NULL DEFAULT 'not_configured',
  ADD COLUMN "meta_subscribed_at" TIMESTAMP(3),
  ADD COLUMN "meta_subscription_error" TEXT,
  ADD COLUMN "meta_subscribed_fields" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "meta_subscribed_callback_url" TEXT;
