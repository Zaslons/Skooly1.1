-- DropIndex
DROP INDEX "SchoolSubscription_schoolId_status_key";

-- CreateIndex
CREATE INDEX "SchoolSubscription_paymentGatewaySubscriptionId_idx" ON "SchoolSubscription"("paymentGatewaySubscriptionId");
