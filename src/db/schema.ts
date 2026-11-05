import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
  customType,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
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

export const bookingStatus = pgEnum("booking_status", [
  "scheduled",
  "confirmed",
  "completed",
  "no_show",
  "canceled",
]);

export const invitationRole = pgEnum("invitation_role", [
  "owner",
  "reception",
  "staff",
]);

export const bookingSource = pgEnum("booking_source", ["public", "panel"]);

export const canceledBy = pgEnum("canceled_by", ["customer", "staff"]);

export const whatsappMessageStatus = pgEnum("whatsapp_message_status", [
  "queued",
  "sending",
  "sent",
  "delivered",
  "read",
  "failed",
]);

export const whatsappTemplateType = pgEnum("whatsapp_template_type", [
  "booking_created",
  "reminder_eve",
  "reminder_2h",
  "rescheduled",
  "canceled",
]);

/** `bytea` como `Buffer` (usado para o logo do estabelecimento). */
const bytea = customType<{ data: Buffer; driverData: Buffer | Uint8Array }>({
  dataType: () => "bytea",
  toDriver: (value) => value,
  fromDriver: (value) => Buffer.from(value),
});

const timestamptz = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "date" });

/**
 * Planos da plataforma (catálogo global: sem `tenant_id`, sem RLS e sem grant
 * para `agenda_app`). Populada pela migração `0005_plano3.sql`.
 */
export const plans = pgTable("plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** `essencial` | `profissional` | `studio`. */
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  /** Preço mensal em centavos. */
  priceCents: integer("price_cents").notNull(),
  /** Nulo = profissionais ilimitados. */
  maxProfessionals: integer("max_professionals"),
  monthlyMessages: integer("monthly_messages").notNull(),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull(),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
});

/** Estabelecimento (tenant). */
export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  status: tenantStatus("status").notNull().default("trial"),
  trialEndsAt: timestamptz("trial_ends_at").notNull(),
  pastDueAt: timestamptz("past_due_at"),
  /** Até quando o plano está pago por Pix ou boleto (nulo: só cartão ou nunca pagou assim). */
  paidUntil: timestamptz("paid_until"),
  timezone: text("timezone").notNull().default("America/Sao_Paulo"),
  brandColor: text("brand_color"),
  logoUrl: text("logo_url"),
  whatsapp: text("whatsapp"),
  address: text("address"),
  instagram: text("instagram"),
  facebook: text("facebook"),
  about: text("about"),
  /** Frase de destaque sobre o carrossel da página pública. */
  heroTitle: text("hero_title"),
  heroSubtitle: text("hero_subtitle"),
  /** Intervalo entre horários oferecidos na reserva online (minutos). */
  slotIntervalMin: integer("slot_interval_min").notNull().default(15),
  /** Antecedência mínima para reservar (minutos). */
  minNoticeMin: integer("min_notice_min").notNull().default(60),
  /** Até quantos dias à frente a agenda aceita reservas. */
  maxDaysAhead: integer("max_days_ahead").notNull().default(60),
  /** Janela antes do horário em que o cliente ainda pode cancelar sozinho (minutos). */
  cancelWindowMin: integer("cancel_window_min").notNull().default(120),
  onboardingCompletedAt: timestamptz("onboarding_completed_at"),
  /**
   * Plano contratado. Em 0004 a coluna nasce nula; 0005 preenche com o
   * Essencial e aplica `SET NOT NULL` (o drizzle-kit só gera a forma final).
   */
  planId: uuid("plan_id")
    .notNull()
    .references(() => plans.id, { onDelete: "restrict" }),
  /** Primeira vez que o estabelecimento virou `active`. */
  activatedAt: timestamptz("activated_at"),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Sempre em minúsculas (garantido por constraint). */
    email: text("email").notNull().unique(),
    /** Nulo em contas criadas só com o Google (entram pelo Google; podem criar senha em "esqueci minha senha"). */
    passwordHash: text("password_hash"),
    name: text("name").notNull(),
    isSuperAdmin: boolean("is_super_admin").notNull().default(false),
    emailVerifiedAt: timestamptz("email_verified_at"),
    lastLoginAt: timestamptz("last_login_at"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [check("users_email_lowercase", sql`${t.email} = lower(${t.email})`)],
);

/** Conta de um provedor de login externo (hoje só `"google"`) ligada a um usuário. */
export const oauthAccounts = pgTable(
  "oauth_accounts",
  {
    provider: text("provider").notNull(),
    /** Identificador estável do usuário no provedor (`sub` do Google). */
    providerUserId: text("provider_user_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** E-mail da conta no provedor no momento do vínculo (informativo). */
    email: text("email").notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.provider, t.providerUserId] }),
    index("oauth_accounts_user_id_idx").on(t.userId),
  ],
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
    /** Preenchido quando um super admin entra em modo suporte nesta sessão. */
    supportStartedAt: timestamptz("support_started_at"),
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

