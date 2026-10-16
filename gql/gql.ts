/* eslint-disable */
import * as types from './graphql';
import type { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';

/**
 * Map of all GraphQL operations in the project.
 *
 * This map has several performance disadvantages:
 * 1. It is not tree-shakeable, so it will include all operations in the project.
 * 2. It is not minifiable, so the string of a GraphQL query will be multiple times inside the bundle.
 * 3. It does not support dead code elimination, so it will add unused operations.
 *
 * Therefore it is highly recommended to use the babel or swc plugin for production.
 * Learn more about it here: https://the-guild.dev/graphql/codegen/plugins/presets/preset-client#reducing-bundle-size
 */
type Documents = {
    "\n  query Me {\n    me {\n      id\n      email\n      name\n      image\n      role\n    }\n  }\n": typeof types.MeDocument,
    "\n  mutation CreateBooking(\n    $quoteId: String!\n    $idempotencyKey: String!\n    $guestName: String!\n    $guestEmail: String!\n    $guestPhone: String\n  ) {\n    createBooking(\n      quoteId: $quoteId\n      idempotencyKey: $idempotencyKey\n      guestName: $guestName\n      guestEmail: $guestEmail\n      guestPhone: $guestPhone\n    ) {\n      id\n      reference\n      status\n      totalAmount\n      currency\n    }\n  }\n": typeof types.CreateBookingDocument,
    "\n  mutation CreateQuote(\n    $hotelId: String!\n    $roomId: String!\n    $checkIn: Date!\n    $checkOut: Date!\n    $adults: Int!\n    $childrenAges: [Int!]!\n  ) {\n    createQuote(\n      hotelId: $hotelId\n      roomId: $roomId\n      checkIn: $checkIn\n      checkOut: $checkOut\n      adults: $adults\n      childrenAges: $childrenAges\n    ) {\n      id\n      priceAmount\n      currency\n      expiresAt\n    }\n  }\n": typeof types.CreateQuoteDocument,
    "\n  query AdminBookings($first: Int, $skip: Int) {\n    adminBookings(first: $first, skip: $skip) {\n      id\n      reference\n      status\n      totalAmount\n      currency\n      createdAt\n    }\n  }\n": typeof types.AdminBookingsDocument,
    "\n  mutation CreateManualHotel(\n    $title: String!\n    $categoryStars: Int!\n    $destinationName: String!\n    $destinationCode: String\n    $countryCode: String!\n  ) {\n    createManualHotel(\n      title: $title\n      categoryStars: $categoryStars\n      destinationName: $destinationName\n      destinationCode: $destinationCode\n      countryCode: $countryCode\n    ) {\n      id\n      title\n      categoryStars\n      destination {\n        id\n        name\n        code\n      }\n    }\n  }\n": typeof types.CreateManualHotelDocument,
    "\n  query LandingContent {\n    destinations(featuredOnly: true, take: 6) {\n      id\n      slug\n      name\n      countryCode\n      imageUrl\n      popularityScore\n    }\n    hotels(first: 12, sort: POPULAR) {\n      edges {\n        node {\n          id\n          slug\n          title\n          categoryStars\n          ratingAvg\n          reviewCount\n          priceFrom\n          priceCurrency\n          mainImageUrl\n          destination {\n            name\n            code\n          }\n        }\n      }\n    }\n  }\n": typeof types.LandingContentDocument,
    "\n  query MyBookings($first: Int, $skip: Int) {\n    myBookings(first: $first, skip: $skip) {\n      id\n      reference\n      status\n      totalAmount\n      currency\n      createdAt\n      items {\n        checkIn\n        checkOut\n        hotel { title }\n        room { name }\n      }\n    }\n  }\n": typeof types.MyBookingsDocument,
    "\n  query FullSearch($query: String, $destinationId: String, $take: Int) {\n    searchHotels(query: $query, destinationId: $destinationId, take: $take) {\n      id\n      title\n      categoryStars\n      destination { id name code }\n      rooms { id name }\n    }\n  }\n": typeof types.FullSearchDocument,
    "\n  query LandingHotelBySlug($slug: String!) {\n    hotelBySlug(slug: $slug) {\n      id\n      title\n      categoryStars\n      destination { id name code }\n      rooms { id name }\n    }\n  }\n": typeof types.LandingHotelBySlugDocument,
    "\n  mutation SignupUser($name: String, $email: String!, $password: String!) {\n    signupUser(name: $name, email: $email, password: $password) {\n      id\n      email\n    }\n  }\n": typeof types.SignupUserDocument,
};
const documents: Documents = {
    "\n  query Me {\n    me {\n      id\n      email\n      name\n      image\n      role\n    }\n  }\n": types.MeDocument,
    "\n  mutation CreateBooking(\n    $quoteId: String!\n    $idempotencyKey: String!\n    $guestName: String!\n    $guestEmail: String!\n    $guestPhone: String\n  ) {\n    createBooking(\n      quoteId: $quoteId\n      idempotencyKey: $idempotencyKey\n      guestName: $guestName\n      guestEmail: $guestEmail\n      guestPhone: $guestPhone\n    ) {\n      id\n      reference\n      status\n      totalAmount\n      currency\n    }\n  }\n": types.CreateBookingDocument,
    "\n  mutation CreateQuote(\n    $hotelId: String!\n    $roomId: String!\n    $checkIn: Date!\n    $checkOut: Date!\n    $adults: Int!\n    $childrenAges: [Int!]!\n  ) {\n    createQuote(\n      hotelId: $hotelId\n      roomId: $roomId\n      checkIn: $checkIn\n      checkOut: $checkOut\n      adults: $adults\n      childrenAges: $childrenAges\n    ) {\n      id\n      priceAmount\n      currency\n      expiresAt\n    }\n  }\n": types.CreateQuoteDocument,
    "\n  query AdminBookings($first: Int, $skip: Int) {\n    adminBookings(first: $first, skip: $skip) {\n      id\n      reference\n      status\n      totalAmount\n      currency\n      createdAt\n    }\n  }\n": types.AdminBookingsDocument,
    "\n  mutation CreateManualHotel(\n    $title: String!\n    $categoryStars: Int!\n    $destinationName: String!\n    $destinationCode: String\n    $countryCode: String!\n  ) {\n    createManualHotel(\n      title: $title\n      categoryStars: $categoryStars\n      destinationName: $destinationName\n      destinationCode: $destinationCode\n      countryCode: $countryCode\n    ) {\n      id\n      title\n      categoryStars\n      destination {\n        id\n        name\n        code\n      }\n    }\n  }\n": types.CreateManualHotelDocument,
    "\n  query LandingContent {\n    destinations(featuredOnly: true, take: 6) {\n      id\n      slug\n      name\n      countryCode\n      imageUrl\n      popularityScore\n    }\n    hotels(first: 12, sort: POPULAR) {\n      edges {\n        node {\n          id\n          slug\n          title\n          categoryStars\n          ratingAvg\n          reviewCount\n          priceFrom\n          priceCurrency\n          mainImageUrl\n          destination {\n            name\n            code\n          }\n        }\n      }\n    }\n  }\n": types.LandingContentDocument,
    "\n  query MyBookings($first: Int, $skip: Int) {\n    myBookings(first: $first, skip: $skip) {\n      id\n      reference\n      status\n      totalAmount\n      currency\n      createdAt\n      items {\n        checkIn\n        checkOut\n        hotel { title }\n        room { name }\n      }\n    }\n  }\n": types.MyBookingsDocument,
    "\n  query FullSearch($query: String, $destinationId: String, $take: Int) {\n    searchHotels(query: $query, destinationId: $destinationId, take: $take) {\n      id\n      title\n      categoryStars\n      destination { id name code }\n      rooms { id name }\n    }\n  }\n": types.FullSearchDocument,
    "\n  query LandingHotelBySlug($slug: String!) {\n    hotelBySlug(slug: $slug) {\n      id\n      title\n      categoryStars\n      destination { id name code }\n      rooms { id name }\n    }\n  }\n": types.LandingHotelBySlugDocument,
    "\n  mutation SignupUser($name: String, $email: String!, $password: String!) {\n    signupUser(name: $name, email: $email, password: $password) {\n      id\n      email\n    }\n  }\n": types.SignupUserDocument,
};

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 *
 *
 * @example
 * ```ts
 * const query = graphql(`query GetUser($id: ID!) { user(id: $id) { name } }`);
 * ```
 *
 * The query argument is unknown!
 * Please regenerate the types.
 */
export function graphql(source: string): unknown;

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Me {\n    me {\n      id\n      email\n      name\n      image\n      role\n    }\n  }\n"): (typeof documents)["\n  query Me {\n    me {\n      id\n      email\n      name\n      image\n      role\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation CreateBooking(\n    $quoteId: String!\n    $idempotencyKey: String!\n    $guestName: String!\n    $guestEmail: String!\n    $guestPhone: String\n  ) {\n    createBooking(\n      quoteId: $quoteId\n      idempotencyKey: $idempotencyKey\n      guestName: $guestName\n      guestEmail: $guestEmail\n      guestPhone: $guestPhone\n    ) {\n      id\n      reference\n      status\n      totalAmount\n      currency\n    }\n  }\n"): (typeof documents)["\n  mutation CreateBooking(\n    $quoteId: String!\n    $idempotencyKey: String!\n    $guestName: String!\n    $guestEmail: String!\n    $guestPhone: String\n  ) {\n    createBooking(\n      quoteId: $quoteId\n      idempotencyKey: $idempotencyKey\n      guestName: $guestName\n      guestEmail: $guestEmail\n      guestPhone: $guestPhone\n    ) {\n      id\n      reference\n      status\n      totalAmount\n      currency\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation CreateQuote(\n    $hotelId: String!\n    $roomId: String!\n    $checkIn: Date!\n    $checkOut: Date!\n    $adults: Int!\n    $childrenAges: [Int!]!\n  ) {\n    createQuote(\n      hotelId: $hotelId\n      roomId: $roomId\n      checkIn: $checkIn\n      checkOut: $checkOut\n      adults: $adults\n      childrenAges: $childrenAges\n    ) {\n      id\n      priceAmount\n      currency\n      expiresAt\n    }\n  }\n"): (typeof documents)["\n  mutation CreateQuote(\n    $hotelId: String!\n    $roomId: String!\n    $checkIn: Date!\n    $checkOut: Date!\n    $adults: Int!\n    $childrenAges: [Int!]!\n  ) {\n    createQuote(\n      hotelId: $hotelId\n      roomId: $roomId\n      checkIn: $checkIn\n      checkOut: $checkOut\n      adults: $adults\n      childrenAges: $childrenAges\n    ) {\n      id\n      priceAmount\n      currency\n      expiresAt\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query AdminBookings($first: Int, $skip: Int) {\n    adminBookings(first: $first, skip: $skip) {\n      id\n      reference\n      status\n      totalAmount\n      currency\n      createdAt\n    }\n  }\n"): (typeof documents)["\n  query AdminBookings($first: Int, $skip: Int) {\n    adminBookings(first: $first, skip: $skip) {\n      id\n      reference\n      status\n      totalAmount\n      currency\n      createdAt\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation CreateManualHotel(\n    $title: String!\n    $categoryStars: Int!\n    $destinationName: String!\n    $destinationCode: String\n    $countryCode: String!\n  ) {\n    createManualHotel(\n      title: $title\n      categoryStars: $categoryStars\n      destinationName: $destinationName\n      destinationCode: $destinationCode\n      countryCode: $countryCode\n    ) {\n      id\n      title\n      categoryStars\n      destination {\n        id\n        name\n        code\n      }\n    }\n  }\n"): (typeof documents)["\n  mutation CreateManualHotel(\n    $title: String!\n    $categoryStars: Int!\n    $destinationName: String!\n    $destinationCode: String\n    $countryCode: String!\n  ) {\n    createManualHotel(\n      title: $title\n      categoryStars: $categoryStars\n      destinationName: $destinationName\n      destinationCode: $destinationCode\n      countryCode: $countryCode\n    ) {\n      id\n      title\n      categoryStars\n      destination {\n        id\n        name\n        code\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query LandingContent {\n    destinations(featuredOnly: true, take: 6) {\n      id\n      slug\n      name\n      countryCode\n      imageUrl\n      popularityScore\n    }\n    hotels(first: 12, sort: POPULAR) {\n      edges {\n        node {\n          id\n          slug\n          title\n          categoryStars\n          ratingAvg\n          reviewCount\n          priceFrom\n          priceCurrency\n          mainImageUrl\n          destination {\n            name\n            code\n          }\n        }\n      }\n    }\n  }\n"): (typeof documents)["\n  query LandingContent {\n    destinations(featuredOnly: true, take: 6) {\n      id\n      slug\n      name\n      countryCode\n      imageUrl\n      popularityScore\n    }\n    hotels(first: 12, sort: POPULAR) {\n      edges {\n        node {\n          id\n          slug\n          title\n          categoryStars\n          ratingAvg\n          reviewCount\n          priceFrom\n          priceCurrency\n          mainImageUrl\n          destination {\n            name\n            code\n          }\n        }\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query MyBookings($first: Int, $skip: Int) {\n    myBookings(first: $first, skip: $skip) {\n      id\n      reference\n      status\n      totalAmount\n      currency\n      createdAt\n      items {\n        checkIn\n        checkOut\n        hotel { title }\n        room { name }\n      }\n    }\n  }\n"): (typeof documents)["\n  query MyBookings($first: Int, $skip: Int) {\n    myBookings(first: $first, skip: $skip) {\n      id\n      reference\n      status\n      totalAmount\n      currency\n      createdAt\n      items {\n        checkIn\n        checkOut\n        hotel { title }\n        room { name }\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query FullSearch($query: String, $destinationId: String, $take: Int) {\n    searchHotels(query: $query, destinationId: $destinationId, take: $take) {\n      id\n      title\n      categoryStars\n      destination { id name code }\n      rooms { id name }\n    }\n  }\n"): (typeof documents)["\n  query FullSearch($query: String, $destinationId: String, $take: Int) {\n    searchHotels(query: $query, destinationId: $destinationId, take: $take) {\n      id\n      title\n      categoryStars\n      destination { id name code }\n      rooms { id name }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query LandingHotelBySlug($slug: String!) {\n    hotelBySlug(slug: $slug) {\n      id\n      title\n      categoryStars\n      destination { id name code }\n      rooms { id name }\n    }\n  }\n"): (typeof documents)["\n  query LandingHotelBySlug($slug: String!) {\n    hotelBySlug(slug: $slug) {\n      id\n      title\n      categoryStars\n      destination { id name code }\n      rooms { id name }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation SignupUser($name: String, $email: String!, $password: String!) {\n    signupUser(name: $name, email: $email, password: $password) {\n      id\n      email\n    }\n  }\n"): (typeof documents)["\n  mutation SignupUser($name: String, $email: String!, $password: String!) {\n    signupUser(name: $name, email: $email, password: $password) {\n      id\n      email\n    }\n  }\n"];

export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> = TDocumentNode extends DocumentNode<  infer TType,  any>  ? TType  : never;