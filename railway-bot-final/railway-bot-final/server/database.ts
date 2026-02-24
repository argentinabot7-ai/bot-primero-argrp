/**
 * database.ts
 * Base de datos SQLite para arrestos y multas — Argentina RP Bot
 * La DB de calificaciones (PostgreSQL/Drizzle) no se toca.
 */

import Database from "better-sqlite3";
import * as path from "path";
import * as fs   from "fs";

const DB_DIR  = path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "argentina_rp.db");

if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS arrestos (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     TEXT    NOT NULL,
    user_tag    TEXT    NOT NULL,
    roblox_name TEXT    NOT NULL DEFAULT '',
    roblox_url  TEXT    NOT NULL DEFAULT '',
    cargos      TEXT    NOT NULL,
    oficial_id  TEXT    NOT NULL,
    oficial_tag TEXT    NOT NULL,
    foto_url    TEXT    NOT NULL DEFAULT '',
    fecha       TEXT    NOT NULL,
    created_at  INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
  );

  CREATE TABLE IF NOT EXISTS multas (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     TEXT    NOT NULL,
    user_tag    TEXT    NOT NULL,
    roblox_name TEXT    NOT NULL DEFAULT '',
    roblox_url  TEXT    NOT NULL DEFAULT '',
    cargos      TEXT    NOT NULL,
    oficial_id  TEXT    NOT NULL,
    oficial_tag TEXT    NOT NULL,
    foto_url    TEXT    NOT NULL DEFAULT '',
    fecha       TEXT    NOT NULL,
    created_at  INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
  );

  CREATE TABLE IF NOT EXISTS log_eliminaciones (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo         TEXT    NOT NULL CHECK(tipo IN ('arresto', 'multa')),
    user_id      TEXT    NOT NULL,
    user_tag     TEXT    NOT NULL,
    cantidad     INTEGER NOT NULL DEFAULT 0,
    motivo       TEXT    NOT NULL,
    ejecutado_by TEXT    NOT NULL,
    fecha        TEXT    NOT NULL,
    created_at   INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
  );

  CREATE INDEX IF NOT EXISTS idx_arrestos_user_id ON arrestos(user_id);
  CREATE INDEX IF NOT EXISTS idx_multas_user_id   ON multas(user_id);
`);

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface ArrestoRow {
  id: number; user_id: string; user_tag: string; roblox_name: string;
  roblox_url: string; cargos: string; oficial_id: string; oficial_tag: string;
  foto_url: string; fecha: string; created_at: number;
}

export interface MultaRow {
  id: number; user_id: string; user_tag: string; roblox_name: string;
  roblox_url: string; cargos: string; oficial_id: string; oficial_tag: string;
  foto_url: string; fecha: string; created_at: number;
}

export interface NuevoArresto {
  userId: string; userTag: string; robloxName: string; robloxUrl: string;
  cargos: string; oficialId: string; oficialTag: string; fotoUrl: string; fecha: string;
}

export interface NuevaMulta {
  userId: string; userTag: string; robloxName: string; robloxUrl: string;
  cargos: string; oficialId: string; oficialTag: string; fotoUrl: string; fecha: string;
}

export interface NuevoLog {
  tipo: "arresto" | "multa"; userId: string; userTag: string;
  cantidad: number; motivo: string; ejecutadoBy: string; fecha: string;
}

// ── Arrestos ──────────────────────────────────────────────────────────────────

export function insertArresto(data: NuevoArresto): number {
  const result = db.prepare(`
    INSERT INTO arrestos (user_id, user_tag, roblox_name, roblox_url, cargos, oficial_id, oficial_tag, foto_url, fecha)
    VALUES (@userId, @userTag, @robloxName, @robloxUrl, @cargos, @oficialId, @oficialTag, @fotoUrl, @fecha)
  `).run(data);
  return result.lastInsertRowid as number;
}

export function getArrestosByUser(userId: string): ArrestoRow[] {
  return db.prepare(`SELECT * FROM arrestos WHERE user_id = ? ORDER BY created_at DESC`).all(userId) as ArrestoRow[];
}

export function deleteArrestosByUser(userId: string): number {
  return db.prepare(`DELETE FROM arrestos WHERE user_id = ?`).run(userId).changes;
}

// ── Multas ────────────────────────────────────────────────────────────────────

export function insertMulta(data: NuevaMulta): number {
  const result = db.prepare(`
    INSERT INTO multas (user_id, user_tag, roblox_name, roblox_url, cargos, oficial_id, oficial_tag, foto_url, fecha)
    VALUES (@userId, @userTag, @robloxName, @robloxUrl, @cargos, @oficialId, @oficialTag, @fotoUrl, @fecha)
  `).run(data);
  return result.lastInsertRowid as number;
}

export function getMultasByUser(userId: string): MultaRow[] {
  return db.prepare(`SELECT * FROM multas WHERE user_id = ? ORDER BY created_at DESC`).all(userId) as MultaRow[];
}

export function deleteMultasByUser(userId: string): number {
  return db.prepare(`DELETE FROM multas WHERE user_id = ?`).run(userId).changes;
}

// ── Log ───────────────────────────────────────────────────────────────────────

export function insertLog(data: NuevoLog): void {
  db.prepare(`
    INSERT INTO log_eliminaciones (tipo, user_id, user_tag, cantidad, motivo, ejecutado_by, fecha)
    VALUES (@tipo, @userId, @userTag, @cantidad, @motivo, @ejecutadoBy, @fecha)
  `).run(data);
}

export { db };