/**
 * Isolamento entre tenants também nas referências: as FKs entre tabelas de
 * tenant são compostas (`tenant_id`, `id`) e apontam para `UNIQUE (tenant_id, id)`.
 * Sem isso, a checagem de FK (que roda como dono da tabela, ignorando RLS)
 * deixaria um tenant referenciar linhas de outro.
 */
const tenantIdColumn = () =>
  uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" });

/** Logo enviado pelo estabelecimento (um por tenant). */
export const tenantLogos = pgTable("tenant_logos", {
  tenantId: uuid("tenant_id")
    .primaryKey()
    .references(() => tenants.id, { onDelete: "cascade" }),
  mime: text("mime").notNull(),
  data: bytea("data").notNull(),
  updatedAt: timestamptz("updated_at").notNull().defaultNow(),
});

/** Imagens do carrossel da página pública (até 3 por tenant, já em WebP). */
export const tenantPhotos = pgTable(
  "tenant_photos",
  {
    tenantId: tenantIdColumn(),
    slot: smallint("slot").notNull(),
    mime: text("mime").notNull(),
    data: bytea("data").notNull(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: "tenant_photos_pk", columns: [t.tenantId, t.slot] }),
    check("tenant_photos_slot_range", sql`${t.slot} between 0 and 2`),
  ],
);

/** Horário de funcionamento (vários intervalos por dia; weekday 0 = domingo). */
export const businessHours = pgTable(
  "business_hours",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantIdColumn(),
    weekday: smallint("weekday").notNull(),
    startsAt: time("starts_at").notNull(),
    endsAt: time("ends_at").notNull(),
  },
  (t) => [
    index("business_hours_tenant_id_idx").on(t.tenantId),
    check("business_hours_weekday_range", sql`${t.weekday} between 0 and 6`),
    check("business_hours_interval_order", sql`${t.startsAt} < ${t.endsAt}`),
  ],
);

export const professionals = pgTable(
  "professionals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantIdColumn(),
    name: text("name").notNull(),
    /** Cargo exibido na equipe da página pública ("Barbeiro"). */
    title: text("title"),
    color: text("color"),
    /** Quando a foto foi enviada (versão do endereço público); nulo = sem foto. */
    photoUpdatedAt: timestamptz("photo_updated_at"),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /** Removido da equipe: some das telas, mas o histórico de agendamentos continua. */
    archivedAt: timestamptz("archived_at"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("professionals_tenant_id_idx").on(t.tenantId),
    unique("professionals_tenant_id_id_unique").on(t.tenantId, t.id),
  ],
);

/** Foto do profissional (uma por profissional, já em WebP). */
export const professionalPhotos = pgTable(
  "professional_photos",
  {
    tenantId: tenantIdColumn(),
    professionalId: uuid("professional_id").notNull(),
    mime: text("mime").notNull(),
    data: bytea("data").notNull(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: "professional_photos_pk", columns: [t.tenantId, t.professionalId] }),
    foreignKey({
      name: "professional_photos_professional_fk",
      columns: [t.tenantId, t.professionalId],
      foreignColumns: [professionals.tenantId, professionals.id],
    }).onDelete("cascade"),
  ],
);

/** Horário de trabalho de cada profissional (vários intervalos por dia). */
export const professionalHours = pgTable(
  "professional_hours",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantIdColumn(),
    professionalId: uuid("professional_id").notNull(),
    weekday: smallint("weekday").notNull(),
    startsAt: time("starts_at").notNull(),
    endsAt: time("ends_at").notNull(),
  },
  (t) => [
    foreignKey({
      name: "professional_hours_professional_fk",
      columns: [t.tenantId, t.professionalId],
      foreignColumns: [professionals.tenantId, professionals.id],
    }).onDelete("cascade"),
    index("professional_hours_tenant_id_idx").on(t.tenantId),
    index("professional_hours_professional_id_idx").on(t.professionalId),
    check("professional_hours_weekday_range", sql`${t.weekday} between 0 and 6`),
    check("professional_hours_interval_order", sql`${t.startsAt} < ${t.endsAt}`),
  ],
);

/** Categoria de serviços ("Cabelo e tratamentos"): agrupa a lista da página pública. */
export const serviceCategories = pgTable(
  "service_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantIdColumn(),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("service_categories_tenant_id_idx").on(t.tenantId),
    unique("service_categories_tenant_id_id_unique").on(t.tenantId, t.id),
  ],
);

