-- CreateEnum
CREATE TYPE "PropertyType" AS ENUM ('HOTEL', 'RESORT', 'HOSTEL', 'APARTMENT', 'VILLA', 'BOUTIQUE_HOTEL', 'BED_AND_BREAKFAST', 'MOTEL', 'LODGE', 'APARTHOTEL');

-- CreateEnum
CREATE TYPE "ViewType" AS ENUM ('NONE', 'CITY', 'SEA', 'GARDEN', 'MOUNTAIN', 'POOL', 'LANDMARK');

-- CreateEnum
CREATE TYPE "BoardType" AS ENUM ('ROOM_ONLY', 'BREAKFAST', 'HALF_BOARD', 'FULL_BOARD', 'ALL_INCLUSIVE');

-- CreateEnum
CREATE TYPE "CancellationType" AS ENUM ('FREE', 'PARTIAL', 'NON_REFUNDABLE');

-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('PREPAID', 'AT_PROPERTY', 'DEPOSIT');

-- CreateEnum
CREATE TYPE "POIKind" AS ENUM ('AIRPORT', 'BEACH', 'LANDMARK', 'MALL', 'STADIUM', 'CONVENTION_CENTER', 'PARK', 'MUSEUM');

-- CreateEnum
CREATE TYPE "TagKind" AS ENUM ('AUDIENCE', 'VIBE', 'CERTIFICATION', 'AWARD');

-- AlterTable
ALTER TABLE "Hotel" ADD COLUMN     "amenityCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "bestRateGuarantee" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "boardTypes" "BoardType"[] DEFAULT ARRAY[]::"BoardType"[],
ADD COLUMN     "bookingCount30d" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "cancellationType" "CancellationType",
ADD COLUMN     "cancellationWindowHours" INTEGER,
ADD COLUMN     "chainBrand" TEXT,
ADD COLUMN     "checkInTime" TEXT,
ADD COLUMN     "checkOutTime" TEXT,
ADD COLUMN     "childrenAllowed" BOOLEAN,
ADD COLUMN     "conversionRate30d" DOUBLE PRECISION,
ADD COLUMN     "countryCode" TEXT,
ADD COLUMN     "distanceToAirportKm" DOUBLE PRECISION,
ADD COLUMN     "distanceToBeachMeters" INTEGER,
ADD COLUMN     "distanceToCenterMeters" INTEGER,
ADD COLUMN     "distanceToMetroMeters" INTEGER,
ADD COLUMN     "distanceToSkiLiftMeters" INTEGER,
ADD COLUMN     "isBoutique" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isChain" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isLuxury" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "minAge" INTEGER,
ADD COLUMN     "neighborhood" TEXT,
ADD COLUMN     "paymentType" "PaymentType",
ADD COLUMN     "petsAllowed" BOOLEAN,
ADD COLUMN     "petsFee" DECIMAL(10,2),
ADD COLUMN     "priceBucket" TEXT,
ADD COLUMN     "propertyType" "PropertyType" NOT NULL DEFAULT 'HOTEL',
ADD COLUMN     "providerCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "ratingCleanliness" DOUBLE PRECISION,
ADD COLUMN     "ratingLocation" DOUBLE PRECISION,
ADD COLUMN     "ratingService" DOUBLE PRECISION,
ADD COLUMN     "ratingValue" DOUBLE PRECISION,
ADD COLUMN     "regionCode" TEXT,
ADD COLUMN     "smokingAllowed" BOOLEAN,
ADD COLUMN     "totalRooms" INTEGER,
ADD COLUMN     "vibes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "viewCount30d" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "yearBuilt" INTEGER,
ADD COLUMN     "yearRenovated" INTEGER,
ADD COLUMN     "zone" TEXT,
ALTER COLUMN "themes" SET DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Room" ADD COLUMN     "bedCount" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "boardType" "BoardType" NOT NULL DEFAULT 'ROOM_ONLY',
ADD COLUMN     "floor" INTEGER,
ADD COLUMN     "hasBalcony" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hasJacuzzi" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hasKitchen" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hasTerrace" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isAccessible" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "smokingAllowed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "viewType" "ViewType" NOT NULL DEFAULT 'NONE';

