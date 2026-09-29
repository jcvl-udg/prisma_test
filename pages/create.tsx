// pages/create.tsx
import React, { useState } from "react"
import Layout from "../components/Layout"
import Router from "next/router"
import { gql } from "@apollo/client/core"
import { useMutation } from "@apollo/client/react"

const CreateManualHotelMutation = gql`
  mutation CreateManualHotel(
    $title: String!
    $categoryStars: Int!
    $destinationName: String!
    $destinationCode: String
  ) {
    createManualHotel(
      title: $title
      categoryStars: $categoryStars
      destinationName: $destinationName
      destinationCode: $destinationCode
    ) {
      id
      title
      categoryStars
      destination {
        id
        name
        code
      }
    }
  }
`

export default function CreateHotel() {
  const [title, setTitle] = useState("")
  const [categoryStars, setCategoryStars] = useState<number>(3)
  const [destinationName, setDestinationName] = useState("")
  const [destinationCode, setDestinationCode] = useState("")

  const [createHotel, { loading }] = useMutation(CreateManualHotelMutation)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await createHotel({
        variables: {
          title,
          categoryStars: Number(categoryStars),
          destinationName,
          destinationCode,
        },
      })
      Router.push("/")
    } catch (error) {
      console.error("Error creando el hotel:", error)
      alert("Error al guardar el hotel. Revisa la consola.")
    }
  }

  const isFormValid = title.trim() && destinationName.trim() && categoryStars > 0 && categoryStars <= 5

  return (
    <Layout>
      <div className="page">
        <form onSubmit={handleSubmit}>
          <h1>Registrar Hotel (Manual)</h1>
          
          <label>Nombre del Hotel</label>
          <input
            autoFocus
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ej: Gran Meliá"
            type="text"
            value={title}
          />

          <label>Destino (Nombre)</label>
          <input
            onChange={(e) => setDestinationName(e.target.value)}
            placeholder="Ej: Cancún"
            type="text"
            value={destinationName}
          />

          <label>Código IATA / Destino (Opcional)</label>
          <input
            onChange={(e) => setDestinationCode(e.target.value)}
            placeholder="Ej: CUN"
            type="text"
            maxLength={5}
            value={destinationCode}
          />

          <label>Categoría (Estrellas: 1-5)</label>
          <input
            onChange={(e) => setCategoryStars(Number(e.target.value))}
            type="number"
            min="1"
            max="5"
            value={categoryStars}
          />

          <div className="actions">
            <input
              disabled={!isFormValid || loading}
              type="submit"
              value={loading ? "Guardando..." : "Crear Hotel"}
            />
            <a className="back" href="#" onClick={(e) => { e.preventDefault(); Router.push("/") }}>
              Cancelar
            </a>
          </div>
        </form>
      </div>
      <style jsx>{`
        .page { background: white; padding: 3rem; display: flex; justify-content: center; }
        form { width: 100%; max-width: 500px; }
        label { display: block; margin-top: 1rem; font-weight: bold; font-size: 0.9rem; color: #333; }
        input[type="text"], input[type="number"] {
          width: 100%; padding: 0.75rem; margin: 0.5rem 0; border-radius: 0.25rem; border: 1px solid rgba(0, 0, 0, 0.2);
        }
        .actions { display: flex; align-items: center; margin-top: 1.5rem; }
        input[type="submit"] { background: #0070f3; color: white; border: 0; padding: 0.8rem 1.5rem; border-radius: 4px; cursor: pointer; }
        input[type="submit"]:disabled { background: #ccc; cursor: not-allowed; }
        .back { margin-left: 1rem; color: #666; text-decoration: none; }
      `}</style>
    </Layout>
  )
}