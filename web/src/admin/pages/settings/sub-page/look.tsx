// A template's look: the scheme and colours, the font and shapes, the background, and its CSS.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ImageUp } from "lucide-react";
import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import { api, errorText, unwrap } from "../../../../api/client";
import { qk } from "../../../../api/hooks";
import { Switch } from "../../../../components/switch";
import { useToast } from "../../../../components/toast";
import { Button, Field, Segmented, Skeleton } from "../../../../components/ui";
import { t } from "../../../../i18n";
import { fieldErrors } from "../../../../lib/fields";
import { assetOf, Card, COLOR, imageName, imageURL, LIMITS, MAX_CSS, type Asset, type Form, type Look, type TemplateProps, type View } from "./parts";

export function ColorField({ id, label, value, onChange, error, hint }: { id: string; label: string; value: string; onChange: (v: string) => void; error?: string; hint?: string }) {
  const valid = COLOR.test(value.trim());
  return (
    <Field label={label} htmlFor={id} error={error ?? (value.trim() && !valid ? t("settings.page.colorInvalid") : undefined)} hint={hint}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          className="h-11 w-11 shrink-0 cursor-pointer rounded-[var(--r-md)] border border-[var(--hairline)] bg-[var(--surface)] p-1"
          value={valid ? value.trim().toLowerCase() : "#1f9e8e"}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          aria-label={t("settings.page.colorPick", { name: label })}
        />
        <input id={id} className="input mono max-w-[140px]" value={value} maxLength={7} placeholder="#1F9E8E" autoComplete="off" spellCheck={false} onChange={(e) => onChange(e.target.value)} aria-invalid={!!error || (!!value.trim() && !valid)} />
      </div>
    </Field>
  );
}