export const services = pgTable(
  "services",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantIdColumn(),
    name: text("name").notNull(),
    description: text("description"),
    durationMin: integer("duration_min").notNull(),
    /** Intervalo de preparação depois do atendimento (bloqueia a agenda). */
    bufferAfterMin: integer("buffer_after_min").notNull().default(0),
    /** Preço em centavos. */
    priceCents: integer("price_cents").notNull(),
    visible: boolean("visible").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    /** Categoria opcional; sem ela o serviço aparece em "Outros serviços". */
    categoryId: uuid("category_id"),
    archivedAt: timestamptz("archived_at"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "services_category_fk",
      columns: [t.tenantId, t.categoryId],
      foreignColumns: [serviceCategories.tenantId, serviceCategories.id],
    }),
    index("services_tenant_id_idx").on(t.tenantId),
    unique("services_tenant_id_id_unique").on(t.tenantId, t.id),
    check("services_duration_positive", sql`${t.durationMin} > 0`),
    check("services_price_non_negative", sql`${t.priceCents} >= 0`),
  ],
);

/** Quais serviços cada profissional executa. */
export const professionalServices = pgTable(
  "professional_services",
  {
    tenantId: tenantIdColumn(),
    professionalId: uuid("professional_id").notNull(),
    serviceId: uuid("service_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.professionalId, t.serviceId] }),
    foreignKey({
      name: "professional_services_professional_fk",
      columns: [t.tenantId, t.professionalId],
      foreignColumns: [professionals.tenantId, professionals.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "professional_services_service_fk",
      columns: [t.tenantId, t.serviceId],
      foreignColumns: [services.tenantId, services.id],
    }).onDelete("cascade"),
    index("professional_services_tenant_id_idx").on(t.tenantId),
    index("professional_services_service_id_idx").on(t.serviceId),
  ],
);

/** Bloqueio de agenda (folga, almoço...). `professionalId` nulo = estabelecimento todo. */
export const timeBlocks = pgTable(
  "time_blocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantIdColumn(),
    /** Nulo = estabelecimento todo (a FK composta não é checada com MATCH SIMPLE). */
    professionalId: uuid("professional_id"),
    startsAt: timestamptz("starts_at").notNull(),
    endsAt: timestamptz("ends_at").notNull(),
    reason: text("reason"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "time_blocks_professional_fk",
      columns: [t.tenantId, t.professionalId],
      foreignColumns: [professionals.tenantId, professionals.id],
    }).onDelete("cascade"),
    index("time_blocks_tenant_starts_idx").on(t.tenantId, t.startsAt),
    check("time_blocks_interval_order", sql`${t.startsAt} < ${t.endsAt}`),
  ],
);

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantIdColumn(),
    name: text("name").notNull(),
    /** Telefone normalizado (`55` + DDD + número). */
    phone: text("phone").notNull(),
    email: text("email"),
    notes: text("notes"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [
    unique("customers_tenant_phone_unique").on(t.tenantId, t.phone),
    unique("customers_tenant_id_id_unique").on(t.tenantId, t.id),
  ],
);

/**
 * Agendamento. A trava contra dupla reserva (`bookings_no_overlap`, EXCLUDE
 * USING gist) é criada na migração `0003_rls.sql`, pois o drizzle-kit não
 * expressa constraints de exclusão: o mesmo profissional não pode ter dois
 * agendamentos não cancelados com `[starts_at, blocked_until)` sobrepostos.
 */
export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantIdColumn(),
    professionalId: uuid("professional_id").notNull(),
    customerId: uuid("customer_id").notNull(),
    startsAt: timestamptz("starts_at").notNull(),
    /** Fim do atendimento. */
    endsAt: timestamptz("ends_at").notNull(),
    /** Fim do atendimento + buffer: até quando o profissional fica ocupado. */
    blockedUntil: timestamptz("blocked_until").notNull(),
    status: bookingStatus("status").notNull().default("scheduled"),
    source: bookingSource("source").notNull(),
    totalCents: integer("total_cents").notNull(),
    /** Hash do token do link de gerenciamento enviado ao cliente. */
    manageTokenHash: text("manage_token_hash"),
    notes: text("notes"),
    canceledAt: timestamptz("canceled_at"),
    confirmedViaWhatsappAt: timestamptz("confirmed_via_whatsapp_at"),
    canceledBy: canceledBy("canceled_by"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "bookings_professional_fk",
      columns: [t.tenantId, t.professionalId],
      foreignColumns: [professionals.tenantId, professionals.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "bookings_customer_fk",
      columns: [t.tenantId, t.customerId],
      foreignColumns: [customers.tenantId, customers.id],
    }).onDelete("restrict"),
    unique("bookings_tenant_id_id_unique").on(t.tenantId, t.id),
    unique("bookings_manage_token_hash_unique").on(t.manageTokenHash),
    index("bookings_tenant_starts_idx").on(t.tenantId, t.startsAt),
    index("bookings_professional_starts_idx").on(t.professionalId, t.startsAt),
    index("bookings_customer_id_idx").on(t.customerId),
    check(
      "bookings_interval_order",
      sql`${t.startsAt} < ${t.endsAt} and ${t.endsAt} <= ${t.blockedUntil}`,
    ),
  ],
);

