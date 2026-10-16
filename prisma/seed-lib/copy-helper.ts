import { once } from 'node:events';
import { finished } from 'node:stream/promises';
import { from as copyFrom } from 'pg-copy-streams';
import type { Pool, PoolClient } from 'pg';
import type { Prisma } from '../generated/client';
import type { CopyStream } from 'pg-copy-streams';

export function encodeCopyTextField(value: string | number | Date | null): string {
  if (value === null) return '\\N';
  const text = value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
  return text.replace(/[\\\t\n\r]/g, (character) => {
    switch (character) {
      case '\\': return '\\\\';
      case '\t': return '\\t';
      case '\n': return '\\n';
      case '\r': return '\\r';
      default: return character;
    }
  });
}

function formatInventoryRow(row: Prisma.RoomInventoryCreateManyInput): string {
  if (!row.roomId || !row.date || row.available === undefined || row.priceAmount === undefined || !row.currency) {
    throw new Error('Cada fila de inventario requiere habitación, fecha, disponibilidad, precio y moneda.');
  }
  return [
    encodeCopyTextField(row.roomId),
    encodeCopyTextField(row.date),
    encodeCopyTextField(row.available),
    encodeCopyTextField(String(row.priceAmount)),
    encodeCopyTextField(row.currency),
  ].join('\t') + '\n';
}

export async function copyRoomInventory(
  pool: Pool,
  rows: Prisma.RoomInventoryCreateManyInput[],
  fallback: () => Promise<unknown>,
): Promise<void> {
  if (rows.length === 0) return;

  let client: PoolClient | undefined;
  let copyStream: CopyStream | undefined;
  try {
    const connectedClient = await pool.connect();
    client = connectedClient;
    const stream = connectedClient.query(
      copyFrom('COPY "RoomInventory" ("roomId", "date", "available", "priceAmount", "currency") FROM STDIN'),
    );
    copyStream = stream;
    const copyComplete = finished(stream);
    for (const row of rows) {
      if (!stream.write(formatInventoryRow(row))) await once(stream, 'drain');
    }
    stream.end();
    await copyComplete;
    client.release();
    client = undefined;
  } catch (error) {
    copyStream?.destroy();
    client?.release(true);
    const errorMessage = error instanceof Error ? error.message : 'error desconocido';
    console.warn(`   COPY de inventario falló (${errorMessage}); se usará createMany.`);
    await fallback();
  }
}
