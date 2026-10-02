-- CreateIndex
CREATE INDEX "kyc_submissions_userId_submittedAt_idx" ON "kyc_submissions"("userId", "submittedAt");

-- CreateIndex
CREATE INDEX "payout_methods_userId_idx" ON "payout_methods"("userId");

-- CreateIndex
CREATE INDEX "support_messages_handled_createdAt_idx" ON "support_messages"("handled", "createdAt");