/** Serviços de um agendamento (nome, duração e preço copiados no momento da reserva). */
export const bookingServices = pgTable(
  "booking_services",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantIdColumn(),
    bookingId: uuid("booking_id").notNull(),
    serviceId: uuid("service_id"),
    name: text("name").notNull(),
    durationMin: integer("duration_min").notNull(),
    priceCents: integer("price_cents").notNull(),
    position: integer("position").notNull(),
  },
  (t) => [
    foreignKey({
      name: "booking_services_booking_fk",
      columns: [t.tenantId, t.bookingId],
      foreignColumns: [bookings.tenantId, bookings.id],
    }).onDelete("cascade"),
    // ATENÇÃO: em 0002_agenda.sql esta FK foi ajustada à mão para
    // `ON DELETE SET NULL (service_id)` (PostgreSQL 15+): o SET NULL padrão
    // do drizzle-kit anularia também `tenant_id` (NOT NULL). Se 0002 for
    // regerada, repita o ajuste.
    foreignKey({
      name: "booking_services_service_fk",
      columns: [t.tenantId, t.serviceId],
      foreignColumns: [services.tenantId, services.id],
    }).onDelete("set null"),
    index("booking_services_tenant_id_idx").on(t.tenantId),
    index("booking_services_booking_id_idx").on(t.bookingId),
  ],
);

/**
 * Convite para entrar na equipe. RLS `tenant_isolation` criada em
 * `0005_plano3.sql` (o drizzle-kit não expressa RLS).
 */
export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantIdColumn(),
    /** Sempre em minúsculas (garantido por constraint). */
    email: text("email").notNull(),
    name: text("name").notNull(),
    role: invitationRole("role").notNull(),
    /** Nulo = sem vínculo com profissional (a FK composta não é checada com MATCH SIMPLE). */
    professionalId: uuid("professional_id"),
    tokenHash: text("token_hash").notNull().unique(),
    invitedByUserId: uuid("invited_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    expiresAt: timestamptz("expires_at").notNull(),
    acceptedAt: timestamptz("accepted_at"),
    revokedAt: timestamptz("revoked_at"),
    sentAt: timestamptz("sent_at").notNull().defaultNow(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [
    // ATENÇÃO: em 0004 esta FK foi ajustada à mão para
    // `ON DELETE SET NULL ("professional_id")` (PostgreSQL 15+): o SET NULL
    // padrão do drizzle-kit anularia também `tenant_id` (NOT NULL). Se 0004
    // for regerada, repita o ajuste (mesmo caso de booking_services_service_fk).
    foreignKey({
      name: "invitations_professional_fk",
      columns: [t.tenantId, t.professionalId],
      foreignColumns: [professionals.tenantId, professionals.id],
    }).onDelete("set null"),
    index("invitations_tenant_email_idx").on(t.tenantId, t.email),
    check("invitations_email_lowercase", sql`${t.email} = lower(${t.email})`),
  ],
);

export type Plan = typeof plans.$inferSelect;
export type Invitation = typeof invitations.$inferSelect;
export type Tenant = typeof tenants.$inferSelect;
export type TenantLogo = typeof tenantLogos.$inferSelect;
export type BusinessHour = typeof businessHours.$inferSelect;
export type Professional = typeof professionals.$inferSelect;
export type ProfessionalHour = typeof professionalHours.$inferSelect;
export type Service = typeof services.$inferSelect;
export type NewService = typeof services.$inferInsert;
export type TimeBlock = typeof timeBlocks.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
export type NewBooking = typeof bookings.$inferInsert;
export type BookingService = typeof bookingServices.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Membership = typeof memberships.$inferSelect;
export type OauthAccount = typeof oauthAccounts.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type EmailToken = typeof emailTokens.$inferSelect;

/** Preferências de envio de notificações e lembretes por estabelecimento. */
export const tenantNotificationSettings = pgTable("tenant_notification_settings", {
  tenantId: uuid("tenant_id")
    .primaryKey()
    .references(() => tenants.id, { onDelete: "cascade" }),
  bookingCreated: boolean("booking_created").notNull().default(false),
  reminderEve: boolean("reminder_eve").notNull().default(true),
  reminder2h: boolean("reminder_2h").notNull().default(false),
  rescheduled: boolean("rescheduled").notNull().default(true),
  canceled: boolean("canceled").notNull().default(true),
  updatedAt: timestamptz("updated_at").notNull().defaultNow(),
});

/** Inscrições de dispositivos, sempre vinculadas a um usuário do estabelecimento. */
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: tenantIdColumn(),
  userId: uuid("user_id").notNull(),
  endpointHash: text("endpoint_hash").notNull().unique(),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  updatedAt: timestamptz("updated_at").notNull().defaultNow(),
}, (t) => [
  foreignKey({ name: "push_subscriptions_membership_fk", columns: [t.userId, t.tenantId], foreignColumns: [memberships.userId, memberships.tenantId] }).onDelete("cascade"),
  unique("push_subscriptions_tenant_id_id_unique").on(t.tenantId, t.id),
  index("push_subscriptions_tenant_user_idx").on(t.tenantId, t.userId),
]);

