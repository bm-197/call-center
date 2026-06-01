-- CreateTable: integration_connection
CREATE TABLE "integration_connection" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'inactive',
    "config" JSONB,
    "credentials" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_connection_pkey" PRIMARY KEY ("id")
);

-- CreateTable: agent_tool_grant
CREATE TABLE "agent_tool_grant" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'enabled',
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_tool_grant_pkey" PRIMARY KEY ("id")
);

-- CreateTable: tool_invocation
CREATE TABLE "tool_invocation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "agentId" TEXT,
    "callId" TEXT,
    "contactId" TEXT,
    "toolName" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'voice',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "arguments" JSONB,
    "result" JSONB,
    "errorMessage" TEXT,
    "confirmationId" TEXT,
    "externalProvider" TEXT,
    "externalId" TEXT,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tool_invocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable: pending_tool_confirmation
CREATE TABLE "pending_tool_confirmation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "callId" TEXT,
    "toolName" TEXT NOT NULL,
    "arguments" JSONB NOT NULL,
    "prompt" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "invocationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pending_tool_confirmation_pkey" PRIMARY KEY ("id")
);

-- CreateTable: appointment
CREATE TABLE "appointment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "agentId" TEXT,
    "callId" TEXT,
    "contactId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Addis_Ababa',
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "externalProvider" TEXT,
    "externalId" TEXT,
    "externalStatus" TEXT NOT NULL DEFAULT 'not_configured',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable: auth_agent_host
CREATE TABLE "auth_agent_host" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "userId" TEXT,
    "defaultCapabilities" TEXT,
    "publicKey" TEXT,
    "kid" TEXT,
    "jwksUrl" TEXT,
    "enrollmentTokenHash" TEXT,
    "enrollmentTokenExpiresAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "activatedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_agent_host_pkey" PRIMARY KEY ("id")
);

-- CreateTable: auth_agent
CREATE TABLE "auth_agent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "userId" TEXT,
    "hostId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "mode" TEXT NOT NULL DEFAULT 'delegated',
    "publicKey" TEXT NOT NULL,
    "kid" TEXT,
    "jwksUrl" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable: auth_agent_capability_grant
CREATE TABLE "auth_agent_capability_grant" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "capability" TEXT NOT NULL,
    "deniedBy" TEXT,
    "grantedBy" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reason" TEXT,
    "constraints" TEXT,

    CONSTRAINT "auth_agent_capability_grant_pkey" PRIMARY KEY ("id")
);

