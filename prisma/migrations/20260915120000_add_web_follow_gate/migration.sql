-- Web follow gate: verify the follow on a page instead of in the DM thread.
ALTER TABLE "Automation" ADD COLUMN "followGateWeb" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "FollowGate" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "igsid" TEXT NOT NULL,
    "commenterName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastCheckedAt" TIMESTAMP(3),
    "checkCount" INTEGER NOT NULL DEFAULT 0,
    "passedAt" TIMESTAMP(3),

    CONSTRAINT "FollowGate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FollowGate_token_key" ON "FollowGate"("token");
CREATE INDEX "FollowGate_automationId_idx" ON "FollowGate"("automationId");
CREATE UNIQUE INDEX "FollowGate_automationId_igsid_key" ON "FollowGate"("automationId", "igsid");

ALTER TABLE "FollowGate" ADD CONSTRAINT "FollowGate_automationId_fkey"
    FOREIGN KEY ("automationId") REFERENCES "Automation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