/** Eventos de agenda sem dados pessoais; processamento de push ainda desligado. */
export const pushEvents = pgTable("push_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: tenantIdColumn(),
  bookingId: uuid("booking_id").notNull(),
  eventType: text("event_type").notNull(),
  eventKey: text("event_key").notNull(),
  expandedAt: timestamptz("expanded_at"),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
}, (t) => [
  foreignKey({ name: "push_events_booking_fk", columns: [t.tenantId, t.bookingId], foreignColumns: [bookings.tenantId, bookings.id] }).onDelete("cascade"),
  unique("push_events_identity_unique").on(t.tenantId, t.bookingId, t.eventType, t.eventKey),
  unique("push_events_tenant_id_id_unique").on(t.tenantId, t.id),
  check("push_events_type_check", sql`${t.eventType} in ('booking_created', 'booking_canceled', 'booking_rescheduled')`),
  check("push_events_key_length_check", sql`length(${t.eventKey}) between 1 and 160`),
]);

/** Uma reserva por evento e dispositivo, com falhas ambíguas para revisão. */
export const pushDeliveries = pgTable("push_deliveries", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: tenantIdColumn(),
  eventId: uuid("event_id").notNull(),
  subscriptionId: uuid("subscription_id").notNull(),
  status: text("status").notNull().default("pending"),
  claimedAt: timestamptz("claimed_at"),
  expirationReason: text("expiration_reason"),
  subscriptionVersion: text("subscription_version"),
  completedAt: timestamptz("completed_at"),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
}, (t) => [
  foreignKey({ name: "push_deliveries_event_fk", columns: [t.tenantId, t.eventId], foreignColumns: [pushEvents.tenantId, pushEvents.id] }).onDelete("cascade"),
  foreignKey({ name: "push_deliveries_subscription_fk", columns: [t.tenantId, t.subscriptionId], foreignColumns: [pushSubscriptions.tenantId, pushSubscriptions.id] }).onDelete("cascade"),
  unique("push_deliveries_event_subscription_unique").on(t.eventId, t.subscriptionId),
  index("push_deliveries_status_created_idx").on(t.status, t.createdAt),
  check("push_deliveries_status_check", sql`${t.status} in ('pending', 'processing', 'sent', 'expired', 'uncertain')`),
  check("push_deliveries_expiration_reason_check", sql`${t.expirationReason} is null or ${t.expirationReason} in ('event_old', 'subscription_gone')`),
]);

/** Histórico e auditoria de mensagens e lembretes enviados/recebidos via WhatsApp. */
export const whatsappMessages = pgTable(
  "whatsapp_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantIdColumn(),
    bookingId: uuid("booking_id"),
    queueId: uuid("queue_id"),
    direction: text("direction").notNull().default("outbound"),
    templateType: whatsappTemplateType("template_type"),
    recipientPhone: text("recipient_phone").notNull(),
    recipientName: text("recipient_name"),
    wamId: text("wam_id").unique(),
    status: whatsappMessageStatus("status").notNull().default("queued"),
    failureCode: text("failure_code"),
    failureReason: text("failure_reason"),
    sentAt: timestamptz("sent_at"),
    deliveredAt: timestamptz("delivered_at"),
    readAt: timestamptz("read_at"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "whatsapp_messages_booking_fk",
      columns: [t.tenantId, t.bookingId],
      foreignColumns: [bookings.tenantId, bookings.id],
    }).onDelete("set null"),
    foreignKey({ name: "whatsapp_messages_queue_fk", columns: [t.tenantId, t.queueId], foreignColumns: [whatsappQueue.tenantId, whatsappQueue.id] }).onDelete("set null"),
    index("whatsapp_messages_tenant_created_idx").on(t.tenantId, t.createdAt),
    index("whatsapp_messages_wam_id_idx").on(t.wamId),
    index("whatsapp_messages_phone_created_idx").on(t.recipientPhone, t.createdAt),
    check("whatsapp_messages_direction_check", sql`${t.direction} in ('outbound', 'inbound')`),
  ],
);

