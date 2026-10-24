import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
  index,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const tenantStatus = pgEnum("tenant_status", [
  "trial",
  "active",
  "past_due",
  "read_only",
  "canceled",
]);

export const membershipRole = pgEnum("membership_role", [
  "owner",
  "reception",
  "staff",
]);

export const emailTokenPurpose = pgEnum("email_token_purpose", [
  "verify",
  "reset",
]);

const timestamptz = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "date" });

/** Estabelecimento (tenant). */
export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  status: tenantStatus("status").notNull().default("trial"),
  trialEndsAt: timestamptz("trial_ends_at").notNull(),
  timezone: text("timezone").notNull().default("America/Sao_Paulo"),
  brandColor: text("brand_color"),
  logoUrl: text("logo_url"),
  whatsapp: text("whatsapp"),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Sempre em minúsculas (garantido por constraint). */
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    name: text("name").notNull(),
    isSuperAdmin: boolean("is_super_admin").notNull().default(false),
    emailVerifiedAt: timestamptz("email_verified_at"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [check("users_email_lowercase", sql`${t.email} = lower(${t.email})`)],
);

export const memberships = pgTable(
  "memberships",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    role: membershipRole("role").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.tenantId] }),
    index("memberships_tenant_id_idx").on(t.tenantId),
  ],
);

/** `id` é o hash SHA-256 do token da sessão (o token em si nunca é gravado). */
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id").references(() => tenants.id, {
      onDelete: "cascade",
    }),
    expiresAt: timestamptz("expires_at").notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [index("sessions_user_id_idx").on(t.userId)],
);

/** `id` é o hash do token enviado por e-mail. */
export const emailTokens = pgTable(
  "email_tokens",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    purpose: emailTokenPurpose("purpose").notNull(),
    expiresAt: timestamptz("expires_at").notNull(),
    usedAt: timestamptz("used_at"),
  },
  (t) => [index("email_tokens_user_id_idx").on(t.userId)],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    tenantId: uuid("tenant_id").references(() => tenants.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    details: jsonb("details"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [index("audit_log_tenant_id_idx").on(t.tenantId)],
);

export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Membership = typeof memberships.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type EmailToken = typeof emailTokens.$inferSelect;
