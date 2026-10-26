// The referral program: the admin turns it on and sets the bonus; the clients' friends and
// who brings them.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Gift } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { api, errorText, unwrap, type Schemas } from "../../api/client";
import { QueryBoundary } from "../../components/query";
import { SwitchRow } from "../../components/switch";
import { useToast } from "../../components/toast";
import { Button, EmptyState, PageHeader, Pill, Skeleton } from "../../components/ui";
import { t } from "../../i18n";
import { ago } from "../../lib/format";

type Settings = Schemas["ReferralSettingsView"];

const who = (username?: string, name?: string, id?: number) => (username ? `@${username}` : name || `tg ${id}`);

export function ReferralsPage() {
  const q = useQuery({ queryKey: ["referrals"], queryFn: ({ signal }) => unwrap(api.GET("/api/v1/referrals", { signal })), refetchInterval: 30_000 });
  return (
    <>
      <PageHeader title={t("referrals.title")} sub={t("referrals.sub")} />
      <QueryBoundary query={q} pending={<Skeleton style={{ height: 320, borderRadius: 16 }} />}>
        {(v) => (
          <div className="flex max-w-5xl flex-col gap-4">
            <SettingsCard value={v.settings} />
            <section className="card glass reveal grid grid-cols-2 gap-3 sm:grid-cols-5" aria-label={t("referrals.title")}>
              {(
                [
                  ["invited", v.totals.invited],
                  ["paid", v.totals.paid],
                  ["earned", v.totals.earned],
                  ["waiting", v.totals.waiting],
                  ["referrers", v.totals.referrers],
                ] as const
              ).map(([k, n]) => (
                <div key={k} className="rounded-2xl border border-[var(--hairline)] bg-[var(--surface-soft)] px-4 py-3">
                  <div className="text-[13px] text-[var(--ink-600)]">{t(`referrals.${k}`)}</div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums">{n}</div>
                </div>
              ))}
            </section>
            {v.recent.length === 0 ? (
              <section className="card glass reveal">
                <EmptyState icon={Gift} title={t("referrals.empty")} text={t("referrals.emptyText")} />
              </section>
            ) : (
              <>
                <section className="card glass reveal">
                  <h2 className="mb-3 text-[15px] font-semibold">{t("referrals.top")}</h2>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[14px]">
                      <thead className="text-left text-[13px] text-[var(--ink-600)]">
                        <tr>
                          <th className="py-2 pr-3 font-medium">{t("referrals.referrer")}</th>
                          <th className="py-2 pr-3 font-medium">{t("referrals.invited")}</th>
                          <th className="py-2 pr-3 font-medium">{t("referrals.paid")}</th>
                          <th className="py-2 font-medium">{t("referrals.earned")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {v.top.map((r) => (
                          <tr key={r.tg_id} className="border-t border-[var(--hairline)]">
                            <td className="py-2 pr-3">{who(r.tg_username, r.tg_name, r.tg_id)}</td>
                            <td className="py-2 pr-3 tabular-nums">{r.invited}</td>
                            <td className="py-2 pr-3 tabular-nums">{r.paid}</td>
                            <td className="py-2 tabular-nums">{r.earned}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
                <section className="card glass reveal">
                  <h2 className="mb-3 text-[15px] font-semibold">{t("referrals.recent")}</h2>
                  <ul className="flex flex-col gap-2">
                    {v.recent.map((r) => (
                      <li key={r.tg_id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--hairline)] bg-[var(--surface-soft)] px-4 py-3">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{who(r.tg_username, r.tg_name, r.tg_id)}</span>
                          <span className="block truncate text-[13px] text-[var(--ink-600)]">
                            {t("referrals.referrer")}: {who(r.referrer_username, r.referrer_name, r.referrer_id)} · {ago(r.created_at)}
                          </span>
                        </span>
                        {!r.paid_at ? (
                          <Pill tone="off">{t("referrals.statusNew")}</Pill>
                        ) : r.rewarded_at ? (
                          <Pill tone="ok">{t("referrals.statusPaid", { n: r.days })}</Pill>
                        ) : (
                          <Pill tone="warn">{t("referrals.statusWaiting", { n: r.days })}</Pill>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              </>
            )}
          </div>
        )}
      </QueryBoundary>
    </>
  );
}

function SettingsCard({ value }: { value: Settings }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [days, setDays] = useState(String(value.days));
  useEffect(() => setDays(String(value.days)), [value.days]);
  const save = useMutation({
    mutationFn: (body: Settings) => unwrap(api.PUT("/api/v1/referrals/settings", { body })),
    onSuccess: () => toast.ok(t("referrals.saved")),
    onError: (e) => toast.error(errorText(e)),
    onSettled: () => void qc.invalidateQueries({ queryKey: ["referrals"] }),
  });
  const n = Number(days);
  const valid = Number.isInteger(n) && n >= 1 && n <= 365;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (valid) save.mutate({ enabled: value.enabled, days: n });
  };
  return (
    <section className="card glass reveal flex flex-col gap-4">
      <SwitchRow
        label={t("referrals.enabled")}
        sub={t("referrals.enabledSub")}
        checked={save.isPending ? !!save.variables?.enabled : value.enabled}
        disabled={save.isPending}
        onChange={(v) => save.mutate({ enabled: v, days: valid ? n : value.days })}
      />
      <form onSubmit={submit} className="flex flex-col gap-2">
        <label htmlFor="referral-days" className="text-[13px] font-medium">
          {t("referrals.days")}
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            id="referral-days"
            className="input w-32"
            type="number"
            inputMode="numeric"
            min={1}
            max={365}
            value={days}
            aria-invalid={!valid}
            onChange={(e) => setDays(e.target.value)}
          />
          <Button type="submit" size="sm" variant="primary" loading={save.isPending} disabled={!valid || n === value.days}>
            {t("referrals.save")}
          </Button>
        </div>
        <p className="text-xs text-[var(--ink-500)]">{t("referrals.daysHint")}</p>
      </form>
    </section>
  );
}
