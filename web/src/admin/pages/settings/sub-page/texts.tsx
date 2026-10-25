// A template's own texts: any text and button of the page and the Mini App, in Russian and
// English, in place of the usual one. An empty field keeps the usual text.
import { useQuery } from "@tanstack/react-query";
import { RotateCcw, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Segmented, Skeleton } from "../../../../components/ui";
import { t } from "../../../../i18n";
import { subDicts } from "../../../../i18n/sub";
import { Card, MAX_TEXTS, type TemplateProps } from "./parts";

type Leaf = { key: string; ru: string; en: string };

const PAGE = 40;

/** The page's texts (the sub.* keys) with their usual Russian and English. */
function useUsual() {
  return useQuery({
    queryKey: ["sub-page", "texts"],
    staleTime: Infinity,
    queryFn: async () => {
      const [ru, en] = await Promise.all([subDicts.ru(), subDicts.en()]);
      const out: Leaf[] = [];
      const walk = (node: unknown, path: string, other: unknown) => {
        if (typeof node === "string") {
          out.push({ key: path, ru: node, en: typeof other === "string" ? other : "" });
          return;
        }
        if (node && typeof node === "object")
          for (const [k, v] of Object.entries(node)) walk(v, `${path}.${k}`, other && typeof other === "object" ? (other as Record<string, unknown>)[k] : undefined);
      };
      walk((ru.default as Record<string, unknown>).sub, "sub", (en.default as Record<string, unknown>).sub);
      return out;
    },
  });
}

export function TextsSection({ tpl, setTpl, errors, at }: TemplateProps) {
  const usual = useUsual();
  const [query, setQuery] = useState("");
  const [only, setOnly] = useState<"all" | "own">("all");
  const [shown, setShown] = useState(PAGE);
  const own = useMemo(() => new Map(tpl.texts.map((x, i) => [x.key, { ...x, i }])), [tpl.texts]);
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (usual.data ?? []).filter((l) => {
      if (only === "own" && !own.has(l.key)) return false;
      if (!q) return true;
      const mine = own.get(l.key);
      return [l.key, l.ru, l.en, mine?.ru ?? "", mine?.en ?? ""].some((s) => s.toLowerCase().includes(q));
    });
  }, [usual.data, query, only, own]);

  const setText = (key: string, lang: "ru" | "en", value: string) =>
    setTpl((x) => {
      const found = x.texts.find((y) => y.key === key);
      const next = { ...(found ?? { key, ru: "", en: "" }), [lang]: value };
      // Only the texts of its own stay in the template: both fields empty drop it.
      const rest = x.texts.filter((y) => y.key !== key);
      return { ...x, texts: next.ru.trim() || next.en.trim() ? (found ? x.texts.map((y) => (y.key === key ? next : y)) : [...rest, next]) : rest };
    });
  const full = tpl.texts.length >= MAX_TEXTS;

  return (
    <Card title={t("settings.page.tpl.texts")} sub={t("settings.page.tpl.textsSub")}>
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[200px] flex-1">
          <Search size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--ink-400)]" aria-hidden />
          <input
            className="input pl-8"
            type="search"
            value={query}
            placeholder={t("settings.page.tpl.textsSearch")}
            aria-label={t("settings.page.tpl.textsSearch")}
            onChange={(e) => {
              setQuery(e.target.value);
              setShown(PAGE);
            }}
          />
        </label>
        <Segmented
          label={t("settings.page.tpl.textsShow")}
          value={only}
          onChange={(v) => {
            setOnly(v);
            setShown(PAGE);
          }}
          options={[
            { value: "all", label: t("settings.page.tpl.textsAll") },
            { value: "own", label: t("settings.page.tpl.textsOwn", { n: tpl.texts.length }) },
          ]}
        />
      </div>
      {full ? <p className="text-xs text-[var(--berry-600)]">{t("settings.page.tpl.textsFull", { n: MAX_TEXTS })}</p> : null}
      {usual.isPending ? (
        <Skeleton style={{ height: 240, borderRadius: 16 }} />
      ) : list.length === 0 ? (
        <p className="py-6 text-center text-sm text-[var(--ink-500)]">{t("settings.page.tpl.textsNone")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.slice(0, shown).map((l) => {
            const mine = own.get(l.key);
            const err = mine ? (errors[`${at}.texts[${mine.i}].ru`] ?? errors[`${at}.texts[${mine.i}].en`] ?? errors[`${at}.texts[${mine.i}].key`]) : undefined;
            const long = l.ru.length > 60 || l.en.length > 60;
            return (
              <li key={l.key} className="panel-soft p-3">
                <div className="mb-2 flex items-center gap-2">
                  <code className="mono min-w-0 flex-1 truncate text-xs text-[var(--ink-500)]">{l.key.slice(4)}</code>
                  {mine ? (
                    <button type="button" className="icon-btn" onClick={() => setTpl((x) => ({ ...x, texts: x.texts.filter((y) => y.key !== l.key) }))} aria-label={t("settings.page.tpl.textReset", { key: l.key })} title={t("settings.page.tpl.textReset", { key: l.key })}>
                      <RotateCcw size={14} />
                    </button>
                  ) : null}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(["ru", "en"] as const).map((lang) => {
                    const props = {
                      className: "input",
                      value: mine?.[lang] ?? "",
                      placeholder: l[lang],
                      maxLength: 2000,
                      disabled: full && !mine,
                      "aria-label": `${l.key} (${lang.toUpperCase()})`,
                      "aria-invalid": !!err,
                    };
                    return (
                      <label key={lang} className="flex items-start gap-2">
                        <span className="mt-3 w-6 shrink-0 text-[11px] font-semibold text-[var(--ink-400)]">{lang.toUpperCase()}</span>
                        {long ? <textarea {...props} rows={3} onChange={(e) => setText(l.key, lang, e.target.value)} /> : <input {...props} onChange={(e) => setText(l.key, lang, e.target.value)} />}
                      </label>
                    );
                  })}
                </div>
                {err ? (
                  <span className="mt-1 block text-xs text-[var(--berry-600)]" role="alert">
                    {err}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {list.length > shown ? (
        <div>
          <button type="button" className="chip-btn" onClick={() => setShown((n) => n + PAGE)}>
            {t("settings.page.tpl.textsMore", { n: list.length - shown })}
          </button>
        </div>
      ) : null}
      <p className="text-xs text-[var(--ink-500)]">{t("settings.page.tpl.textsNote")}</p>
    </Card>
  );
}