/** Fila transacional de disparos de WhatsApp com agendamento e idempotência. */
export const whatsappQueue = pgTable(
  "whatsapp_queue",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantIdColumn(),
    bookingId: uuid("booking_id").notNull(),
    templateType: whatsappTemplateType("template_type").notNull(),
    /** Identifica o evento de negócio; reenvios do mesmo evento usam a mesma chave. */
    eventKey: text("event_key").notNull(),
    scheduledFor: timestamptz("scheduled_for").notNull(),
    attempts: integer("attempts").notNull().default(0),
    lockedUntil: timestamptz("locked_until"),
    processedAt: timestamptz("processed_at"),
    errorMessage: text("error_message"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "whatsapp_queue_booking_fk",
      columns: [t.tenantId, t.bookingId],
      foreignColumns: [bookings.tenantId, bookings.id],
    }).onDelete("cascade"),
    unique("whatsapp_queue_tenant_booking_template_event_unique").on(
      t.tenantId,
      t.bookingId,
      t.templateType,
      t.eventKey,
    ),
    unique("whatsapp_queue_tenant_id_id_unique").on(t.tenantId, t.id),
    index("whatsapp_queue_due_idx").on(t.scheduledFor, t.processedAt, t.lockedUntil),
  ],
);

export type TenantNotificationSettings = typeof tenantNotificationSettings.$inferSelect;
export type NewTenantNotificationSettings = typeof tenantNotificationSettings.$inferInsert;
export type WhatsappMessage = typeof whatsappMessages.$inferSelect;
export type NewWhatsappMessage = typeof whatsappMessages.$inferInsert;
export type WhatsappQueueItem = typeof whatsappQueue.$inferSelect;
export type NewWhatsappQueueItem = typeof whatsappQueue.$inferInsert;

/** Links adicionais de gestão para notificações; somente o hash é persistido. */
export const bookingManageTokens = pgTable("booking_manage_tokens", {
  tokenHash: text("token_hash").primaryKey(),
  tenantId: tenantIdColumn(),
  bookingId: uuid("booking_id").notNull(),
  expiresAt: timestamptz("expires_at").notNull(),
}, (t) => [
  foreignKey({ name: "booking_manage_tokens_booking_fk", columns: [t.tenantId, t.bookingId], foreignColumns: [bookings.tenantId, bookings.id] }).onDelete("cascade"),
  index("booking_manage_tokens_booking_idx").on(t.tenantId, t.bookingId),
]);

/** Registro global de IDs da Meta; não contém telefone nem conteúdo da mensagem. */
export const whatsappInboundEvents = pgTable("whatsapp_inbound_events", {
  id: text("id").primaryKey(),
  state: text("state").notNull().default("processing"),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  claimedAt: timestamptz("claimed_at").notNull().defaultNow(),
  attempts: integer("attempts").notNull().default(1),
  /** Conteúdo cifrado temporário para recuperação; removido ao concluir. */
  payloadEncrypted: text("payload_encrypted"),
  completedAt: timestamptz("completed_at"),
}, (t) => [check("whatsapp_inbound_event_state_check", sql`${t.state} in ('processing', 'completed', 'uncertain')`)]);

/** Fila global de sinais do provedor; dados de pagamento são obtidos na API. */
export const billingWebhookEvents = pgTable("billing_webhook_events", {
  requestId: text("request_id").primaryKey(),
  /** Quem enviou o aviso (o id do aviso só é único dentro de cada provedor). */
  provider: text("provider").notNull().default("mercadopago"),
  resourceId: text("resource_id").notNull(),
  topic: text("topic").notNull(),
  receivedAt: timestamptz("received_at").notNull().defaultNow(),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: timestamptz("next_attempt_at"),
  processedAt: timestamptz("processed_at"),
}, (t) => [
  index("billing_webhook_events_pending_idx").on(t.processedAt, t.receivedAt),
  uniqueIndex("billing_webhook_events_provider_request_unique").on(t.provider, t.requestId),
  check("billing_webhook_events_provider_check", sql`${t.provider} in ('mercadopago', 'stripe')`),
  check("billing_webhook_events_topic_check", sql`${t.topic} in ('payment', 'subscription_preapproval', 'subscription_authorized_payment', 'stripe_event')`),
]);

