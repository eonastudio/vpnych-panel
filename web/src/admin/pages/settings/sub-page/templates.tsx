// The page's templates: the built-in ones and the admin's own, which one subscribers get,
// which one the editor's other sections change. The rest are drafts, seen in the preview.
import { Check, Copy, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { Confirm } from "../../../../components/overlay";
import { Button, Field } from "../../../../components/ui";
import { t } from "../../../../i18n";
import { BUILTINS, builtinTemplate, MAX_OWN, type BuiltinId } from "../../../../sub/page";
import { Card, type Config, type Set, type Template } from "./parts";

const newId = () => `own-${Math.random().toString(36).slice(2, 10) || "a"}`;

const isBuiltin = (id: string) => (BUILTINS as readonly string[]).includes(id);

/** A template's name: the admin's own, or its built-in one. */
export function templateName(tpl: Template): string {
  return tpl.name.trim() || (isBuiltin(tpl.id) ? t(`settings.page.tpl.builtin.${tpl.id as BuiltinId}`) : t("settings.page.tpl.untitled"));
}

function Swatch({ tpl }: { tpl: Template }) {
  const l = tpl.look;
  return (
    <span className="relative grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-[12px] border border-[var(--hairline)]" style={{ background: `linear-gradient(160deg, ${l.bg2}, ${l.bg})` }} aria-hidden>
      <span className="h-5 w-7 rounded-[6px]" style={{ background: l.card, boxShadow: `inset 0 -6px 0 ${l.accent}` }} />
    </span>
  );
}

type Props = {
  config: Config;
  set: Set;
  /** The template the other sections edit. */
  tid: string;
  setTid: (id: string) => void;
  errors: Record<string, string>;
  announce: (text: string) => void;
};

export function TemplatesSection({ config, set, tid, setTid, errors, announce }: Props) {
  const [removing, setRemoving] = useState<Template | null>(null);
  const [resetting, setResetting] = useState<Template | null>(null);
  const [base, setBase] = useState<BuiltinId>("vpnych");
  const own = config.templates.filter((x) => !isBuiltin(x.id)).length;
  const full = own >= MAX_OWN;
  const editing = config.templates.find((x) => x.id === tid) ?? config.templates[0]!;
  const at = `config.templates[${config.templates.indexOf(editing)}]`;

  const add = (from: Template, name: string) => {
    const copy: Template = { ...structuredClone(from), id: newId(), name: name.slice(0, 40) };
    set((c) => ({ ...c, templates: [...c.templates, copy] }));
    setTid(copy.id);
    announce(t("settings.page.tpl.added", { name: templateName(copy) }));
  };
  const rename = (name: string) => set((c) => ({ ...c, templates: c.templates.map((x) => (x.id === editing.id ? { ...x, name } : x)) }));

  return (
    <>
      <Card title={t("settings.page.tpl.title")} sub={t("settings.page.tpl.sub")}>
        <ul className="flex flex-col gap-2">
          {config.templates.map((x) => {
            const name = templateName(x);
            const active = config.active === x.id;
            const current = editing.id === x.id;
            return (
              <li key={x.id} className={`panel-soft flex flex-wrap items-center gap-3 p-3 ${current ? "ring-2 ring-[var(--mikan-500)]" : ""}`}>
                <Swatch tpl={x} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-[13px] font-semibold">{name}</span>
                    {active ? <span className="tag shrink-0">{t("settings.page.tpl.active")}</span> : null}
                    {current ? <span className="tag shrink-0">{t("settings.page.tpl.editing")}</span> : null}
                  </div>
                  <div className="truncate text-xs text-[var(--ink-500)]">
                    {isBuiltin(x.id) ? t("settings.page.tpl.builtinNote") : t("settings.page.tpl.ownNote", { base: t(`settings.page.tpl.builtin.${x.base}`) })}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  {!current ? (
                    <button type="button" className="icon-btn" onClick={() => setTid(x.id)} aria-label={t("settings.page.tpl.edit", { name })} title={t("settings.page.tpl.edit", { name })}>
                      <Pencil size={16} />
                    </button>
                  ) : null}
                  {!active ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        set((c) => ({ ...c, active: x.id }));
                        announce(t("settings.page.tpl.activated", { name }));
                      }}
                    >
                      <Check size={14} aria-hidden /> {t("settings.page.tpl.activate")}
                    </Button>
                  ) : null}
                  <button type="button" className="icon-btn" disabled={full} onClick={() => add(x, t("settings.page.tpl.copyOf", { name }))} aria-label={t("settings.page.tpl.duplicate", { name })} title={t("settings.page.tpl.duplicate", { name })}>
                    <Copy size={16} />
                  </button>
                  <button type="button" className="icon-btn" onClick={() => setResetting(x)} aria-label={t("settings.page.tpl.reset", { name })} title={t("settings.page.tpl.reset", { name })}>
                    <RotateCcw size={16} />
                  </button>
                  {!isBuiltin(x.id) ? (
                    <button type="button" className="icon-btn" onClick={() => setRemoving(x)} aria-label={t("settings.page.tpl.remove", { name })} title={t("settings.page.tpl.remove", { name })}>
                      <Trash2 size={16} />
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select className="input max-w-[200px]" value={base} onChange={(e) => setBase(e.target.value as BuiltinId)} aria-label={t("settings.page.tpl.newBase")}>
            {BUILTINS.map((id) => (
              <option key={id} value={id}>
                {t(`settings.page.tpl.builtin.${id}`)}
              </option>
            ))}
          </select>
          <button type="button" className="chip-btn inline-flex items-center gap-1" disabled={full} onClick={() => add(builtinTemplate(base), t("settings.page.tpl.newName", { n: own + 1 }))}>
            <Plus size={14} aria-hidden /> {t("settings.page.tpl.new")}
          </button>
          <span className="text-xs text-[var(--ink-500)]">{full ? t("errors.api.too_many_templates", { value: MAX_OWN }) : t("settings.page.tpl.newHint", { n: MAX_OWN - own })}</span>
        </div>
      </Card>

      <Card title={t("settings.page.tpl.current", { name: templateName(editing) })} sub={t("settings.page.tpl.currentSub")}>
        <Field label={t("settings.page.tpl.name")} htmlFor="sp-tpl-name" hint={t("settings.page.tpl.nameHint")} error={errors[`${at}.name`]}>
          <input id="sp-tpl-name" className="input" value={editing.name} maxLength={40} placeholder={templateName({ ...editing, name: "" })} onChange={(e) => rename(e.target.value)} aria-invalid={!!errors[`${at}.name`]} />
        </Field>
        <p className="text-xs text-[var(--ink-500)]">{config.active === editing.id ? t("settings.page.tpl.isActive") : t("settings.page.tpl.isDraft")}</p>
      </Card>

      <Confirm
        open={!!removing}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={t("settings.page.tpl.removeTitle")}
        text={removing ? t("settings.page.tpl.removeText", { name: templateName(removing) }) : ""}
        confirm={t("settings.page.tpl.removeConfirm")}
        danger
        onConfirm={() => {
          const x = removing!;
          set((c) => ({ ...c, active: c.active === x.id ? "vpnych" : c.active, templates: c.templates.filter((y) => y.id !== x.id) }));
          if (tid === x.id) setTid(config.active === x.id ? "vpnych" : config.active);
          announce(t("settings.page.tpl.removed", { name: templateName(x) }));
          setRemoving(null);
        }}
      />
      <Confirm
        open={!!resetting}
        onOpenChange={(open) => !open && setResetting(null)}
        title={t("settings.page.tpl.resetTitle")}
        text={resetting ? t("settings.page.tpl.resetText", { name: templateName(resetting), base: t(`settings.page.tpl.builtin.${resetting.base}`) }) : ""}
        confirm={t("settings.page.tpl.resetConfirm")}
        danger
        onConfirm={() => {
          const x = resetting!;
          set((c) => ({ ...c, templates: c.templates.map((y) => (y.id === x.id ? { ...builtinTemplate(x.base), id: x.id, name: x.name } : y)) }));
          setResetting(null);
        }}
      />
    </>
  );
}
