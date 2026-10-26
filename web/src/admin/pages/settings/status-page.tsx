// The public status page: the admin turns it on, names it and picks how many days it shows;
// below, the nodes as a visitor sees them now.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink } from "lucide-react";
import type { FormEvent } from "react";
import { api, errorText, unwrap, type Schemas } from "../../../api/client";
import { CardHead, FormActions } from "../../../components/layout";
import { QueryBoundary } from "../../../components/query";
import { SwitchRow } from "../../../components/switch";
import { useToast } from "../../../components/toast";
import { Field, Pill, Segmented, Skeleton } from "../../../components/ui";
import { t } from "../../../i18n";
import { useCopy } from "../../../lib/copy";
import { useDraft } from "../../../lib/draft";

type Settings = Schemas["StatusPageSettingsView"];
type Report = Schemas["PageReport"];

const DAYS = ["30", "60", "90"] as const;

export function StatusPageCard() {
  const q = useQuery({ queryKey: ["status-page"], queryFn: ({ signal }) => unwrap(api.GET("/api/v1/status-page", { signal })), refetchInterval: 60_000 });
  return (
    <section className="card glass reveal" style={{ "--i": 1 } as React.CSSProperties}>
      <CardHead title={t("settings.statusPage.title")} sub={t("settings.statusPage.sub")} />
      <QueryBoundary query={q} pending={<Skeleton style={{ height: 180, borderRadius: 12 }} />}>
        {(v) => (
          <>
            <Form value={v.settings} url={v.url} />
            <Nodes report={v.report} />
          </>
        )}
      </QueryBoundary>
    </section>
  );
}

function Form({ value, url }: { value: Settings; url: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const copy = useCopy();
  const { draft, setDraft } = useDraft(value.title);
  const save = useMutation({
    mutationFn: (body: Settings) => unwrap(api.PUT("/api/v1/status-page/settings", { body })),
    onSuccess: () => toast.ok(t("settings.statusPage.saved")),
    onError: (e) => toast.error(errorText(e)),
    onSettled: () => void qc.invalidateQueries({ queryKey: ["status-page"] }),
  });
  const title = draft.trim();
  const tooLong = [...title].length > 80;
  const shown = save.isPending && save.variables ? save.variables : value;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!tooLong && title !== value.title) save.mutate({ ...value, title });
  };
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <SwitchRow
        label={t("settings.statusPage.enabled")}
        sub={t("settings.statusPage.enabledSub")}
        checked={shown.enabled}
        disabled={save.isPending}
        onChange={(enabled) => save.mutate({ ...value, enabled })}
      />
      {value.enabled && url ? (
        <div className="flex flex-wrap items-center gap-2">
          <code className="mono min-w-0 flex-1 truncate rounded-xl border border-[var(--hairline)] bg-[var(--surface-soft)] px-3 py-2 text-[13px]">{url}</code>
          <a className="icon-btn" href={url} target="_blank" rel="noreferrer" aria-label={t("settings.statusPage.open")} title={t("settings.statusPage.open")}>
            <ExternalLink size={16} />
          </a>
          <button type="button" className="icon-btn" onClick={() => void copy(url, t("settings.statusPage.copied"))} aria-label={t("settings.statusPage.copy")} title={t("settings.statusPage.copy")}>
            <Copy size={16} />
          </button>
        </div>
      ) : null}
      <Field label={t("settings.statusPage.days")} htmlFor="s-status-days">
        <Segmented
          label={t("settings.statusPage.days")}
          value={String(shown.days) as (typeof DAYS)[number]}
          options={DAYS.map((d) => ({ value: d, label: t("settings.statusPage.daysN", { n: d }) }))}
          disabled={save.isPending}
          onChange={(d) => save.mutate({ ...value, days: Number(d) as Settings["days"] })}
        />
      </Field>
      <Field label={t("settings.statusPage.name")} htmlFor="s-status-title" hint={t("settings.statusPage.nameHint")} error={tooLong ? t("errors.api.bad_status_title") : undefined}>
        <input
          id="s-status-title"
          className="input max-w-[360px]"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t("settings.statusPage.namePlaceholder")}
          aria-invalid={tooLong}
          autoComplete="off"
        />
      </Field>
      <FormActions saving={save.isPending && save.variables?.title === title && title !== value.title} disabled={tooLong || title === value.title} />
    </form>
  );
}

function percent(v: number) {
  return `${(Math.floor(v * 10000) / 100).toString()}%`;
}

function tone(d: Report["nodes"][number]["days"][number]) {
  if (d.checks === 0) return "var(--ink-200)";
  const v = d.ok / d.checks;
  return v >= 0.995 ? "var(--leaf-500)" : v >= 0.95 ? "var(--honey-500)" : "var(--berry-500)";
}

/** The nodes as the page shows them: the state now and a bar per day. */
function Nodes({ report }: { report: Report }) {
  return (
    <div className="mt-5 border-t border-[var(--line)] pt-4">
      <p className="mb-3 text-xs text-[var(--ink-600)]">{t("settings.statusPage.hint")}</p>
      {report.nodes.length === 0 ? (
        <p className="text-[13px] text-[var(--ink-500)]">{t("settings.statusPage.none")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {report.nodes.map((n) => (
            <li key={n.name} className="flex flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{n.name}</span>
                <span className="text-[12px] tabular-nums text-[var(--ink-600)]">{n.uptime >= 0 ? percent(n.uptime) : t("settings.statusPage.noData")}</span>
                <Pill tone={n.state === "up" ? "ok" : n.state === "down" ? "bad" : "off"}>{t(`settings.statusPage.${n.state}`)}</Pill>
              </div>
              <div className="flex h-5 gap-px" aria-hidden>
                {n.days.map((d) => (
                  <i key={d.day} className="min-w-px flex-1 rounded-[2px]" style={{ background: tone(d) }} />
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
