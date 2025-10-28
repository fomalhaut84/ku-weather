-- CreateTable
CREATE TABLE "weather_alerts" (
    "id" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "regionName" TEXT NOT NULL,
    "upperRegion" TEXT,
    "warningType" TEXT NOT NULL,
    "warningLevel" TEXT NOT NULL,
    "command" TEXT NOT NULL,
    "announcedAt" TIMESTAMP(3) NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weather_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_histories" (
    "id" TEXT NOT NULL,
    "alertId" TEXT,
    "regionId" TEXT NOT NULL,
    "regionName" TEXT NOT NULL,
    "upperRegion" TEXT,
    "warningType" TEXT NOT NULL,
    "warningLevel" TEXT NOT NULL,
    "changeType" TEXT NOT NULL,
    "previousData" JSONB,
    "currentData" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alert_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "region_mappings" (
    "id" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "regionName" TEXT NOT NULL,
    "upperRegion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "region_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "weather_alerts_regionId_createdAt_idx" ON "weather_alerts"("regionId", "createdAt");

-- CreateIndex
CREATE INDEX "weather_alerts_warningType_warningLevel_idx" ON "weather_alerts"("warningType", "warningLevel");

-- CreateIndex
CREATE INDEX "weather_alerts_announcedAt_idx" ON "weather_alerts"("announcedAt");

-- CreateIndex
CREATE INDEX "weather_alerts_upperRegion_idx" ON "weather_alerts"("upperRegion");

-- CreateIndex
CREATE UNIQUE INDEX "weather_alerts_regionId_warningType_key" ON "weather_alerts"("regionId", "warningType");

-- CreateIndex
CREATE INDEX "alert_histories_regionId_timestamp_idx" ON "alert_histories"("regionId", "timestamp");

-- CreateIndex
CREATE INDEX "alert_histories_changeType_idx" ON "alert_histories"("changeType");

-- CreateIndex
CREATE INDEX "alert_histories_timestamp_idx" ON "alert_histories"("timestamp");

-- CreateIndex
CREATE INDEX "alert_histories_warningType_idx" ON "alert_histories"("warningType");

-- CreateIndex
CREATE UNIQUE INDEX "region_mappings_regionId_key" ON "region_mappings"("regionId");

-- CreateIndex
CREATE INDEX "region_mappings_regionId_idx" ON "region_mappings"("regionId");

-- CreateIndex
CREATE INDEX "region_mappings_upperRegion_idx" ON "region_mappings"("upperRegion");
