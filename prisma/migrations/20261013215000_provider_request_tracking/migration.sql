ALTER TABLE "Generation" ADD COLUMN "providerRequestId" TEXT;
ALTER TABLE "Generation" ADD COLUMN "providerStatusUrl" TEXT;
CREATE UNIQUE INDEX "Generation_providerRequestId_key" ON "Generation"("providerRequestId");
