-- CreateTable
CREATE TABLE "SpeakerProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL DEFAULT '',
    "jobTitle" TEXT NOT NULL DEFAULT '',
    "company" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT '',
    "linkedin" TEXT NOT NULL DEFAULT '',
    "twitter" TEXT NOT NULL DEFAULT '',
    "website" TEXT NOT NULL DEFAULT '',
    "headshotUrl" TEXT NOT NULL DEFAULT '',
    "bioShort" TEXT NOT NULL DEFAULT '',
    "bioLong" TEXT NOT NULL DEFAULT '',
    "talkTopics" TEXT NOT NULL DEFAULT '',
    "dietary" TEXT NOT NULL DEFAULT '',
    "pronouns" TEXT NOT NULL DEFAULT '',
    "speakingLevel" TEXT NOT NULL DEFAULT '',
    "signatureTopics" TEXT NOT NULL DEFAULT '',
    "homeGeographies" TEXT NOT NULL DEFAULT '',
    "credentials" TEXT NOT NULL DEFAULT '',
    "employerAngle" TEXT NOT NULL DEFAULT '',
    "excludedDomains" TEXT NOT NULL DEFAULT '',
    "privateKeywords" TEXT NOT NULL DEFAULT '',
    "rubricOverride" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpeakerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SpeakerProfile_userId_key" ON "SpeakerProfile"("userId");

-- AddForeignKey
ALTER TABLE "SpeakerProfile" ADD CONSTRAINT "SpeakerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

