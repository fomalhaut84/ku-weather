-- CreateTable
CREATE TABLE "web_access_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "displayName" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "web_access_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "web_access_tokens_token_key" ON "web_access_tokens"("token");

-- CreateIndex
CREATE INDEX "web_access_tokens_token_expiresAt_idx" ON "web_access_tokens"("token", "expiresAt");

-- CreateIndex
CREATE INDEX "web_access_tokens_platform_userId_idx" ON "web_access_tokens"("platform", "userId");

-- CreateIndex
CREATE INDEX "web_access_tokens_expiresAt_idx" ON "web_access_tokens"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "web_access_tokens_platform_userId_key" ON "web_access_tokens"("platform", "userId");
