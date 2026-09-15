-- Record what the follow check concluded and why, so a fail-open can be audited.
ALTER TABLE "FollowGate" ADD COLUMN "lastFollows" BOOLEAN;
ALTER TABLE "FollowGate" ADD COLUMN "lastDetail" TEXT;