const FONTS: { id: Look["font"]; family: string }[] = [
  { id: "inter", family: '"Inter", system-ui, sans-serif' },
  { id: "onest", family: '"Onest Variable", system-ui, sans-serif' },
  { id: "unbounded", family: '"Unbounded Variable", "Onest Variable", system-ui, sans-serif' },
  { id: "system", family: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
  { id: "rounded", family: 'ui-rounded, "SF Pro Rounded", "Nunito", system-ui, sans-serif' },
  { id: "mono", family: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace' },
];

const COLORS: { key: "bg" | "bg2" | "card" | "text" | "muted" | "accent" | "accent2" | "danger" }[] = [
  { key: "bg" },
  { key: "bg2" },
  { key: "card" },
  { key: "text" },
  { key: "muted" },
  { key: "accent" },
  { key: "accent2" },
  { key: "danger" },
];

type LookProps = TemplateProps & { v: View; draft: Form; setDraft: Dispatch<SetStateAction<Form>>; accentMissing: boolean };

export function LookSection({ tpl, setTpl, errors, at, v, draft, setDraft, accentMissing }: LookProps) {
  const look = tpl.look;
  const setLook = (patch: Partial<Look>) => setTpl((x) => ({ ...x, look: { ...x.look, ...patch } }));
  const bg = look.background;
  const setBg = (patch: Partial<Look["background"]>) => setLook({ background: { ...bg, ...patch } });
  const err = (field: string) => errors[`${at}.look.${field}`];
  const bgName = imageName("bg", tpl.id);
  return (
    <>
      <Card title={t("settings.page.tpl.colors")} sub={t("settings.page.tpl.colorsSub")}>
        <Field label={t("settings.page.tpl.scheme")} hint={t("settings.page.tpl.schemeHint")}>
          <Segmented
            label={t("settings.page.tpl.scheme")}
            value={look.scheme}
            onChange={(scheme) => setLook({ scheme })}
            options={[
              { value: "dark", label: t("settings.page.modeDark") },
              { value: "light", label: t("settings.page.modeLight") },
            ]}
          />
        </Field>
        <div className="grid gap-x-3 sm:grid-cols-2">
          {COLORS.map(({ key }) =>
            key === "accent" && look.brand_accent ? null : (
              <ColorField key={key} id={`sp-c-${key}`} label={t(`settings.page.tpl.color.${key}`)} value={look[key]} onChange={(val) => setLook({ [key]: val } as Partial<Look>)} error={err(key)} />
            ),
          )}
        </div>
        <Field label={t("settings.page.tpl.cardAlpha", { n: look.card_alpha })} htmlFor="sp-card-alpha" hint={t("settings.page.tpl.cardAlphaHint")}>
          <input id="sp-card-alpha" type="range" min={0} max={100} step={5} value={look.card_alpha} onChange={(e) => setLook({ card_alpha: Number(e.target.value) })} className="w-full accent-[var(--mikan-500)]" />
        </Field>
        <div className="flex items-center justify-between gap-3 py-1">
          <div>
            <div className="text-[13px] font-semibold">{t("settings.page.accentBrand")}</div>
            <div className="text-xs text-[var(--ink-500)]">{t("settings.page.tpl.brandAccentHint")}</div>
          </div>
          <Switch
            checked={look.brand_accent}
            label={t("settings.page.accentBrand")}
            onChange={(on) => {
              setLook({ brand_accent: on });
              // The brand's colour starts as the template's, not as an empty field to fill.
              if (on && !COLOR.test(draft.brand_accent.trim())) setDraft((d) => ({ ...d, brand_accent: look.accent }));
            }}
          />
        </div>
        {look.brand_accent ? (
          <ColorField
            id="sp-accent"
            label={t("settings.brandAccent")}
            value={draft.brand_accent}
            onChange={(brand_accent) => setDraft((d) => ({ ...d, brand_accent }))}
            error={errors.brand_accent ?? (accentMissing && draft.brand_accent.trim() === "" ? t("errors.api.color_required") : undefined)}
            hint={t("settings.page.brandAccentHint")}
          />
        ) : null}
      </Card>

      <Card title={t("settings.page.type")} sub={t("settings.page.typeSub")}>
        <Field label={t("settings.page.font")}>
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={t("settings.page.font")}>
            {FONTS.map((f) => (
              <button key={f.id} type="button" role="radio" aria-checked={look.font === f.id} className="opt" onClick={() => setLook({ font: f.id })}>
                <span className="text-[17px] leading-6 font-medium" style={{ fontFamily: f.family }}>
                  {t("settings.page.fontSample")}
                </span>
                <span className="text-xs text-[var(--ink-500)]">{t(`settings.page.tpl.font.${f.id}`)}</span>
              </button>
            ))}
          </div>
        </Field>
        <div className="grid gap-x-6 sm:grid-cols-2">
          <Field label={t("settings.page.tpl.headings")}>
            <Segmented
              label={t("settings.page.tpl.headings")}
              value={look.headings}
              onChange={(headings) => setLook({ headings })}
              options={[
                { value: "italic", label: t("settings.page.tpl.headingsItalic") },
                { value: "regular", label: t("settings.page.tpl.headingsRegular") },
              ]}
            />
          </Field>
          <Field label={t("settings.page.tpl.radius", { n: look.radius })} htmlFor="sp-radius">
            <input id="sp-radius" type="range" min={0} max={40} step={2} value={look.radius} onChange={(e) => setLook({ radius: Number(e.target.value) })} className="w-full accent-[var(--mikan-500)]" />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-center justify-between gap-3">
            <span>
              <span className="block text-[13px] font-semibold">{t("settings.page.tpl.glass")}</span>
              <span className="block text-xs text-[var(--ink-500)]">{t("settings.page.cardsGlassHint")}</span>
            </span>
            <Switch checked={look.glass} label={t("settings.page.tpl.glass")} onChange={(glass) => setLook({ glass })} />
          </label>
          <label className="flex items-center justify-between gap-3">
            <span>
              <span className="block text-[13px] font-semibold">{t("settings.page.tpl.glow")}</span>
              <span className="block text-xs text-[var(--ink-500)]">{t("settings.page.tpl.glowHint")}</span>
            </span>
            <Switch checked={look.glow} label={t("settings.page.tpl.glow")} onChange={(glow) => setLook({ glow })} />
          </label>
        </div>
      </Card>

      <Card title={t("settings.page.background")} sub={t("settings.page.backgroundSub")}>
        <Field label={t("settings.page.backgroundKind")} error={err("background.kind")}>
          <Segmented
            label={t("settings.page.backgroundKind")}
            value={bg.kind}
            onChange={(kind) => setBg({ kind, from: bg.from || (kind === "solid" || kind === "gradient" ? look.bg2 : ""), to: bg.to || (kind === "gradient" ? look.bg : "") })}
            options={[
              { value: "theme", label: t("settings.page.tpl.bgTemplate") },
              { value: "solid", label: t("settings.page.bgSolid") },
              { value: "gradient", label: t("settings.page.bgGradient") },
              { value: "image", label: t("settings.page.bgImage") },
            ]}
          />
        </Field>
        {bg.kind === "solid" || bg.kind === "gradient" ? (
          <div className="grid gap-x-3 sm:grid-cols-2">
            <ColorField id="sp-bg-from" label={bg.kind === "solid" ? t("settings.page.bgColor") : t("settings.page.bgFrom")} value={bg.from} onChange={(from) => setBg({ from })} error={err("background.from")} />
            {bg.kind === "gradient" ? <ColorField id="sp-bg-to" label={t("settings.page.bgTo")} value={bg.to} onChange={(to) => setBg({ to })} error={err("background.to")} /> : null}
          </div>
        ) : null}
        {bg.kind === "gradient" ? (
          <Field label={t("settings.page.bgAngle", { n: bg.angle })} htmlFor="sp-bg-angle">
            <input id="sp-bg-angle" type="range" min={0} max={359} step={1} value={bg.angle} onChange={(e) => setBg({ angle: Number(e.target.value) })} className="w-full accent-[var(--mikan-500)]" />
          </Field>
        ) : null}
        {bg.kind === "image" ? (
          <>
            <ImageField
              name={bg.image || bgName}
              asset={assetOf(v, bg.image)}
              limit={LIMITS.background}
              label={t("settings.page.bgImage")}
              hint={t("settings.page.bgImageHint")}
              onUploaded={(name) => setBg({ image: name })}
              onRemoved={() => setBg({ image: "" })}
            />
            <Field label={t("settings.page.bgDim", { n: bg.dim })} htmlFor="sp-bg-dim" hint={t("settings.page.bgDimHint")}>
              <input id="sp-bg-dim" type="range" min={0} max={80} step={5} value={bg.dim} onChange={(e) => setBg({ dim: Number(e.target.value) })} className="w-full accent-[var(--mikan-500)]" />
            </Field>
          </>
        ) : null}
      </Card>
    </>
  );
}

/** An image of the page (the logo, a background, a banner's): uploaded at once, sniffed by the server. */
export function ImageField({
  name,
  asset,
  label,
  hint,
  limit = LIMITS.logo,
  onUploaded,
  onRemoved,
}: {
  name: string;
  asset?: Asset;
  label: string;
  hint: string;
  /** The largest file, KB. */
  limit?: number;
  onUploaded?: (name: string) => void;
  onRemoved?: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [local, setLocal] = useState("");
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const data = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ""));
        r.onerror = () => reject(new Error("read"));
        r.readAsDataURL(file);
      });
      return unwrap(api.PUT("/api/v1/sub-page/images/{name}", { params: { path: { name } }, body: { data } }));
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.subPage });
      onUploaded?.(name);
      toast.ok(t("settings.page.imageUploaded"));
    },
  });
  const remove = useMutation({
    mutationFn: () => unwrap(api.DELETE("/api/v1/sub-page/images/{name}", { params: { path: { name } } })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.subPage });
      onRemoved?.();
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const pick = (file?: File) => {
    setLocal("");
    upload.reset();
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) setLocal(t("errors.api.image_type"));
    else if (file.size > limit * 1024) setLocal(t("errors.api.image_too_big", { value: limit }));
    else upload.mutate(file);
  };
  const error = local || (upload.error ? (fieldErrors(upload.error).data ?? errorText(upload.error)) : "");
  const src = imageURL(asset);
  return (
    <div className="field">
      <span className="lbl">{label}</span>
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-[14px] border border-dashed border-[var(--ink-300)] bg-[var(--surface-soft)]">
          {upload.isPending ? <Skeleton style={{ width: 64, height: 64, borderRadius: 0 }} /> : src ? <img src={src} alt="" className="h-full w-full object-cover" /> : <ImageUp size={20} className="text-[var(--ink-400)]" aria-hidden />}
        </span>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" loading={upload.isPending} onClick={() => input.current?.click()}>
            {asset ? t("settings.page.imageReplace") : t("settings.page.imageUpload")}
          </Button>
          {asset ? (
            <Button size="sm" variant="ghost" loading={remove.isPending} onClick={() => remove.mutate()}>
              {t("settings.page.imageRemove")}
            </Button>
          ) : null}
        </div>
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          tabIndex={-1}
          aria-label={label}
          onChange={(e) => {
            pick(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
      {error ? (
        <span className="err" role="alert">
          {error}
        </span>
      ) : (
        <span className="hint">{hint}</span>
      )}
    </div>
  );
}

export function CSSSection({ tpl, setTpl, errors, at }: TemplateProps) {
  const size = new Blob([tpl.css]).size;
  const error = errors[`${at}.css`];
  return (
    <Card title={t("settings.page.css")} sub={t("settings.page.cssSub")}>
      <Field label={t("settings.page.cssField")} htmlFor="sp-css" hint={t("settings.page.cssHint", { size: size.toLocaleString(), max: MAX_CSS.toLocaleString() })} error={error ?? (size > MAX_CSS ? t("errors.api.too_long", { value: MAX_CSS }) : undefined)}>
        <textarea
          id="sp-css"
          className="input mono"
          rows={16}
          value={tpl.css}
          spellCheck={false}
          placeholder={".sub-look .glass {\n  border-width: 2px;\n}"}
          onChange={(e) => setTpl((x) => ({ ...x, css: e.target.value }))}
          aria-invalid={!!error || size > MAX_CSS}
        />
      </Field>
      <p className="text-xs text-[var(--ink-500)]">{t("settings.page.cssNote")}</p>
    </Card>
  );
}
