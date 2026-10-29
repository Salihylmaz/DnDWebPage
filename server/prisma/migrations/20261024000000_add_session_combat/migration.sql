CREATE TABLE "SessionCombat" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "round" INTEGER NOT NULL DEFAULT 1,
    "activeEntryId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "entries" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionCombat_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SessionCombat_sessionId_key" ON "SessionCombat"("sessionId");

ALTER TABLE "SessionCombat" ADD CONSTRAINT "SessionCombat_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
