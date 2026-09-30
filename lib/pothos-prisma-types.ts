/* eslint-disable */
import type { Prisma, User, Booking, BookingItem, Profile, Destination, Hotel, Room, ProviderMapping } from "../prisma/generated/client.js";
import type { PothosPrismaDatamodel } from "@pothos/plugin-prisma";
export default interface PrismaTypes {
    User: {
        Name: "User";
        Shape: User;
        Include: Prisma.UserInclude;
        Select: Prisma.UserSelect;
        OrderBy: Prisma.UserOrderByWithRelationInput;
        WhereUnique: Prisma.UserWhereUniqueInput;
        Where: Prisma.UserWhereInput;
        Create: {};
        Update: {};
        RelationName: "profile" | "bookings";
        ListRelations: "bookings";
        Relations: {
            profile: {
                Shape: Profile | null;
                Name: "Profile";
                Nullable: true;
            };
            bookings: {
                Shape: Booking[];
                Name: "Booking";
                Nullable: false;
            };
        };
    };
    Booking: {
        Name: "Booking";
        Shape: Booking;
        Include: Prisma.BookingInclude;
        Select: Prisma.BookingSelect;
        OrderBy: Prisma.BookingOrderByWithRelationInput;
        WhereUnique: Prisma.BookingWhereUniqueInput;
        Where: Prisma.BookingWhereInput;
        Create: {};
        Update: {};
        RelationName: "user" | "items";
        ListRelations: "items";
        Relations: {
            user: {
                Shape: User | null;
                Name: "User";
                Nullable: true;
            };
            items: {
                Shape: BookingItem[];
                Name: "BookingItem";
                Nullable: false;
            };
        };
    };
    BookingItem: {
        Name: "BookingItem";
        Shape: BookingItem;
        Include: Prisma.BookingItemInclude;
        Select: Prisma.BookingItemSelect;
        OrderBy: Prisma.BookingItemOrderByWithRelationInput;
        WhereUnique: Prisma.BookingItemWhereUniqueInput;
        Where: Prisma.BookingItemWhereInput;
        Create: {};
        Update: {};
        RelationName: "booking" | "hotel" | "room";
        ListRelations: never;
        Relations: {
            booking: {
                Shape: Booking;
                Name: "Booking";
                Nullable: false;
            };
            hotel: {
                Shape: Hotel;
                Name: "Hotel";
                Nullable: false;
            };
            room: {
                Shape: Room;
                Name: "Room";
                Nullable: false;
            };
        };
    };
    Profile: {
        Name: "Profile";
        Shape: Profile;
        Include: Prisma.ProfileInclude;
        Select: Prisma.ProfileSelect;
        OrderBy: Prisma.ProfileOrderByWithRelationInput;
        WhereUnique: Prisma.ProfileWhereUniqueInput;
        Where: Prisma.ProfileWhereInput;
        Create: {};
        Update: {};
        RelationName: "user";
        ListRelations: never;
        Relations: {
            user: {
                Shape: User;
                Name: "User";
                Nullable: false;
            };
        };
    };
    Destination: {
        Name: "Destination";
        Shape: Destination;
        Include: Prisma.DestinationInclude;
        Select: Prisma.DestinationSelect;
        OrderBy: Prisma.DestinationOrderByWithRelationInput;
        WhereUnique: Prisma.DestinationWhereUniqueInput;
        Where: Prisma.DestinationWhereInput;
        Create: {};
        Update: {};
        RelationName: "hotels";
        ListRelations: "hotels";
        Relations: {
            hotels: {
                Shape: Hotel[];
                Name: "Hotel";
                Nullable: false;
            };
        };
    };
    Hotel: {
        Name: "Hotel";
        Shape: Hotel;
        Include: Prisma.HotelInclude;
        Select: Prisma.HotelSelect;
        OrderBy: Prisma.HotelOrderByWithRelationInput;
        WhereUnique: Prisma.HotelWhereUniqueInput;
        Where: Prisma.HotelWhereInput;
        Create: {};
        Update: {};
        RelationName: "destination" | "rooms" | "providerMappings" | "bookingItems";
        ListRelations: "rooms" | "providerMappings" | "bookingItems";
        Relations: {
            destination: {
                Shape: Destination;
                Name: "Destination";
                Nullable: false;
            };
            rooms: {
                Shape: Room[];
                Name: "Room";
                Nullable: false;
            };
            providerMappings: {
                Shape: ProviderMapping[];
                Name: "ProviderMapping";
                Nullable: false;
            };
            bookingItems: {
                Shape: BookingItem[];
                Name: "BookingItem";
                Nullable: false;
            };
        };
    };
    Room: {
        Name: "Room";
        Shape: Room;
        Include: Prisma.RoomInclude;
        Select: Prisma.RoomSelect;
        OrderBy: Prisma.RoomOrderByWithRelationInput;
        WhereUnique: Prisma.RoomWhereUniqueInput;
        Where: Prisma.RoomWhereInput;
        Create: {};
        Update: {};
        RelationName: "hotel" | "bookingItems";
        ListRelations: "bookingItems";
        Relations: {
            hotel: {
                Shape: Hotel;
                Name: "Hotel";
                Nullable: false;
            };
            bookingItems: {
                Shape: BookingItem[];
                Name: "BookingItem";
                Nullable: false;
            };
        };
    };
    ProviderMapping: {
        Name: "ProviderMapping";
        Shape: ProviderMapping;
        Include: Prisma.ProviderMappingInclude;
        Select: Prisma.ProviderMappingSelect;
        OrderBy: Prisma.ProviderMappingOrderByWithRelationInput;
        WhereUnique: Prisma.ProviderMappingWhereUniqueInput;
        Where: Prisma.ProviderMappingWhereInput;
        Create: {};
        Update: {};
        RelationName: "hotel";
        ListRelations: never;
        Relations: {
            hotel: {
                Shape: Hotel;
                Name: "Hotel";
                Nullable: false;
            };
        };
    };
}
export function getDatamodel(): PothosPrismaDatamodel { return JSON.parse("{\"datamodel\":{\"models\":{\"User\":{\"fields\":[{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"email\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":true,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"name\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Profile\",\"kind\":\"object\",\"name\":\"profile\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ProfileToUser\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"Booking\",\"kind\":\"object\",\"name\":\"bookings\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"BookingToUser\",\"relationFromFields\":[],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[]},\"Booking\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"userId\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"User\",\"kind\":\"object\",\"name\":\"user\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"BookingToUser\",\"relationFromFields\":[\"userId\"],\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"status\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"createdAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"BookingItem\",\"kind\":\"object\",\"name\":\"items\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"BookingToBookingItem\",\"relationFromFields\":[],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[]},\"BookingItem\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"bookingId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Booking\",\"kind\":\"object\",\"name\":\"booking\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"BookingToBookingItem\",\"relationFromFields\":[\"bookingId\"],\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"hotelId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Hotel\",\"kind\":\"object\",\"name\":\"hotel\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"BookingItemToHotel\",\"relationFromFields\":[\"hotelId\"],\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"roomId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Room\",\"kind\":\"object\",\"name\":\"room\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"BookingItemToRoom\",\"relationFromFields\":[\"roomId\"],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[]},\"Profile\":{\"fields\":[{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"bio\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"userId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":true,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"User\",\"kind\":\"object\",\"name\":\"user\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ProfileToUser\",\"relationFromFields\":[\"userId\"],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[]},\"Destination\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"name\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"code\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Hotel\",\"kind\":\"object\",\"name\":\"hotels\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"DestinationToHotel\",\"relationFromFields\":[],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[]},\"Hotel\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"title\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"categoryStars\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"destinationId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Destination\",\"kind\":\"object\",\"name\":\"destination\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"DestinationToHotel\",\"relationFromFields\":[\"destinationId\"],\"isUpdatedAt\":false},{\"type\":\"Room\",\"kind\":\"object\",\"name\":\"rooms\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"HotelToRoom\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"ProviderMapping\",\"kind\":\"object\",\"name\":\"providerMappings\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"HotelToProviderMapping\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"BookingItem\",\"kind\":\"object\",\"name\":\"bookingItems\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"BookingItemToHotel\",\"relationFromFields\":[],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[]},\"Room\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"name\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"hotelId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Hotel\",\"kind\":\"object\",\"name\":\"hotel\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"HotelToRoom\",\"relationFromFields\":[\"hotelId\"],\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"externalRoomCode\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"BookingItem\",\"kind\":\"object\",\"name\":\"bookingItems\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"BookingItemToRoom\",\"relationFromFields\":[],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[]},\"ProviderMapping\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"providerName\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"externalId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"hotelId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Hotel\",\"kind\":\"object\",\"name\":\"hotel\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"HotelToProviderMapping\",\"relationFromFields\":[\"hotelId\"],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[{\"name\":null,\"fields\":[\"providerName\",\"externalId\"]}]}}}}"); }