import { businessHours, professionalHours, professionals } from "@/db/schema";
import { defaultBusinessHours, WEEKDAYS } from "@/lib/weekly-hours";
import { withTenantTx, type TenantTx } from "@/server/tenant-db";

/** Cor do primeiro profissional (a do dono): a primeira da paleta. */
export const OWNER_PROFESSIONAL_COLOR = "#3E07D2";

/**
 * O que todo estabelecimento novo já tem ao entrar: horário de funcionamento
 * padrão e o dono como primeiro profissional (mesmo horário). Roda dentro da
 * transação do cadastro, sob as regras de RLS do próprio tenant.
 */
export async function seedTenantDefaults(
  tx: TenantTx,
  input: { tenantId: string; ownerUserId: string; ownerName: string },
): Promise<void> {
  const { tenantId } = input;
  const week = defaultBusinessHours();
  await withTenantTx(tx, tenantId, async (t) => {
    const hours = WEEKDAYS.flatMap((weekday) =>
      week[weekday].map((r) => ({ weekday, startsAt: r.start, endsAt: r.end })),
    );
    await t.insert(businessHours).values(hours.map((h) => ({ tenantId, ...h })));

    const [owner] = await t
      .insert(professionals)
      .values({
        tenantId,
        name: input.ownerName,
        color: OWNER_PROFESSIONAL_COLOR,
        userId: input.ownerUserId,
        sortOrder: 0,
      })
      .returning({ id: professionals.id });
    await t
      .insert(professionalHours)
      .values(hours.map((h) => ({ tenantId, professionalId: owner.id, ...h })));
  });
}
