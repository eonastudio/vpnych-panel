// What the sections of the subscription page's editor share: the page's types, its limits
// and the card each section is.
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { basePath, type Schemas } from "../../../../api/client";
import { Card as LayoutCard } from "../../../../components/layout";

export type View = Schemas["SubPageView"];

export type Config = Schemas["Page"];

export type Block = Schemas["PageBlock"];

export type Template = Schemas["Template"];

export type Look = Schemas["TemplateLook"];

export type Banner = Schemas["PageBanner"];

export type Asset = Schemas["PageAsset"];

export type Form = { config: Config; brand_accent: string };

export type Set = (f: (c: Config) => Config) => void;

/** Changes the template being edited. */
export type SetTemplate = (f: (t: Template) => Template) => void;

/** What a section of one template gets: the template, its setter, the errors and their prefix. */
export type TemplateProps = { tpl: Template; setTpl: SetTemplate; errors: Record<string, string>; at: string };

export const COLOR = /^#[0-9A-Fa-f]{6}$/;

export const LIMITS = { logo: 512, background: 2048, banner: 1024 } as const;

export const MAX_CUSTOM = 12;

export const MAX_CSS = 20480;

export const MAX_BANNERS = 10;

export const MAX_TEXTS = 400;

export const imageURL = (a?: Asset) => (a ? `${basePath}/api/v1/sub-page/images/${a.name}?v=${a.hash}` : undefined);

/** An uploaded image of the page by its name: the logo, the old background or a template's. */
export function assetOf(v: View, name?: string): Asset | undefined {
  if (!name) return undefined;
  if (name === "logo") return v.logo;
  if (name === "background") return v.background ?? v.images?.[name];
  return v.images?.[name];
}

/** The name an image of a template is uploaded under: bg-<template>, banner-<template>-<banner>. */
export const imageName = (kind: "bg" | "banner", tpl: string, banner?: string) => (kind === "bg" ? `bg-${tpl}` : `banner-${tpl}-${banner}`);

export type SectionProps = { draft: Form; setDraft: Dispatch<SetStateAction<Form>>; set: Set; errors: Record<string, string> };

// The editor's cards come and go with its sections: no entrance.
export function Card({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <LayoutCard title={title} sub={sub} reveal={false}>
      {children}
    </LayoutCard>
  );
}
