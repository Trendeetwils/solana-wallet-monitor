-- CreateTable
CREATE TABLE "User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "telegramId" TEXT NOT NULL,
    "walletAddress" TEXT,
    "lastSeenSignature" TEXT,
    "isMonitoring" BOOLEAN NOT NULL DEFAULT false,
    "commitmentLevel" TEXT NOT NULL DEFAULT 'confirmed',
    "pollInterval" INTEGER NOT NULL DEFAULT 30000,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramId_key" ON "User"("telegramId");
