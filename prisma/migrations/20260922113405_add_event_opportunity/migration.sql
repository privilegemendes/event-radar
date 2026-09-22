-- CreateTable
CREATE TABLE "EventOpportunity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "relevancyScore" INTEGER,
    "relevancyRationale" TEXT,
    "acceptanceLikelihood" TEXT,
    "acceptanceRationale" TEXT,
    "suggestedAction" TEXT,
    "category" TEXT,
    "employerRelevant" BOOLEAN NOT NULL DEFAULT false,
    "status" "EventStatus" NOT NULL DEFAULT 'DISCOVERED',
    "pitchDraft" TEXT,
    "followUpAt" TIMESTAMP(3),
    "attending" BOOLEAN NOT NULL DEFAULT false,
    "readiness" TEXT,
    "prepStage" TEXT,
    "customTasks" TEXT,
    "private" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventOpportunity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventOpportunity_userId_idx" ON "EventOpportunity"("userId");

-- CreateIndex
CREATE INDEX "EventOpportunity_eventId_idx" ON "EventOpportunity"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "EventOpportunity_userId_eventId_key" ON "EventOpportunity"("userId", "eventId");

-- AddForeignKey
ALTER TABLE "EventOpportunity" ADD CONSTRAINT "EventOpportunity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventOpportunity" ADD CONSTRAINT "EventOpportunity_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

