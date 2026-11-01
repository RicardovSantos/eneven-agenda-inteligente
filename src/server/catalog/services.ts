import { and, eq, inArray, isNull, max, notExists, sql } from "drizzle-orm";
import { professionalServices, professionals, serviceCategories, services } from "@/db/schema";
import type { Db } from "@/db/types";
import { withTenant, type TenantTx } from "@/server/tenant-db";
import { CatalogError, notFoundError, validationError } from "./errors";

export const SERVICE_NAME_MAX = 80;
export const SERVICE_DESCRIPTION_MAX = 300;
export const SERVICE_CATEGORY_MAX = 40;
export const MAX_PRICE_CENTS = 99_999_999;

export type ServiceInput = {
  id?: string;
  name: string;
  description?: string | null;
  /** 5 a 480, múltiplo de 5. */
  durationMin: number;
  /** 0 a 60. */
  bufferAfterMin: number;
  priceCents: number;
  visible: boolean;
  /** Nome da categoria (criada se ainda não existir); vazio tira o serviço de qualquer categoria. */
  categoryName?: string | null;
  professionalIds: string[];
};

export type ServiceRow = {
  id: string;
  name: string;
  description: string | null;
  durationMin: number;
  bufferAfterMin: number;
  priceCents: number;
  visible: boolean;
  sortOrder: number;
  categoryId: string | null;
  categoryName: string | null;
  archivedAt: Date | null;
  professionalIds: string[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: unknown): value is string =>
  typeof value === "string" && UUID.test(value);

const isInt = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value);

function validate(input: ServiceInput) {
  const errors: Record<string, string> = {};
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (name === "") errors.name = "Informe o nome do serviço.";
  else if (name.length > SERVICE_NAME_MAX)
    errors.name = `Use até ${SERVICE_NAME_MAX} caracteres no nome.`;

  const description =
    typeof input.description === "string" ? input.description.trim() : "";
  if (description.length > SERVICE_DESCRIPTION_MAX)
    errors.description = `Use até ${SERVICE_DESCRIPTION_MAX} caracteres na descrição.`;

  if (!isInt(input.durationMin) || input.durationMin < 5 || input.durationMin > 480 || input.durationMin % 5 !== 0)
    errors.durationMin = "A duração precisa estar entre 5 min e 8 h, de 5 em 5 minutos.";
  if (!isInt(input.bufferAfterMin) || input.bufferAfterMin < 0 || input.bufferAfterMin > 60)
    errors.bufferAfterMin = "O intervalo precisa estar entre 0 e 60 minutos.";
  if (!isInt(input.priceCents) || input.priceCents < 0 || input.priceCents > MAX_PRICE_CENTS)
    errors.priceCents = "Informe um preço válido.";

  const category = typeof input.categoryName === "string" ? input.categoryName.trim().replace(/\s+/g, " ") : "";
  if (category.length > SERVICE_CATEGORY_MAX)
    errors.categoryName = `Use até ${SERVICE_CATEGORY_MAX} caracteres na categoria.`;

  const ids = input.professionalIds;
  if (!Array.isArray(ids) || !ids.every(isUuid))
    errors.professionalIds = "Profissional inválido.";

  if (Object.keys(errors).length > 0) throw validationError(errors);
  return {
    name,
    description: description === "" ? null : description,
    durationMin: input.durationMin,
    bufferAfterMin: input.bufferAfterMin,
    priceCents: input.priceCents,
    visible: input.visible === true,
    categoryName: category === "" ? null : category,
    professionalIds: [...new Set(ids)],
  };
}

/** Serviços do estabelecimento na ordem de criação; arquivados só se pedido. */
export async function listServices(
  db: Db,
  tenantId: string,
  opts: { includeArchived?: boolean } = {},
): Promise<ServiceRow[]> {
  return withTenant(db, tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(services)
      .where(
        and(
          eq(services.tenantId, tenantId),
          opts.includeArchived ? undefined : isNull(services.archivedAt),
        ),
      )
      .orderBy(services.sortOrder, services.createdAt, services.id);
    const categories = await tx
      .select({ id: serviceCategories.id, name: serviceCategories.name })
      .from(serviceCategories)
      .where(eq(serviceCategories.tenantId, tenantId));
    const categoryName = new Map(categories.map((c) => [c.id, c.name]));
    const links = await tx
      .select()
      .from(professionalServices)
      .where(eq(professionalServices.tenantId, tenantId));
    const byService = new Map<string, string[]>();
    for (const l of links) {
      byService.set(l.serviceId, [...(byService.get(l.serviceId) ?? []), l.professionalId]);
    }
    return rows.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      durationMin: s.durationMin,
      bufferAfterMin: s.bufferAfterMin,
      priceCents: s.priceCents,
      visible: s.visible,
      sortOrder: s.sortOrder,
      categoryId: s.categoryId,
      categoryName: s.categoryId ? (categoryName.get(s.categoryId) ?? null) : null,
      archivedAt: s.archivedAt,
      professionalIds: byService.get(s.id) ?? [],
    }));
  });
}

