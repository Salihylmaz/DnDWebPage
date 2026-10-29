-- CreateEnum
CREATE TYPE "SessionCreatureKind" AS ENUM ('NPC', 'MONSTER');

-- CreateTable
CREATE TABLE "SessionCreature" (
    "id" TEXT NOT NULL,
    "kind" "SessionCreatureKind" NOT NULL,
    "name" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "hp" INTEGER,
    "maxHp" INTEGER,
    "armorClass" INTEGER,
    "initiative" INTEGER,
    "isVisibleToPlayers" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sessionId" TEXT NOT NULL,

    CONSTRAINT "SessionCreature_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SessionCreature_sessionId_kind_createdAt_idx" ON "SessionCreature"("sessionId", "kind", "createdAt");

-- AddForeignKey
ALTER TABLE "SessionCreature" ADD CONSTRAINT "SessionCreature_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
