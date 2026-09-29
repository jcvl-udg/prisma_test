-- CreateIndex
CREATE INDEX "Destination_name_idx" ON "Destination"("name");

-- CreateIndex
CREATE INDEX "Hotel_title_idx" ON "Hotel"("title");

-- CreateIndex
CREATE INDEX "Hotel_categoryStars_idx" ON "Hotel"("categoryStars");

-- CreateIndex
CREATE INDEX "Hotel_destinationId_idx" ON "Hotel"("destinationId");
