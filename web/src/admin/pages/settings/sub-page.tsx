// Settings → Subscription page: how the page and the Mini App look, what they show and in
// what order, with the page itself next to the form. One draft for the page's settings,
// saved together; images and instructions are saved as they are made.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useBlocker } from "@tanstack/react-router";
import { RotateCcw } from "lucide-react";
import { useState } from "react";
import { api, ApiError, errorText, unwrap, type Schemas } from "../../../api/client";
import { qk } from "../../../api/hooks";
import { SaveBar, WithPreview } from "../../../components/layout";
import { Confirm } from "../../../components/overlay";
import { QueryBoundary } from "../../../components/query";
import { useToast } from "../../../components/toast";
import { Button, Skeleton } from "../../../components/ui";
import { t } from "../../../i18n";
import { useDraft } from "../../../lib/draft";
import { fieldErrors } from "../../../lib/fields";
import type { Platform } from "../../../sub/apps";
import type { SETTINGS_PARTS } from "../../search";
import { DocsSection } from "./sub-docs";
import { AppsSection } from "./sub-page/apps";
import { BannersSection } from "./sub-page/banners";
import { BlocksSection } from "./sub-page/blocks";
import { BrandSection } from "./sub-page/brand";
import { CSSSection, LookSection } from "./sub-page/look";
import { COLOR, type Form, type Set, type SetTemplate, type View } from "./sub-page/parts";
import { Preview } from "./sub-page/preview";
import { TemplatesSection } from "./sub-page/templates";
import { TextsSection } from "./sub-page/texts";

/** The editor's parts, listed under "Subscription page" in the settings' section list. */
export type SubPagePart = (typeof SETTINGS_PARTS.page)[number];

type Section = SubPagePart;

function useSubPage() {
  return useQuery({ queryKey: qk.subPage, queryFn: ({ signal }) => unwrap(api.GET("/api/v1/sub-page", { signal })) });
}

/** The editor of the subscription page; the open part is kept by the settings page (in the URL). */
export function SubPageSettings({ section, onSection }: { section: SubPagePart; onSection: (s: SubPagePart) => void }) {
  const page = useSubPage();
  return (
    <QueryBoundary query={page} pending={<Skeleton style={{ height: 520, borderRadius: 20 }} />} wrap={(state) => <section className="card glass">{state}</section>}>
      {(v) => <Editor v={v} section={section} setSection={onSection} />}
    </QueryBoundary>
  );
}

