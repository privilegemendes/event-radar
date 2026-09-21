-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'VIEWER');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('CONFERENCE', 'MEETUP', 'EVENT', 'PODCAST', 'WEBINAR');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('DISCOVERED', 'APPROVED', 'PITCHED', 'ACCEPTED', 'SPOKEN', 'REJECTED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'VIEWER',
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Partner" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "stageStatus" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "keyContact" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Partner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "EventType" NOT NULL,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "location" TEXT,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "region" TEXT,
    "coderRelevant" BOOLEAN NOT NULL DEFAULT false,
    "category" TEXT,
    "audienceSignals" TEXT,
    "status" "EventStatus" NOT NULL DEFAULT 'DISCOVERED',
    "cfpDeadline" TIMESTAMP(3),
    "url" TEXT,
    "contact" TEXT,
    "description" TEXT,
    "sourceNote" TEXT,
    "partnerId" TEXT,
    "pitchDraft" TEXT,
    "followUpAt" TIMESTAMP(3),
    "isPaid" BOOLEAN,
    "paidNote" TEXT,
    "ticketCost" TEXT,
    "audienceDescription" TEXT,
    "audienceSize" INTEGER,
    "otherSpeakers" TEXT,
    "acceptanceLikelihood" TEXT,
    "acceptanceRationale" TEXT,
    "howToApply" TEXT,
    "industry" TEXT,
    "relevancyScore" INTEGER,
    "relevancyRationale" TEXT,
    "suggestedAction" TEXT,
    "attending" BOOLEAN NOT NULL DEFAULT false,
    "readiness" TEXT,
    "prepStage" TEXT,
    "customTasks" TEXT,
    "applyUrl" TEXT,
    "socialLinks" TEXT,
    "isCoderEvent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Speaker" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "company" TEXT,
    "linkedinUrl" TEXT,
    "background" TEXT,
    "topics" TEXT,
    "region" TEXT,
    "talkCount" INTEGER NOT NULL DEFAULT 0,
    "eventsJson" TEXT,
    "outreachNote" TEXT,
    "sourceNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Speaker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscoveryRun" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "summary" TEXT,
    "found" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DiscoveryRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Partner_name_key" ON "Partner"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Speaker_name_key" ON "Speaker"("name");

-- CreateIndex
CREATE UNIQUE INDEX "AppSetting_key_key" ON "AppSetting"("key");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

