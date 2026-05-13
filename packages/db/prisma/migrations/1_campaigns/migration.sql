-- AlterTable: contact consent controls for outbound campaigns
ALTER TABLE "contact"
  ADD COLUMN "callConsentStatus" TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN "callConsentSource" TEXT,
  ADD COLUMN "callConsentAt" TIMESTAMP(3),
  ADD COLUMN "doNotCallAt" TIMESTAMP(3),
  ADD COLUMN "doNotCallReason" TEXT;

-- CreateTable: campaign
CREATE TABLE "campaign" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "phoneNumberId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "openingMessage" TEXT NOT NULL,
    "campaignPrompt" TEXT NOT NULL DEFAULT '',
    "maxConcurrency" INTEGER NOT NULL DEFAULT 2,
    "maxAttempts" INTEGER NOT NULL DEFAULT 2,
    "retryDelayMinutes" INTEGER NOT NULL DEFAULT 30,
    "callTimeoutSeconds" INTEGER NOT NULL DEFAULT 30,
    "quietHoursStart" TEXT NOT NULL DEFAULT '09:00',
    "quietHoursEnd" TEXT NOT NULL DEFAULT '18:00',
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Addis_Ababa',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable: campaign_recipient
CREATE TABLE "campaign_recipient" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "contactId" TEXT,
    "phoneNumber" TEXT NOT NULL,
    "displayName" TEXT,
    "email" TEXT,
    "variables" JSONB,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "deliveryStatus" TEXT,
    "outcome" TEXT,
    "outcomeNotes" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "lastAttemptAt" TIMESTAMP(3),
    "lastCallId" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_recipient_pkey" PRIMARY KEY ("id")
);

-- AlterTable: calls can belong to outbound campaigns
ALTER TABLE "call"
  ADD COLUMN "campaignId" TEXT,
  ADD COLUMN "campaignRecipientId" TEXT;

-- CreateIndex
CREATE INDEX "campaign_organizationId_idx" ON "campaign"("organizationId");
CREATE INDEX "campaign_agentId_idx" ON "campaign"("agentId");
CREATE INDEX "campaign_phoneNumberId_idx" ON "campaign"("phoneNumberId");
CREATE INDEX "campaign_status_idx" ON "campaign"("status");

CREATE UNIQUE INDEX "campaign_recipient_campaignId_phoneNumber_key" ON "campaign_recipient"("campaignId", "phoneNumber");
CREATE INDEX "campaign_recipient_organizationId_idx" ON "campaign_recipient"("organizationId");
CREATE INDEX "campaign_recipient_campaignId_idx" ON "campaign_recipient"("campaignId");
CREATE INDEX "campaign_recipient_contactId_idx" ON "campaign_recipient"("contactId");
CREATE INDEX "campaign_recipient_status_idx" ON "campaign_recipient"("status");
CREATE INDEX "campaign_recipient_nextAttemptAt_idx" ON "campaign_recipient"("nextAttemptAt");

CREATE INDEX "call_campaignId_idx" ON "call"("campaignId");
CREATE INDEX "call_campaignRecipientId_idx" ON "call"("campaignRecipientId");

-- AddForeignKey
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_phoneNumberId_fkey" FOREIGN KEY ("phoneNumberId") REFERENCES "phone_number"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "campaign_recipient" ADD CONSTRAINT "campaign_recipient_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "campaign_recipient" ADD CONSTRAINT "campaign_recipient_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "campaign_recipient" ADD CONSTRAINT "campaign_recipient_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "call" ADD CONSTRAINT "call_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "call" ADD CONSTRAINT "call_campaignRecipientId_fkey" FOREIGN KEY ("campaignRecipientId") REFERENCES "campaign_recipient"("id") ON DELETE SET NULL ON UPDATE CASCADE;