function Editor({ v, section, setSection }: { v: View; section: Section; setSection: (s: Section) => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { draft, setDraft, dirty, reset } = useDraft<Form>({ config: v.config, brand_accent: v.brand_accent });
  // The platform the apps section edits: the preview opens the same tab.
  const [appsTab, setAppsTab] = useState<Platform>("ios");
  const [live, setLive] = useState("");
  const [resetting, setResetting] = useState(false);
  // The template the sections edit: the one subscribers get, until another is picked.
  const [tid, setTid] = useState(v.config.active);
  const set: Set = (f) => setDraft((d) => ({ ...d, config: f(d.config) }));
  const index = Math.max(0, draft.config.templates.findIndex((x) => x.id === tid));
  const tpl = draft.config.templates[index]!;
  const at = `config.templates[${index}]`;
  const setTpl: SetTemplate = (f) => set((c) => ({ ...c, templates: c.templates.map((x) => (x.id === tpl.id ? f(x) : x)) }));
  const save = useMutation({
    mutationFn: (f: Form) => {
      const body: Schemas["PutSubPageInputBody"] = { config: f.config };
      if (f.brand_accent !== v.brand_accent) body.brand_accent = f.brand_accent.trim().toUpperCase();
      return unwrap(api.PUT("/api/v1/sub-page", { body }));
    },
    onSuccess: (data) => {
      qc.setQueryData(qk.subPage, data);
      // The draft as the server keeps it (the colour in capitals): else the bar and the
      // question on leaving stayed after the save.
      setDraft({ config: data.config, brand_accent: data.brand_accent });
      void qc.invalidateQueries({ queryKey: qk.settings });
      toast.ok(t("settings.page.saved"));
    },
    onError: (e) => {
      toast.error(errorText(e));
      // The first field the server refused: its section opens.
      const field = e instanceof ApiError ? Object.keys(e.fields)[0] : undefined;
      if (field) {
        // The template with the field opens with it.
        const i = /^config.templates[(d+)]/.exec(field)?.[1];
        const x = i !== undefined ? draft.config.templates[Number(i)] : undefined;
        if (x) setTid(x.id);
        setSection(sectionOf(field));
      }
    },
  });
  const errors = fieldErrors(save.error);
  const tplProps = { tpl, setTpl, errors, at };
  // The brand's colour is needed once a template takes it: the active one or the one edited.
  const accentMissing = draft.config.templates.some((x) => x.look.brand_accent && (x.id === draft.config.active || x.id === tpl.id)) && !COLOR.test(draft.brand_accent.trim());
  const submit = () => {
    if (accentMissing) {
      const x = draft.config.templates.find((y) => y.look.brand_accent && (y.id === draft.config.active || y.id === tpl.id));
      if (x) setTid(x.id);
      setSection("look");
      toast.error(t("errors.api.color_required"));
      return;
    }
    save.mutate(draft);
  };
  // Leaving the page or this section drops the draft: ask first.
  const leave = useBlocker({
    shouldBlockFn: ({ current, next }) => dirty && (current.pathname !== next.pathname || (next.search as { tab?: string }).tab !== "page"),
    enableBeforeUnload: () => dirty,
    withResolver: true,
  });

  return (
    <>
      <WithPreview title={t("settings.page.preview")} preview={(bare) => <Preview v={v} draft={draft} tpl={tpl} platform={section === "apps" ? appsTab : undefined} bare={bare} />}>
            {section === "templates" ? (
              <TemplatesSection config={draft.config} set={set} tid={tpl.id} setTid={setTid} errors={errors} announce={setLive} />
            ) : section === "look" ? (
              <LookSection {...tplProps} v={v} draft={draft} setDraft={setDraft} accentMissing={accentMissing} />
            ) : section === "texts" ? (
              <TextsSection {...tplProps} />
            ) : section === "banners" ? (
              <BannersSection {...tplProps} v={v} announce={setLive} />
            ) : section === "brand" ? (
              <BrandSection draft={draft} setDraft={setDraft} set={set} errors={errors} logo={v.logo} brandName={v.brand} />
            ) : section === "blocks" ? (
              <BlocksSection {...tplProps} announce={setLive} />
            ) : section === "apps" ? (
              <AppsSection config={draft.config} set={set} announce={setLive} platform={appsTab} setPlatform={setAppsTab} />
            ) : section === "docs" ? (
              <DocsSection announce={setLive} />
            ) : (
              <CSSSection {...tplProps} />
            )}
          <div className="flex flex-wrap items-center gap-2 px-1">
            <Button variant="ghost" size="sm" onClick={() => setResetting(true)}>
              <RotateCcw size={16} aria-hidden /> {t("settings.page.reset")}
            </Button>
            <span className="text-xs text-[var(--ink-500)]">{t("settings.page.resetHint")}</span>
          </div>
      </WithPreview>
      <p className="sr-only" role="status" aria-live="polite">
        {live}
      </p>
      <SaveBar dirty={dirty} saving={save.isPending} onSave={submit} onReset={reset} />
      <Confirm
        open={resetting}
        onOpenChange={setResetting}
        title={t("settings.page.resetTitle")}
        text={t("settings.page.resetText")}
        confirm={t("settings.page.resetConfirm")}
        danger
        onConfirm={() => {
          setDraft((d) => ({ ...d, config: structuredClone(v.defaults) }));
          setTid(v.defaults.active);
          setResetting(false);
        }}
      />
      <Confirm
        open={leave.status === "blocked"}
        onOpenChange={(open) => !open && leave.reset?.()}
        title={t("settings.page.leaveTitle")}
        text={t("settings.page.leaveText")}
        confirm={t("settings.page.leaveConfirm")}
        danger
        onConfirm={() => leave.proceed?.()}
      />
    </>
  );
}

/** The section of the editor a field the API refused is in. */
function sectionOf(field: string): Section {
  const part = /^config.templates[d+].(w+)/.exec(field)?.[1];
  if (part === "look") return "look";
  if (part === "blocks") return "blocks";
  if (part === "texts") return "texts";
  if (part === "banners") return "banners";
  if (part === "css") return "css";
  if (part || field.startsWith("config.templates") || field.startsWith("config.active")) return "templates";
  if (field.startsWith("config.apps")) return "apps";
  if (field === "brand_accent") return "look";
  return "brand";
}
