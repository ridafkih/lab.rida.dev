import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sessions } from "./sessions";

export const browserSessions = pgTable("browser_sessions", {
  sessionId: uuid("session_id")
    .primaryKey()
    .references(() => sessions.id, { onDelete: "cascade" }),
  desiredState: text("desired_state", {
    enum: ["running", "stopped"],
  })
    .notNull()
    .default("stopped"),
  actualState: text("actual_state", {
    enum: ["pending", "starting", "running", "stopping", "stopped", "error"],
  })
    .notNull()
    .default("stopped"),
  streamPort: integer("stream_port"),
  lastHeartbeat: timestamp("last_heartbeat", { withTimezone: true }),
  errorMessage: text("error_message"),
  retryCount: integer("retry_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type BrowserSession = typeof browserSessions.$inferSelect;
export type NewBrowserSession = typeof browserSessions.$inferInsert;

export type DesiredState = "running" | "stopped";
export type ActualState = "pending" | "starting" | "running" | "stopping" | "stopped" | "error";
