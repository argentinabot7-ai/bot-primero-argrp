import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL no está definida. Configurala en las variables de entorno de Railway.");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

export const db = drizzle(pool, { schema });

// Crea las tablas automáticamente si no existen al arrancar el bot
// USA "CREATE TABLE IF NOT EXISTS" — nunca borra ni modifica datos existentes
export async function initDatabase() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS calificaciones (
        id                  SERIAL PRIMARY KEY,
        staff_user_id       TEXT NOT NULL,
        calificador_user_id TEXT NOT NULL,
        estrellas           INTEGER NOT NULL,
        nota                TEXT NOT NULL,
        created_at          TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS arrestos (
        id          SERIAL PRIMARY KEY,
        user_id     TEXT NOT NULL,
        user_tag    TEXT NOT NULL,
        roblox_name TEXT NOT NULL DEFAULT '',
        roblox_url  TEXT NOT NULL DEFAULT '',
        cargos      TEXT NOT NULL,
        oficial_id  TEXT NOT NULL,
        oficial_tag TEXT NOT NULL,
        foto_url    TEXT NOT NULL DEFAULT '',
        fecha       TEXT NOT NULL,
        created_at  TIMESTAMP DEFAULT NOW() NOT NULL
      );

      CREATE TABLE IF NOT EXISTS multas (
        id          SERIAL PRIMARY KEY,
        user_id     TEXT NOT NULL,
        user_tag    TEXT NOT NULL,
        roblox_name TEXT NOT NULL DEFAULT '',
        roblox_url  TEXT NOT NULL DEFAULT '',
        cargos      TEXT NOT NULL,
        oficial_id  TEXT NOT NULL,
        oficial_tag TEXT NOT NULL,
        foto_url    TEXT NOT NULL DEFAULT '',
        fecha       TEXT NOT NULL,
        created_at  TIMESTAMP DEFAULT NOW() NOT NULL
      );

      CREATE TABLE IF NOT EXISTS log_eliminaciones (
        id           SERIAL PRIMARY KEY,
        tipo         TEXT NOT NULL,
        user_id      TEXT NOT NULL,
        user_tag     TEXT NOT NULL,
        cantidad     INTEGER NOT NULL DEFAULT 0,
        motivo       TEXT NOT NULL,
        ejecutado_by TEXT NOT NULL,
        fecha        TEXT NOT NULL,
        created_at   TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `);
    console.log("✅ Base de datos inicializada correctamente.");
  } catch (error) {
    console.error("❌ Error al inicializar la base de datos:", error);
    throw error;
  } finally {
    client.release();
  }
}
