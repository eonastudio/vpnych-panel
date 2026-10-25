// A template's banners: a picture, a title, a text and a button, at the top, the bottom or
// after a block, on the page, in the Mini App or both, from and until a time.
import { ArrowDown, ArrowUp, ChevronDown, Megaphone, Trash2 } from "lucide-react";
import { useState } from "react";
import { Switch } from "../../../../components/switch";
import { Button, Field, Segmented } from "../../../../components/ui";
import { t } from "../../../../i18n";
import { safeHref } from "../../../../lib/url";
import { blockName } from "./blocks";
import { ImageField } from "./look";
import { assetOf, Card, imageName, LIMITS, MAX_BANNERS, type Banner, type TemplateProps, type View } from "./parts";

const newId = () => Math.random().toString(36).slice(2, 10) || "a";

/** A unix time as datetime-local's value (the admin's own time zone), and back. */
const toLocal = (unix: number) => {
  if (!unix) return "";
  const d = new Date(unix * 1000);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const fromLocal = (value: string) => (value ? Math.floor(new Date(value).getTime() / 1000) : 0);

function bannerName(b: Banner, i: number): string {
  return b.title.trim() || b.text.trim().slice(0, 40) || t("settings.page.tpl.bannerN", { n: i + 1 });
}

export function BannersSection({ tpl, setTpl, errors, at, v, announce }: TemplateProps & { v: View; announce: (text: string) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const banners = tpl.banners;
  const setBanner = (i: number, patch: Partial<Banner>) => setTpl((x) => ({ ...x, banners: x.banners.map((b, j) => (j === i ? { ...b, ...patch } : b)) }));
  const move = (i: number, step: -1 | 1) =>
    setTpl((x) => {
      const next = [...x.banners];
      const [b] = next.splice(i, 1);
      next.splice(i + step, 0, b!);
      return { ...x, banners: next };
    });
  const add = () => {
    const b: Banner = { id: newId(), on: true, title: "", text: "", image: "", button: { label: "", url: "" }, place: "top", after: "", from: 0, until: 0, tone: "accent", where: "all" };
    setTpl((x) => ({ ...x, banners: [...x.banners, b] }));
    setOpen(b.id);
  };
  const bannerErrors = (i: number) => Object.keys(errors).some((k) => k.startsWith(`${at}.banners[${i}]`));
  return (
    <Card title={t("settings.page.tpl.banners")} sub={t("settings.page.tpl.bannersSub")}>
      {banners.length === 0 ? <p className="py-2 text-sm text-[var(--ink-500)]">{t("settings.page.tpl.bannersNone")}</p> : null}
      <ul className="flex flex-col gap-2">
        {banners.map((b, i) => {
          const name = bannerName(b, i);
          const expanded = open === b.id || bannerErrors(i);
          const panel = `bn-panel-${b.id}`;
          return (
            <li key={b.id} className="panel-soft p-3">
              <div className="flex items-center gap-3">
                <Switch checked={b.on} label={t("settings.page.tpl.bannerShow", { name })} onChange={(on) => setBanner(i, { on })} />
                <div className={`min-w-0 flex-1 ${b.on ? "" : "opacity-60"}`}>
                  <div className="truncate text-[13px] font-semibold">{name}</div>
                  <div className="truncate text-xs text-[var(--ink-500)]">
                    {t(`settings.page.tpl.place.${b.place}`)} · {t(`settings.page.tpl.where.${b.where}`)}
                  </div>
                </div>
                <button type="button" className="icon-btn" disabled={i === 0} onClick={() => move(i, -1)} aria-label={t("settings.page.moveUp", { name })}>
                  <ArrowUp size={16} />
                </button>
                <button type="button" className="icon-btn" disabled={i === banners.length - 1} onClick={() => move(i, 1)} aria-label={t("settings.page.moveDown", { name })}>
                  <ArrowDown size={16} />
                </button>
                <button type="button" className="icon-btn" aria-expanded={expanded} aria-controls={panel} onClick={() => setOpen(open === b.id ? null : b.id)} aria-label={t("settings.page.tpl.bannerSetup", { name })}>
                  <ChevronDown size={16} className={`transition-transform ${expanded ? "rotate-180" : ""}`} />
                </button>
              </div>
              {expanded ? (
                <div id={panel} className="mt-3 border-t border-[var(--hairline)] pt-3">
                  <BannerSetup banner={b} prefix={`${at}.banners[${i}]`} tpl={tpl} v={v} errors={errors} set={(patch) => setBanner(i, patch)} />
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => {
                      setTpl((x) => ({ ...x, banners: x.banners.filter((y) => y.id !== b.id) }));
                      announce(t("settings.page.tpl.bannerRemoved", { name }));
                    }}
                  >
                    <Trash2 size={14} aria-hidden /> {t("settings.page.tpl.bannerRemove")}
                  </Button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <button type="button" className="chip-btn inline-flex items-center gap-1" onClick={add} disabled={banners.length >= MAX_BANNERS}>
          <Megaphone size={14} aria-hidden /> {t("settings.page.tpl.bannerAdd")}
        </button>
        <span className="text-xs text-[var(--ink-500)]">{banners.length >= MAX_BANNERS ? t("settings.page.tpl.bannersFull", { n: MAX_BANNERS }) : t("settings.page.tpl.bannersHint")}</span>
      </div>
    </Card>
  );
}

function BannerSetup({ banner: b, prefix, tpl, v, errors, set }: { banner: Banner; prefix: string; tpl: TemplateProps["tpl"]; v: View; errors: Record<string, string>; set: (patch: Partial<Banner>) => void }) {
  const err = (field: string) => errors[`${prefix}.${field}`];
  const urlErr = err("button.url") ?? (b.button.url && !safeHref(b.button.url, { tg: true }) ? t("errors.api.link_invalid") : undefined);
  const id = (f: string) => `bn-${b.id}-${f}`;
  return (
    <>
      <Field label={t("settings.page.tpl.bannerTitle")} htmlFor={id("title")} error={err("title")}>
        <input id={id("title")} className="input" value={b.title} maxLength={80} onChange={(e) => set({ title: e.target.value })} aria-invalid={!!err("title")} />
      </Field>
      <Field label={t("settings.page.text")} htmlFor={id("text")} error={err("text")}>
        <textarea id={id("text")} className="input" rows={3} value={b.text} maxLength={300} onChange={(e) => set({ text: e.target.value })} aria-invalid={!!err("text")} />
      </Field>
      <ImageField
        name={b.image || imageName("banner", tpl.id, b.id)}
        asset={assetOf(v, b.image)}
        limit={LIMITS.banner}
        label={t("settings.page.tpl.bannerImage")}
        hint={err("image") ?? t("settings.page.tpl.bannerImageHint")}
        onUploaded={(image) => set({ image })}
        onRemoved={() => set({ image: "" })}
      />
      <div className="grid gap-x-3 sm:grid-cols-2">
        <Field label={t("settings.page.tpl.buttonLabel")} htmlFor={id("label")} error={err("button.label")}>
          <input id={id("label")} className="input" value={b.button.label} maxLength={40} onChange={(e) => set({ button: { ...b.button, label: e.target.value } })} aria-invalid={!!err("button.label")} />
        </Field>
        <Field label={t("settings.page.tpl.buttonURL")} htmlFor={id("url")} error={urlErr}>
          <input id={id("url")} className="input mono" value={b.button.url} maxLength={500} placeholder="https://… / tg://…" spellCheck={false} onChange={(e) => set({ button: { ...b.button, url: e.target.value.trim() } })} aria-invalid={!!urlErr} />
        </Field>
      </div>
      <Field label={t("settings.page.tpl.bannerPlace")} error={err("place") ?? err("after")}>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            label={t("settings.page.tpl.bannerPlace")}
            value={b.place}
            onChange={(place) => set({ place, after: place === "after" ? b.after || (tpl.blocks[0]?.id ?? "") : "" })}
            options={[
              { value: "top", label: t("settings.page.tpl.place.top") },
              { value: "after", label: t("settings.page.tpl.place.after") },
              { value: "bottom", label: t("settings.page.tpl.place.bottom") },
            ]}
          />
          {b.place === "after" ? (
            <select className="input max-w-[240px]" value={b.after} onChange={(e) => set({ after: e.target.value })} aria-label={t("settings.page.tpl.bannerAfter")}>
              {tpl.blocks.map((x) => (
                <option key={x.id} value={x.id}>
                  {blockName(x)}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      </Field>
      <div className="grid gap-x-6 sm:grid-cols-2">
        <Field label={t("settings.page.tpl.bannerWhere")}>
          <Segmented
            label={t("settings.page.tpl.bannerWhere")}
            value={b.where}
            onChange={(where) => set({ where })}
            options={[
              { value: "all", label: t("settings.page.tpl.where.all") },
              { value: "miniapp", label: t("settings.page.tpl.where.miniapp") },
              { value: "browser", label: t("settings.page.tpl.where.browser") },
            ]}
          />
        </Field>
        <Field label={t("settings.page.tpl.bannerTone")}>
          <Segmented
            label={t("settings.page.tpl.bannerTone")}
            value={b.tone}
            onChange={(tone) => set({ tone })}
            options={[
              { value: "accent", label: t("settings.page.tpl.tone.accent") },
              { value: "card", label: t("settings.page.tpl.tone.card") },
              { value: "warning", label: t("settings.page.tpl.tone.warning") },
            ]}
          />
        </Field>
      </div>
      <div className="grid gap-x-3 sm:grid-cols-2">
        <Field label={t("settings.page.tpl.bannerFrom")} htmlFor={id("from")} hint={t("settings.page.tpl.bannerTimeHint")} error={err("from")}>
          <input id={id("from")} type="datetime-local" className="input" value={toLocal(b.from)} onChange={(e) => set({ from: fromLocal(e.target.value) })} />
        </Field>
        <Field label={t("settings.page.tpl.bannerUntil")} htmlFor={id("until")} hint={t("settings.page.tpl.bannerTimeHint")} error={err("until")}>
          <input id={id("until")} type="datetime-local" className="input" value={toLocal(b.until)} onChange={(e) => set({ until: fromLocal(e.target.value) })} />
        </Field>
      </div>
    </>
  );
}
