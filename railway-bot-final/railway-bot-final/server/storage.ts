import { calificaciones, type InsertCalificacion, type Calificacion } from "@shared/schema";
import { db } from "./db";
import { eq, sql } from "drizzle-orm";

export interface IStorage {
  createCalificacion(calificacion: InsertCalificacion): Promise<Calificacion>;
  getCalificacionesByStaff(staffUserId: string): Promise<Calificacion[]>;
  countCalificacionesByStaff(staffUserId: string): Promise<number>;
  getPromedioEstrellasByStaff(staffUserId: string): Promise<number>;
}

export class DatabaseStorage implements IStorage {
  async createCalificacion(insertCalificacion: InsertCalificacion): Promise<Calificacion> {
    const [calificacion] = await db
      .insert(calificaciones)
      .values(insertCalificacion)
      .returning();
    return calificacion;
  }

  async getCalificacionesByStaff(staffUserId: string): Promise<Calificacion[]> {
    return await db
      .select()
      .from(calificaciones)
      .where(eq(calificaciones.staffUserId, staffUserId));
  }

  async countCalificacionesByStaff(staffUserId: string): Promise<number> {
    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(calificaciones)
      .where(eq(calificaciones.staffUserId, staffUserId));
    return Number(result.count);
  }

  async getPromedioEstrellasByStaff(staffUserId: string): Promise<number> {
    const [result] = await db
      .select({ avg: sql<number>`avg(${calificaciones.estrellas})` })
      .from(calificaciones)
      .where(eq(calificaciones.staffUserId, staffUserId));
    return result?.avg ? Number(Number(result.avg).toFixed(1)) : 0;
  }
}

export const storage = new DatabaseStorage();
