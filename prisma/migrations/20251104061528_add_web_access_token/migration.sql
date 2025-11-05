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

-- CreateIndex
CREATE INDEX "alert_histories_timestamp_warningType_idx" ON "alert_histories"("timestamp", "warningType");

-- CreateIndex
CREATE INDEX "alert_histories_timestamp_changeType_idx" ON "alert_histories"("timestamp", "changeType");

-- CreateIndex
CREATE INDEX "alert_histories_timestamp_upperRegion_idx" ON "alert_histories"("timestamp", "upperRegion");

-- CreateIndex
CREATE INDEX "alert_histories_upperRegion_timestamp_idx" ON "alert_histories"("upperRegion", "timestamp");

-- CreateIndex
CREATE INDEX "weather_alerts_command_idx" ON "weather_alerts"("command");

-- CreateIndex
CREATE INDEX "weather_alerts_upperRegion_warningType_idx" ON "weather_alerts"("upperRegion", "warningType");

-- CreateIndex
CREATE INDEX "weather_alerts_upperRegion_warningLevel_idx" ON "weather_alerts"("upperRegion", "warningLevel");
