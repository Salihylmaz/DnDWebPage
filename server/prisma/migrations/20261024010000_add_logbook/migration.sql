CREATE TABLE "LogbookEntry" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "currentStatus" TEXT NOT NULL DEFAULT '',
    "sessionDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sessionId" TEXT NOT NULL,

    CONSTRAINT "LogbookEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LogbookEntry_sessionId_sessionDate_idx" ON "LogbookEntry"("sessionId", "sessionDate");

ALTER TABLE "LogbookEntry" ADD CONSTRAINT "LogbookEntry_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
