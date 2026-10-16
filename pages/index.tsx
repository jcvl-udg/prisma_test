import { ApolloClient, InMemoryCache } from '@apollo/client';
import { SchemaLink } from '@apollo/client/link/schema';
import Head from 'next/head';
import type { GetStaticProps, InferGetStaticPropsType } from 'next';
import Link from 'next/link';
import Layout from '../components/layout/Layout';
import { FeaturedDestinations } from '../features/landing/components/FeaturedDestinations';
import { Hero } from '../features/landing/components/Hero';
import { PopularHotels } from '../features/landing/components/PopularHotels';
import { graphql } from '../gql';
import { prisma } from '../lib/prisma';
import { schema } from '../server/schema';

const LANDING_CONTENT_QUERY = graphql(`
  query LandingContent {
    destinations(featuredOnly: true, take: 6) {
      id
      slug
      name
      countryCode
      imageUrl
      popularityScore
    }
    hotels(first: 12, sort: POPULAR) {
      edges {
        node {
          id
          slug
          title
          categoryStars
          ratingAvg
          reviewCount
          priceFrom
          priceCurrency
          mainImageUrl
          destination {
            name
            code
          }
        }
      }
    }
  }
`);

const LandingPage = ({
  destinations,
  hotels,
}: InferGetStaticPropsType<typeof getStaticProps>) => (
  <Layout>
    <Head>
      <title>Aleca Travel | Encuentra tu próximo viaje</title>
      <meta
        name="description"
        content="Descubre destinos destacados y encuentra hoteles para planear tu próximo viaje."
      />
    </Head>
    <main className="mx-auto max-w-7xl space-y-20 px-4 py-8 sm:px-6 lg:px-8">
      <Hero />
      <FeaturedDestinations destinations={destinations} />
      <PopularHotels hotels={hotels} />
      <section className="rounded-3xl bg-slate-900 px-6 py-12 text-center text-white sm:px-12">
        <h2 className="text-2xl font-bold sm:text-3xl">
          ¿Buscas algo más específico?
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-slate-300">
          Explora el catálogo completo y encuentra la estancia ideal para tu
          próximo viaje.
        </p>
        <Link
          href="/search"
          className="mt-6 inline-flex rounded-lg bg-white px-5 py-3 font-semibold text-slate-900 transition hover:bg-slate-100"
        >
          Explorar todos los hoteles
        </Link>
      </section>
    </main>
  </Layout>
);

export const getStaticProps: GetStaticProps = async () => {
  const client = new ApolloClient({
    ssrMode: true,
    link: new SchemaLink({
      schema,
      context: {
        prisma,
        user: null,
        anonymousId: null,
      },
    }),
    cache: new InMemoryCache(),
  });

  try {
    const { data } = await client.query({ query: LANDING_CONTENT_QUERY });
    if (!data) throw new Error('La consulta GraphQL de la landing no devolvió datos.');
    return {
      props: {
        destinations: data.destinations,
        hotels: data.hotels.edges.map(({ node }) => node),
      },
      revalidate: 60,
    };
  } finally {
    await client.stop();
  }
};

export default LandingPage;