/**
 * Cria ou edita um serviço e substitui quem o faz. Valida tudo antes de tocar
 * no banco; profissionais e serviço precisam ser do estabelecimento (RLS +
 * filtro explícito, então ids de outro tenant "não existem").
 */
export async function saveService(
  db: Db,
  tenantId: string,
  input: ServiceInput,
): Promise<{ id: string }> {
  const data = validate(input);
  if (input.id !== undefined && !isUuid(input.id)) throw notFoundError();

  return withTenant(db, tenantId, async (tx) => {
    if (data.professionalIds.length > 0) {
      const found = await tx
        .select({ id: professionals.id })
        .from(professionals)
        .where(
          and(
            eq(professionals.tenantId, tenantId),
            inArray(professionals.id, data.professionalIds),
          ),
        );
      if (found.length !== data.professionalIds.length) {
        throw validationError({ professionalIds: "Profissional inválido." });
      }
    }

    const categoryId = data.categoryName
      ? await findOrCreateCategory(tx, tenantId, data.categoryName)
      : null;

    const values = {
      name: data.name,
      description: data.description,
      categoryId,
      durationMin: data.durationMin,
      bufferAfterMin: data.bufferAfterMin,
      priceCents: data.priceCents,
      visible: data.visible,
    };

    let id: string;
    if (input.id) {
      const updated = await tx
        .update(services)
        .set(values)
        .where(
          and(
            eq(services.tenantId, tenantId),
            eq(services.id, input.id),
            isNull(services.archivedAt),
          ),
        )
        .returning({ id: services.id });
      if (updated.length === 0) {
        const [existing] = await tx
          .select({ id: services.id })
          .from(services)
          .where(and(eq(services.tenantId, tenantId), eq(services.id, input.id)));
        throw existing
          ? new CatalogError("not_found", "Serviço arquivado. Restaure para editar.")
          : notFoundError();
      }
      id = updated[0].id;
    } else {
      const [{ top }] = await tx
        .select({ top: max(services.sortOrder) })
        .from(services)
        .where(eq(services.tenantId, tenantId));
      const [created] = await tx
        .insert(services)
        .values({ tenantId, ...values, sortOrder: (top ?? -1) + 1 })
        .returning({ id: services.id });
      id = created.id;
    }

    await tx
      .delete(professionalServices)
      .where(and(eq(professionalServices.tenantId, tenantId), eq(professionalServices.serviceId, id)));
    if (data.professionalIds.length > 0) {
      await tx.insert(professionalServices).values(
        data.professionalIds.map((professionalId) => ({
          tenantId,
          professionalId,
          serviceId: id,
        })),
      );
    }
    await deleteEmptyCategories(tx, tenantId);
    return { id };
  });
}

/** Categoria pelo nome (sem diferenciar maiúsculas); cria no fim da lista se ainda não existe. */
async function findOrCreateCategory(tx: TenantTx, tenantId: string, name: string): Promise<string> {
  const [existing] = await tx
    .select({ id: serviceCategories.id })
    .from(serviceCategories)
    .where(and(eq(serviceCategories.tenantId, tenantId), sql`lower(${serviceCategories.name}) = lower(${name})`))
    .limit(1);
  if (existing) return existing.id;
  const [{ top }] = await tx
    .select({ top: max(serviceCategories.sortOrder) })
    .from(serviceCategories)
    .where(eq(serviceCategories.tenantId, tenantId));
  const [created] = await tx
    .insert(serviceCategories)
    .values({ tenantId, name, sortOrder: (top ?? -1) + 1 })
    .returning({ id: serviceCategories.id });
  return created.id;
}

/** Categoria sem nenhum serviço (nem arquivado) some: não sobra grupo vazio. */
async function deleteEmptyCategories(tx: TenantTx, tenantId: string): Promise<void> {
  await tx.delete(serviceCategories).where(
    and(
      eq(serviceCategories.tenantId, tenantId),
      notExists(
        tx
          .select({ one: sql`1` })
          .from(services)
          .where(and(eq(services.tenantId, tenantId), eq(services.categoryId, serviceCategories.id))),
      ),
    ),
  );
}

async function setArchived(db: Db, tenantId: string, id: string, archivedAt: Date | null) {
  if (!isUuid(id)) throw notFoundError();
  const updated = await withTenant(db, tenantId, (tx) =>
    tx
      .update(services)
      .set({ archivedAt })
      .where(and(eq(services.tenantId, tenantId), eq(services.id, id)))
      .returning({ id: services.id }),
  );
  if (updated.length === 0) throw notFoundError();
}

/** Some da página pública e do painel; agendamentos antigos mantêm a cópia. */
export function archiveService(db: Db, tenantId: string, id: string, now: Date = new Date()) {
  return setArchived(db, tenantId, id, now);
}

export function restoreService(db: Db, tenantId: string, id: string) {
  return setArchived(db, tenantId, id, null);
}
