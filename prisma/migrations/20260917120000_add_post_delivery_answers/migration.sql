-- Tappable answers to the opening question, sent as Instagram quick replies.
ALTER TABLE "Automation" ADD COLUMN "postDeliveryAnswers" TEXT[] DEFAULT ARRAY[]::TEXT[];
