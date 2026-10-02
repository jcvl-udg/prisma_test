// pages/index.tsx (Reemplaza a tu antiguo Blog)
import Layout from "../components/layout/Layout"
// import { gql } from "@apollo/client/core"
import { graphql } from '../gql';

import { createApolloClient } from "../lib/apollo-client";

import { prisma } from "../lib/prisma";

// Definimos los tipos basados en tu nuevo esquema
type HotelProps = {
  id: string
  title: string
  categoryStars: number
  destination: {
    name: string
  }
  rooms: {
    id: string
    name: string
  }[]
}

const HotelesHome: React.FC<{ data: { searchHotels: HotelProps[] } }> = (props) => {
  return (
    <Layout>
      <div className="page">
        <h1>Explora nuestros Hoteles</h1>
        <main>
          {props.data.searchHotels.map((hotel) => (
            <div key={hotel.id} className="hotel-card">
              <h2>{hotel.title}</h2>
              <p>📍 {hotel.destination.name} | ⭐ {hotel.categoryStars} Estrellas</p>
              
              <div className="rooms">
                <strong>Habitaciones disponibles:</strong>
                <ul>
                  {hotel.rooms.map(room => (
                    <li key={room.id}>{room.name}</li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
          
          {props.data.searchHotels.length === 0 && (
            <p>No hay hoteles registrados aún. ¡Corre el seed!</p>
          )}
        </main>
      </div>
      <style jsx>{`
        .page { padding: 2rem; }
        .hotel-card {
          background: white;
          padding: 1.5rem;
          border-radius: 8px;
          transition: box-shadow 0.2s ease-in;
          border: 1px solid #eaeaea;
        }
        .hotel-card:hover {
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }
        .hotel-card + .hotel-card {
          margin-top: 2rem;
        }
        .rooms {
          margin-top: 1rem;
          padding-top: 1rem;
          border-top: 1px dashed #eaeaea;
        }
        ul { margin-top: 0.5rem; padding-left: 1.5rem; }
      `}</style>
    </Layout>
  )
}

export async function getServerSideProps() {
  const client = createApolloClient();
  try {
    // Vas directo a la BD sin pasar por GraphQL/HTTP
    const hotels = await prisma.hotel.findMany({
      include: { destination: true, rooms: true }
    });
    console.log(client);
    return { props: { data: { searchHotels: JSON.parse(JSON.stringify(hotels)) } } };
  } catch (error) {
    return { props: { data: { searchHotels: [] }, error: "Falló" } };
  }
}

// Hacemos la consulta GraphQL a tu nueva API
// export async function getServerSideProps() {
//   const client = createApolloClient();

//   try {
//     const { data } = await client.query({
//       query: graphql(`
//         query SearchHotels {
//           searchHotels {
//             id
//             title
//             categoryStars
//             destination {
//               name
//             }
//             rooms {
//               id
//               name
//             }
//           }
//         }
//       `),
//     });

//     return {
//       props: { data },
//     };
//   } catch (error: any) {
//     // 1. Imprime el error real en tu terminal de servidor
//     console.error("🔥 Error en getServerSideProps (Index):", error.message || error);

//     // 2. Retorna un estado vacío para que la página cargue sin dar 500
//     return {
//       props: {
//         data: { searchHotels: [] },
//         error: "No se pudieron cargar los hoteles. Revisa la consola del servidor."
//       },
//     };
//   }
// }

export default HotelesHome;