-- CreateTable
CREATE TABLE "HotelTag" (
    "hotelId" TEXT NOT NULL,
    "kind" "TagKind" NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "HotelTag_pkey" PRIMARY KEY ("hotelId","kind","value")
);

-- CreateTable
CREATE TABLE "PointOfInterest" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "POIKind" NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "destinationId" TEXT NOT NULL,

    CONSTRAINT "PointOfInterest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelPointOfInterest" (
    "hotelId" TEXT NOT NULL,
    "poiId" TEXT NOT NULL,
    "distanceMeters" INTEGER NOT NULL,

    CONSTRAINT "HotelPointOfInterest_pkey" PRIMARY KEY ("hotelId","poiId")
);

-- CreateTable
CREATE TABLE "_SeedProgress" (
    "id" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "subPhase" TEXT NOT NULL,
    "doneAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "_SeedProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HotelTag_kind_value_idx" ON "HotelTag"("kind", "value");

-- CreateIndex
CREATE INDEX "PointOfInterest_destinationId_kind_idx" ON "PointOfInterest"("destinationId", "kind");

-- CreateIndex
CREATE INDEX "HotelPointOfInterest_poiId_distanceMeters_idx" ON "HotelPointOfInterest"("poiId", "distanceMeters");

-- CreateIndex
CREATE UNIQUE INDEX "_SeedProgress_phase_subPhase_key" ON "_SeedProgress"("phase", "subPhase");

-- CreateIndex
CREATE INDEX "Hotel_vibes_idx" ON "Hotel" USING GIN ("vibes");

-- CreateIndex
CREATE INDEX "Hotel_boardTypes_idx" ON "Hotel" USING GIN ("boardTypes");

-- CreateIndex
CREATE INDEX "Hotel_amenityCodes_idx" ON "Hotel" USING GIN ("amenityCodes");

-- CreateIndex
CREATE INDEX "Hotel_latitude_longitude_idx" ON "Hotel"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "Hotel_status_categoryStars_popularityScore_idx" ON "Hotel"("status", "categoryStars", "popularityScore");

-- CreateIndex
CREATE INDEX "Hotel_status_priceFrom_categoryStars_idx" ON "Hotel"("status", "priceFrom", "categoryStars");

-- CreateIndex
CREATE INDEX "Hotel_destinationId_status_categoryStars_priceFrom_idx" ON "Hotel"("destinationId", "status", "categoryStars", "priceFrom");

-- CreateIndex
CREATE INDEX "Hotel_status_propertyType_categoryStars_idx" ON "Hotel"("status", "propertyType", "categoryStars");

-- CreateIndex
CREATE INDEX "Hotel_status_cancellationType_priceFrom_idx" ON "Hotel"("status", "cancellationType", "priceFrom");

-- CreateIndex
CREATE INDEX "Hotel_distanceToBeachMeters_idx" ON "Hotel"("distanceToBeachMeters");

-- CreateIndex
CREATE INDEX "Hotel_distanceToAirportKm_idx" ON "Hotel"("distanceToAirportKm");

-- CreateIndex
CREATE INDEX "Hotel_distanceToCenterMeters_idx" ON "Hotel"("distanceToCenterMeters");

-- AddForeignKey
ALTER TABLE "HotelTag" ADD CONSTRAINT "HotelTag_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointOfInterest" ADD CONSTRAINT "PointOfInterest_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelPointOfInterest" ADD CONSTRAINT "HotelPointOfInterest_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelPointOfInterest" ADD CONSTRAINT "HotelPointOfInterest_poiId_fkey" FOREIGN KEY ("poiId") REFERENCES "PointOfInterest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