/** Assinaturas vinculadas a um estabelecimento, sem armazenar dados de cartão. */
export const billingSubscriptions = pgTable("billing_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: tenantIdColumn(),
  planId: uuid("plan_id").notNull().references(() => plans.id, { onDelete: "restrict" }),
  /** Provedor em que esta assinatura nasceu; renovação, cancelamento e troca de plano sempre usam este. */
  provider: text("provider").notNull().default("mercadopago"),
  providerId: text("provider_id").unique(),
  /** Cliente no provedor (Stripe `cus_…`); a Mercado Pago não usa. */
  providerCustomerId: text("provider_customer_id"),
  providerStatus: text("provider_status").notNull().default("pending"),
  checkoutUrl: text("checkout_url"),
  priceCents: integer("price_cents"),
  providerUpdatedAt: timestamptz("provider_updated_at"),
  /** Cancelada: até quando o período já pago dá acesso (depois disso o estabelecimento deixa de poder agendar). */
  accessUntil: timestamptz("access_until"),
  /** Troca de plano marcada para o próximo ciclo (downgrade); some quando aplicada ou desfeita. */
  scheduledPlanId: uuid("scheduled_plan_id").references(() => plans.id, { onDelete: "set null" }),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
}, (t) => [
  unique("billing_subscriptions_tenant_id_id_unique").on(t.tenantId, t.id),
  index("billing_subscriptions_tenant_idx").on(t.tenantId, t.createdAt),
  check("billing_subscriptions_provider_check", sql`${t.provider} in ('mercadopago', 'stripe')`),
]);

/** Reserva idempotente de aviso; resultados incertos não são reenviados automaticamente. */
export const billingNotices = pgTable("billing_notices", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: tenantIdColumn(),
  pastDueAt: timestamptz("past_due_at").notNull(),
  state: text("state").notNull().default("sending"),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  completedAt: timestamptz("completed_at"),
}, (t) => [
  unique("billing_notices_tenant_due_unique").on(t.tenantId, t.pastDueAt),
  check("billing_notices_state_check", sql`${t.state} in ('sending', 'sent', 'uncertain')`),
]);

/** Reserva idempotente dos e-mails de fim do teste (um por tipo e estabelecimento); resultado incerto não reenvia. */
export const trialNotices = pgTable("trial_notices", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: tenantIdColumn(),
  kind: text("kind").notNull(),
  state: text("state").notNull().default("sending"),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  completedAt: timestamptz("completed_at"),
}, (t) => [
  unique("trial_notices_tenant_kind_unique").on(t.tenantId, t.kind),
  check("trial_notices_kind_check", sql`${t.kind} in ('ending', 'ended')`),
  check("trial_notices_state_check", sql`${t.state} in ('sending', 'sent', 'uncertain')`),
]);

/** Faturas identificadas pelo provedor, sempre vinculadas à assinatura do mesmo tenant. */
export const billingInvoices = pgTable("billing_invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: tenantIdColumn(),
  subscriptionId: uuid("subscription_id").notNull(),
  providerId: text("provider_id").notNull().unique(),
  paymentId: text("payment_id").unique(),
  providerStatus: text("provider_status").notNull(),
  amountCents: integer("amount_cents").notNull(),
  dueAt: timestamptz("due_at"),
  paidAt: timestamptz("paid_at"),
  providerUpdatedAt: timestamptz("provider_updated_at"),
  invoiceUpdatedAt: timestamptz("invoice_updated_at"),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
}, (t) => [
  foreignKey({ name: "billing_invoices_subscription_fk", columns: [t.tenantId, t.subscriptionId], foreignColumns: [billingSubscriptions.tenantId, billingSubscriptions.id] }).onDelete("restrict"),
  unique("billing_invoices_tenant_id_id_unique").on(t.tenantId, t.id),
  index("billing_invoices_tenant_idx").on(t.tenantId, t.createdAt),
  check("billing_invoices_amount_check", sql`${t.amountCents} >= 0`),
]);

/** Vínculo confirmado na fatura do provedor, não comprova pagamento aprovado. */
export const billingInvoicePaymentLinks = pgTable("billing_invoice_payment_links", {
  paymentId: text("payment_id").primaryKey(),
  tenantId: tenantIdColumn(),
  invoiceId: uuid("invoice_id").notNull(),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
}, (t) => [
  foreignKey({ name: "billing_invoice_payment_links_invoice_fk", columns: [t.tenantId, t.invoiceId], foreignColumns: [billingInvoices.tenantId, billingInvoices.id] }).onDelete("cascade"),
  index("billing_invoice_payment_links_invoice_idx").on(t.tenantId, t.invoiceId),
]);

