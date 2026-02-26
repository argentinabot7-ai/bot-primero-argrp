/**
 * database.ts
 * Base de datos SQLite para arrestos y multas — Argentina RP Bot
 * Usa better-sqlite3 (síncrono, sin promesas, ideal para bots Discord)
 *
 * Instalación requerida:
 *   npm install better-sqlite3
 *   npm install --save-dev @types/better-sqlite3
 */

import Database from "better-sqlite3";
import * as path from "path";
import * as fs   from "fs";

// ── Ruta del archivo de base de datos ─────────────────────────────────────────
const DB_DIR  = path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "argentina_rp.db");

// Asegurarse de que el directorio existe
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

// ── Instancia única de la DB ──────────────────────────────────────────────────
const db = new Database(DB_PATH);

// Habilitar WAL mode para mejor rendimiento concurrente
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ═════════════════════════════════════════════════════════════════════════════
// ESQUEMA
// ═════════════════════════════════════════════════════════════════════════════
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

// ═════════════════════════════════════════════════════════════════════════════
// TIPOS
// ═════════════════════════════════════════════════════════════════════════════
export interface ArrestoRow {
  id:          number;
  user_id:     string;
  user_tag:    string;
  roblox_name: string;
  roblox_url:  string;
  cargos:      string;
  oficial_id:  string;
  oficial_tag: string;
  foto_url:    string;
  fecha:       string;
  created_at:  number;
}

export interface MultaRow {
  id:          number;
  user_id:     string;
  user_tag:    string;
  roblox_name: string;
  roblox_url:  string;
  cargos:      string;
  oficial_id:  string;
  oficial_tag: string;
  foto_url:    string;
  fecha:       string;
  created_at:  number;
}

export interface NuevoArresto {
  userId:     string;
  userTag:    string;
  robloxName: string;
  robloxUrl:  string;
  cargos:     string;
  oficialId:  string;
  oficialTag: string;
  fotoUrl:    string;
  fecha:      string;
}

export interface NuevaMulta {
  userId:     string;
  userTag:    string;
  robloxName: string;
  robloxUrl:  string;
  cargos:     string;
  oficialId:  string;
  oficialTag: string;
  fotoUrl:    string;
  fecha:      string;
}

// ═════════════════════════════════════════════════════════════════════════════
// ARRESTOS
// ═════════════════════════════════════════════════════════════════════════════

/** Inserta un nuevo arresto y devuelve el ID generado. */
export function insertArresto(data: NuevoArresto): number {
  const stmt = db.prepare(`
    INSERT INTO arrestos (user_id, user_tag, roblox_name, roblox_url, cargos, oficial_id, oficial_tag, foto_url, fecha)
    VALUES (@userId, @userTag, @robloxName, @robloxUrl, @cargos, @oficialId, @oficialTag, @fotoUrl, @fecha)
  `);
  const result = stmt.run(data);
  return result.lastInsertRowid as number;
}

/** Obtiene todos los arrestos de un usuario, del más reciente al más antiguo. */
export function getArrestosByUser(userId: string): ArrestoRow[] {
  return db.prepare(`
    SELECT * FROM arrestos WHERE user_id = ? ORDER BY created_at DESC
  `).all(userId) as ArrestoRow[];
}

/** Cuenta cuántos arrestos tiene un usuario. */
export function countArrestosByUser(userId: string): number {
  const row = db.prepare(`SELECT COUNT(*) as total FROM arrestos WHERE user_id = ?`).get(userId) as { total: number };
  return row.total;
}

/**
 * Elimina TODOS los arrestos de un usuario.
 * Devuelve cuántos registros fueron eliminados.
 */
export function deleteArrestosByUser(userId: string): number {
  const result = db.prepare(`DELETE FROM arrestos WHERE user_id = ?`).run(userId);
  return result.changes;
}

/**
 * Elimina UN arresto específico por su ID.
 * Devuelve true si se eliminó, false si no existía.
 */
export function deleteArrestoById(id: number): boolean {
  const result = db.prepare(`DELETE FROM arrestos WHERE id = ?`).run(id);
  return result.changes > 0;
}

// ═════════════════════════════════════════════════════════════════════════════
// MULTAS
// ═════════════════════════════════════════════════════════════════════════════

/** Inserta una nueva multa y devuelve el ID generado. */
export function insertMulta(data: NuevaMulta): number {
  const stmt = db.prepare(`
    INSERT INTO multas (user_id, user_tag, roblox_name, roblox_url, cargos, oficial_id, oficial_tag, foto_url, fecha)
    VALUES (@userId, @userTag, @robloxName, @robloxUrl, @cargos, @oficialId, @oficialTag, @fotoUrl, @fecha)
  `);
  const result = stmt.run(data);
  return result.lastInsertRowid as number;
}

/** Obtiene todas las multas de un usuario, de la más reciente a la más antigua. */
export function getMultasByUser(userId: string): MultaRow[] {
  return db.prepare(`
    SELECT * FROM multas WHERE user_id = ? ORDER BY created_at DESC
  `).all(userId) as MultaRow[];
}

/** Cuenta cuántas multas tiene un usuario. */
export function countMultasByUser(userId: string): number {
  const row = db.prepare(`SELECT COUNT(*) as total FROM multas WHERE user_id = ?`).get(userId) as { total: number };
  return row.total;
}

/**
 * Elimina TODAS las multas de un usuario.
 * Devuelve cuántos registros fueron eliminados.
 */
export function deleteMultasByUser(userId: string): number {
  const result = db.prepare(`DELETE FROM multas WHERE user_id = ?`).run(userId);
  return result.changes;
}

/**
 * Elimina UNA multa específica por su ID.
 * Devuelve true si se eliminó, false si no existía.
 */
export function deleteMultaById(id: number): boolean {
  const result = db.prepare(`DELETE FROM multas WHERE id = ?`).run(id);
  return result.changes > 0;
}

// ═════════════════════════════════════════════════════════════════════════════
// LOG DE ELIMINACIONES
// ═════════════════════════════════════════════════════════════════════════════

export interface NuevoLog {
  tipo:        "arresto" | "multa";
  userId:      string;
  userTag:     string;
  cantidad:    number;
  motivo:      string;
  ejecutadoBy: string;
  fecha:       string;
}

/** Registra una eliminación en el log interno de la DB. */
export function insertLog(data: NuevoLog): void {
  db.prepare(`
    INSERT INTO log_eliminaciones (tipo, user_id, user_tag, cantidad, motivo, ejecutado_by, fecha)
    VALUES (@tipo, @userId, @userTag, @cantidad, @motivo, @ejecutadoBy, @fecha)
  `).run(data);
}

// No exportamos la instancia directamente para evitar errores de tipos en TypeScript
