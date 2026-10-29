-- CreateEnum
CREATE TYPE "SkillActionType" AS ENUM ('ACTION', 'BONUS_ACTION', 'REACTION', 'FREE', 'OTHER');

-- CreateTable
CREATE TABLE "CharacterSkill" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subtitle" TEXT,
    "description" TEXT NOT NULL DEFAULT '',
    "skillType" TEXT,
    "range" TEXT,
    "actionType" "SkillActionType" NOT NULL DEFAULT 'ACTION',
    "usesMax" INTEGER NOT NULL DEFAULT 0,
    "usesCurrent" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "characterId" TEXT NOT NULL,

    CONSTRAINT "CharacterSkill_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CharacterSkill_characterId_sortOrder_idx" ON "CharacterSkill"("characterId", "sortOrder");

-- AddForeignKey
ALTER TABLE "CharacterSkill" ADD CONSTRAINT "CharacterSkill_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;
