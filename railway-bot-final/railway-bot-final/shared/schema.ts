import { pgTable, text, integer, serial, timestamp } from "drizzle-orm/pg-core";

// ── Calificaciones ────────────────────────────────────────────────────────────
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

// ── Arrestos ──────────────────────────────────────────────────────────────────
export const arrestos = pgTable("arrestos", {
  id:         serial("id").primaryKey(),
  userId:     text("user_id").notNull(),
  userTag:    text("user_tag").notNull(),
  robloxName: text("roblox_name").notNull().default(""),
  robloxUrl:  text("roblox_url").notNull().default(""),
  cargos:     text("cargos").notNull(),
  oficialId:  text("oficial_id").notNull(),
  oficialTag: text("oficial_tag").notNull(),
  fotoUrl:    text("foto_url").notNull().default(""),
  fecha:      text("fecha").notNull(),
  createdAt:  timestamp("created_at").defaultNow().notNull(),
});

export type Arresto       = typeof arrestos.$inferSelect;
export type InsertArresto = typeof arrestos.$inferInsert;

// ── Multas ────────────────────────────────────────────────────────────────────
export const multas = pgTable("multas", {
  id:         serial("id").primaryKey(),
  userId:     text("user_id").notNull(),
  userTag:    text("user_tag").notNull(),
  robloxName: text("roblox_name").notNull().default(""),
  robloxUrl:  text("roblox_url").notNull().default(""),
  cargos:     text("cargos").notNull(),
  oficialId:  text("oficial_id").notNull(),
  oficialTag: text("oficial_tag").notNull(),
  fotoUrl:    text("foto_url").notNull().default(""),
  fecha:      text("fecha").notNull(),
  createdAt:  timestamp("created_at").defaultNow().notNull(),
});

export type Multa       = typeof multas.$inferSelect;
export type InsertMulta = typeof multas.$inferInsert;

// ── Log de eliminaciones ──────────────────────────────────────────────────────
export const logEliminaciones = pgTable("log_eliminaciones", {
  id:          serial("id").primaryKey(),
  tipo:        text("tipo").notNull(),
  userId:      text("user_id").notNull(),
  userTag:     text("user_tag").notNull(),
  cantidad:    integer("cantidad").notNull().default(0),
  motivo:      text("motivo").notNull(),
  ejecutadoBy: text("ejecutado_by").notNull(),
  fecha:       text("fecha").notNull(),
  createdAt:   timestamp("created_at").defaultNow().notNull(),
});