/** Uma fatura pode ter várias tentativas, identificadas de forma única pelo provedor. */
export const billingPaymentAttempts = pgTable("billing_payment_attempts", {
  paymentId: text("payment_id").primaryKey(),
  tenantId: tenantIdColumn(),
  invoiceId: uuid("invoice_id").notNull(),
  status: text("status").notNull(),
  providerUpdatedAt: timestamptz("provider_updated_at").notNull(),
  paidAt: timestamptz("paid_at"),
}, (t) => [
  foreignKey({ name: "billing_payment_attempts_invoice_fk", columns: [t.tenantId, t.invoiceId], foreignColumns: [billingInvoices.tenantId, billingInvoices.id] }).onDelete("cascade"),
  index("billing_payment_attempts_invoice_idx").on(t.tenantId, t.invoiceId),
]);



/** Cobranças avulsas do plano (Pix ou boleto): um QR code ou boleto por mês de acesso. */
export const billingCharges = pgTable("billing_charges", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: tenantIdColumn(),
  planId: uuid("plan_id").notNull().references(() => plans.id, { onDelete: "restrict" }),
  /** Provedor em que a cobrança foi criada; a conciliação usa sempre este. */
  provider: text("provider").notNull().default("mercadopago"),
  method: text("method").notNull(),
  amountCents: integer("amount_cents").notNull(),
  /** `creating` e `uncertain` cobrem a criação no provedor (um tempo esgotado pode ter criado o pagamento). */
  status: text("status").notNull().default("creating"),
  providerPaymentId: text("provider_payment_id").unique(),
  qrCode: text("qr_code"),
  qrCodeBase64: text("qr_code_base64"),
  ticketUrl: text("ticket_url"),
  barcode: text("barcode"),
  expiresAt: timestamptz("expires_at"),
  providerUpdatedAt: timestamptz("provider_updated_at"),
  paidAt: timestamptz("paid_at"),
  /** Mês de acesso que este pagamento compra (preenchido ao aprovar). */
  periodStart: timestamptz("period_start"),
  periodEnd: timestamptz("period_end"),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
}, (t) => [
  unique("billing_charges_tenant_id_id_unique").on(t.tenantId, t.id),
  index("billing_charges_tenant_idx").on(t.tenantId, t.createdAt),
  check("billing_charges_method_check", sql`${t.method} in ('pix', 'boleto')`),
  check("billing_charges_provider_check", sql`${t.provider} in ('mercadopago', 'stripe')`),
  check("billing_charges_status_check", sql`${t.status} in ('creating', 'uncertain', 'pending', 'approved', 'expired', 'cancelled', 'refunded', 'charged_back')`),
  check("billing_charges_amount_check", sql`${t.amountCents} > 0`),
  // Uma cobrança em aberto por estabelecimento.
  uniqueIndex("billing_charges_one_open_idx").on(t.tenantId).where(sql`${t.status} in ('creating', 'uncertain', 'pending')`),
]);

/** Reserva idempotente do aviso "seu plano vence em breve" (um por estabelecimento e fim de período pago). */
export const billingRenewalNotices = pgTable("billing_renewal_notices", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: tenantIdColumn(),
  periodEnd: timestamptz("period_end").notNull(),
  state: text("state").notNull().default("sending"),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  completedAt: timestamptz("completed_at"),
}, (t) => [
  unique("billing_renewal_notices_tenant_period_unique").on(t.tenantId, t.periodEnd),
  check("billing_renewal_notices_state_check", sql`${t.state} in ('sending', 'sent', 'uncertain')`),
]);

/**
 * Provedor padrão de cada forma de pagamento para NOVAS contratações e cobranças (uma linha por forma).
 * Mudar aqui nunca mexe no que já existe: cada assinatura e cobrança guarda o seu próprio `provider`.
 * Tabela global (sem estabelecimento): só a conexão da plataforma lê e grava.
 */
export const paymentGatewaySettings = pgTable("payment_gateway_settings", {
  method: text("method").primaryKey(),
  provider: text("provider").notNull().default("mercadopago"),
  updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
}, (t) => [
  check("payment_gateway_settings_method_check", sql`${t.method} in ('card', 'pix', 'boleto')`),
  check("payment_gateway_settings_provider_check", sql`${t.provider} in ('mercadopago', 'stripe')`),
]);
