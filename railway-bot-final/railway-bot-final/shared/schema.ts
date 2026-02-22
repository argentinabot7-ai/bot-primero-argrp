import { pgTable, text, integer, serial, timestamp } from "drizzle-orm/pg-core";

export const calificaciones = pgTable("calificaciones", {
  id:                serial("id").primaryKey(),
  staffUserId:       text("staff_user_id").notNull(),
  calificadorUserId: text("calificador_user_id").notNull(),
  estrellas:         integer("estrellas").notNull(),
  nota:              text("nota").notNull(),
  createdAt:         timestamp("created_at").defaultNow(),
});

export type Calificacion       = typeof calificaciones.$inferSelect;
export type InsertCalificacion = typeof calificaciones.$inferInsert;