-- CreateTable: auth_approval_request
CREATE TABLE "auth_approval_request" (
    "id" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "agentId" TEXT,
    "hostId" TEXT,
    "userId" TEXT,
    "capabilities" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "userCodeHash" TEXT,
    "loginHint" TEXT,
    "bindingMessage" TEXT,
    "clientNotificationToken" TEXT,
    "clientNotificationEndpoint" TEXT,
    "deliveryMode" TEXT,
    "interval" INTEGER NOT NULL,
    "lastPolledAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_approval_request_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "integration_connection_organizationId_provider_name_key" ON "integration_connection"("organizationId", "provider", "name");
CREATE INDEX "integration_connection_organizationId_idx" ON "integration_connection"("organizationId");
CREATE INDEX "integration_connection_provider_idx" ON "integration_connection"("provider");
CREATE INDEX "integration_connection_status_idx" ON "integration_connection"("status");

CREATE UNIQUE INDEX "agent_tool_grant_agentId_toolName_key" ON "agent_tool_grant"("agentId", "toolName");
CREATE INDEX "agent_tool_grant_organizationId_idx" ON "agent_tool_grant"("organizationId");
CREATE INDEX "agent_tool_grant_agentId_idx" ON "agent_tool_grant"("agentId");
CREATE INDEX "agent_tool_grant_toolName_idx" ON "agent_tool_grant"("toolName");

CREATE INDEX "tool_invocation_organizationId_idx" ON "tool_invocation"("organizationId");
CREATE INDEX "tool_invocation_agentId_idx" ON "tool_invocation"("agentId");
CREATE INDEX "tool_invocation_callId_idx" ON "tool_invocation"("callId");
CREATE INDEX "tool_invocation_contactId_idx" ON "tool_invocation"("contactId");
CREATE INDEX "tool_invocation_toolName_idx" ON "tool_invocation"("toolName");
CREATE INDEX "tool_invocation_status_idx" ON "tool_invocation"("status");

CREATE INDEX "pending_tool_confirmation_organizationId_idx" ON "pending_tool_confirmation"("organizationId");
CREATE INDEX "pending_tool_confirmation_agentId_idx" ON "pending_tool_confirmation"("agentId");
CREATE INDEX "pending_tool_confirmation_callId_idx" ON "pending_tool_confirmation"("callId");
CREATE INDEX "pending_tool_confirmation_status_idx" ON "pending_tool_confirmation"("status");
CREATE INDEX "pending_tool_confirmation_expiresAt_idx" ON "pending_tool_confirmation"("expiresAt");

CREATE INDEX "appointment_organizationId_idx" ON "appointment"("organizationId");
CREATE INDEX "appointment_agentId_idx" ON "appointment"("agentId");
CREATE INDEX "appointment_callId_idx" ON "appointment"("callId");
CREATE INDEX "appointment_contactId_idx" ON "appointment"("contactId");
CREATE INDEX "appointment_startsAt_idx" ON "appointment"("startsAt");

CREATE INDEX "auth_agent_host_userId_idx" ON "auth_agent_host"("userId");
CREATE INDEX "auth_agent_host_kid_idx" ON "auth_agent_host"("kid");
CREATE INDEX "auth_agent_host_enrollmentTokenHash_idx" ON "auth_agent_host"("enrollmentTokenHash");
CREATE INDEX "auth_agent_host_status_idx" ON "auth_agent_host"("status");

CREATE INDEX "auth_agent_userId_idx" ON "auth_agent"("userId");
CREATE INDEX "auth_agent_hostId_idx" ON "auth_agent"("hostId");
CREATE INDEX "auth_agent_status_idx" ON "auth_agent"("status");
CREATE INDEX "auth_agent_kid_idx" ON "auth_agent"("kid");

CREATE INDEX "auth_agent_capability_grant_agentId_idx" ON "auth_agent_capability_grant"("agentId");
CREATE INDEX "auth_agent_capability_grant_capability_idx" ON "auth_agent_capability_grant"("capability");
CREATE INDEX "auth_agent_capability_grant_grantedBy_idx" ON "auth_agent_capability_grant"("grantedBy");
CREATE INDEX "auth_agent_capability_grant_status_idx" ON "auth_agent_capability_grant"("status");

CREATE INDEX "auth_approval_request_agentId_idx" ON "auth_approval_request"("agentId");
CREATE INDEX "auth_approval_request_hostId_idx" ON "auth_approval_request"("hostId");
CREATE INDEX "auth_approval_request_userId_idx" ON "auth_approval_request"("userId");
CREATE INDEX "auth_approval_request_status_idx" ON "auth_approval_request"("status");

-- AddForeignKey
ALTER TABLE "integration_connection" ADD CONSTRAINT "integration_connection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "agent_tool_grant" ADD CONSTRAINT "agent_tool_grant_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_tool_grant" ADD CONSTRAINT "agent_tool_grant_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tool_invocation" ADD CONSTRAINT "tool_invocation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tool_invocation" ADD CONSTRAINT "tool_invocation_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tool_invocation" ADD CONSTRAINT "tool_invocation_callId_fkey" FOREIGN KEY ("callId") REFERENCES "call"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "pending_tool_confirmation" ADD CONSTRAINT "pending_tool_confirmation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pending_tool_confirmation" ADD CONSTRAINT "pending_tool_confirmation_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pending_tool_confirmation" ADD CONSTRAINT "pending_tool_confirmation_callId_fkey" FOREIGN KEY ("callId") REFERENCES "call"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "appointment" ADD CONSTRAINT "appointment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_callId_fkey" FOREIGN KEY ("callId") REFERENCES "call"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
