/**
 * database.ts
 * Arrestos, multas y logs — Argentina RP Bot
 * Usa PostgreSQL con Drizzle ORM — los datos persisten permanentemente.
 */

import { db } from "./db";
import { arrestos, multas, logEliminaciones } from "@shared/schema";
import { eq, desc, sql } from "drizzle-orm";

// ═════════════════════════════════════════════════════════════════════════════
// TIPOS
// ═════════════════════════════════════════════════════════════════════════════

export interface ArrestoRow {
  id:         number;
  userId:     string;
  userTag:    string;
  robloxName: string;
  robloxUrl:  string;
  cargos:     string;
  oficialId:  string;
  oficialTag: string;
  fotoUrl:    string;
  fecha:      string;
  createdAt:  Date;
}

export interface MultaRow {
  id:         number;
  userId:     string;
  userTag:    string;
  robloxName: string;
  robloxUrl:  string;
  cargos:     string;
  oficialId:  string;
  oficialTag: string;
  fotoUrl:    string;
  fecha:      string;
  createdAt:  Date;
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

export interface NuevoLog {
  tipo:        "arresto" | "multa";
  userId:      string;
  userTag:     string;
  cantidad:    number;
  motivo:      string;
  ejecutadoBy: string;
  fecha:       string;
}

// ═════════════════════════════════════════════════════════════════════════════
// ARRESTOS
// ═════════════════════════════════════════════════════════════════════════════

export async function insertArresto(data: NuevoArresto): Promise<number> {
  const [row] = await db.insert(arrestos).values(data).returning({ id: arrestos.id });
  return row.id;
}

export async function getArrestosByUser(userId: string): Promise<ArrestoRow[]> {
  return await db
    .select()
    .from(arrestos)
    .where(eq(arrestos.userId, userId))
    .orderBy(desc(arrestos.createdAt));
}

export async function countArrestosByUser(userId: string): Promise<number> {
  const [result] = await db
    .select({ count: sql<number>`count(*)` })
    .from(arrestos)
    .where(eq(arrestos.userId, userId));
  return Number(result.count);
}

export async function deleteArrestosByUser(userId: string): Promise<number> {
  const result = await db
    .delete(arrestos)
    .where(eq(arrestos.userId, userId))
    .returning({ id: arrestos.id });
  return result.length;
}

export async function deleteArrestoById(id: number): Promise<boolean> {
  const result = await db
    .delete(arrestos)
    .where(eq(arrestos.id, id))
    .returning({ id: arrestos.id });
  return result.length > 0;
}

// ═════════════════════════════════════════════════════════════════════════════
// MULTAS
// ═════════════════════════════════════════════════════════════════════════════

export async function insertMulta(data: NuevaMulta): Promise<number> {
  const [row] = await db.insert(multas).values(data).returning({ id: multas.id });
  return row.id;
}

export async function getMultasByUser(userId: string): Promise<MultaRow[]> {
  return await db
    .select()
    .from(multas)
    .where(eq(multas.userId, userId))
    .orderBy(desc(multas.createdAt));
}

export async function countMultasByUser(userId: string): Promise<number> {
  const [result] = await db
    .select({ count: sql<number>`count(*)` })
    .from(multas)
    .where(eq(multas.userId, userId));
  return Number(result.count);
}

export async function deleteMultasByUser(userId: string): Promise<number> {
  const result = await db
    .delete(multas)
    .where(eq(multas.userId, userId))
    .returning({ id: multas.id });
  return result.length;
}

export async function deleteMultaById(id: number): Promise<boolean> {
  const result = await db
    .delete(multas)
    .where(eq(multas.id, id))
    .returning({ id: multas.id });
  return result.length > 0;
}

// ═════════════════════════════════════════════════════════════════════════════
// LOG DE ELIMINACIONES
// ═════════════════════════════════════════════════════════════════════════════

export async function insertLog(data: NuevoLog): Promise<void> {
  await db.insert(logEliminaciones).values(data);
}
