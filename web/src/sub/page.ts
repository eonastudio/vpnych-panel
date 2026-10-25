// What the admin made of the subscription page (internal/panel/subpage): the server puts the
// template it shows into the page's HTML as a JSON block, so the page knows its look before
// anything loads; the admin's preview builds the same shape from the editor's draft.
import type { CSSProperties } from "react";
import type { components } from "../api/schema";
import { overrideTexts } from "../i18n";
import type { Platform } from "./apps";

export type PageConfig = components["schemas"]["Page"];
export type PageBlock = components["schemas"]["PageBlock"];
export type PageBrand = components["schemas"]["PageBrand"];
export type PageApps = components["schemas"]["PageApps"];
export type PageOG = components["schemas"]["PageOG"];
export type Template = components["schemas"]["Template"];
export type TemplateLook = components["schemas"]["TemplateLook"];
export type PageBanner = components["schemas"]["PageBanner"];
export type PageText = components["schemas"]["PageText"];
export type BlockType = PageBlock["type"];
export type BuiltinId = Template["base"];
export type DocItem = { id: number; title: string; emoji?: string; platform?: string };
export type DocView = DocItem & { body: string };

/** The page's data block (subpage.Public). */
export type PagePublic = {
  /** The template shown: its blocks that are on, its banners in their time, images as links. */
  template: Template;
  head: PageBrand;
  apps: PageApps;
  og: PageOG;
  brand: string;
  /** The brand's colour when the template takes it; none keeps the template's. */
  accent?: string;
  /** Image links relative to the subscription path. */
  logo?: string;
  background?: string;
  docs: DocItem[];
};

/** Blocks shown only in the Telegram Mini App: buying needs Telegram's sign-in. */
export const MINI_APP_ONLY: readonly BlockType[] = ["promo", "shop", "reissue"];
export const CUSTOM_TYPES: readonly BlockType[] = ["text", "links"];
export const PLATFORMS: readonly Platform[] = ["ios", "android", "windows", "macos", "linux"];
export const BUILTINS: readonly BuiltinId[] = ["vpnych", "classic", "light", "minimal", "neon"];
/** How many templates of their own an admin may have (subpage.MaxOwn). */
export const MAX_OWN = 8;

const emptyApps = { order: [], hidden: [] };

const BLOCKS: [BlockType, boolean][] = [
  ["announce", false],
  ["status", true],
  ["promo", true],
  ["shop", true],
  ["traffic", true],
  ["devices", true],
  ["apps", true],
  ["guide", true],
  ["instructions", true],
  ["link", true],
  ["reissue", true],
  ["locations", false],
  ["telegram", true],
  ["support", true],
];

type LookColors = Omit<TemplateLook, "background" | "brand_accent">;
const LOOKS: Record<BuiltinId, LookColors> = {
  vpnych: { scheme: "dark", bg: "#0B141B", bg2: "#0F1B24", card: "#1A2832", card_alpha: 72, text: "#FFFFFF", muted: "#8A99A8", accent: "#1F9E8E", accent2: "#2BB3A1", danger: "#EE4D6A", font: "inter", radius: 32, glass: true, headings: "italic", glow: true },
  classic: { scheme: "light", bg: "#EAF4F2", bg2: "#F4FAF8", card: "#FFFFFF", card_alpha: 80, text: "#161A24", muted: "#5C6474", accent: "#1F9E8E", accent2: "#17877A", danger: "#BB382F", font: "unbounded", radius: 24, glass: true, headings: "regular", glow: true },
  light: { scheme: "light", bg: "#F5F6F8", bg2: "#FFFFFF", card: "#FFFFFF", card_alpha: 100, text: "#111827", muted: "#6B7280", accent: "#2563EB", accent2: "#1D4ED8", danger: "#DC2626", font: "system", radius: 20, glass: false, headings: "regular", glow: false },
  minimal: { scheme: "light", bg: "#FFFFFF", bg2: "#FFFFFF", card: "#F4F4F5", card_alpha: 100, text: "#09090B", muted: "#71717A", accent: "#18181B", accent2: "#3F3F46", danger: "#DC2626", font: "system", radius: 12, glass: false, headings: "regular", glow: false },
  neon: { scheme: "dark", bg: "#0A0612", bg2: "#160B2E", card: "#1C1030", card_alpha: 70, text: "#F5F3FF", muted: "#A59CC4", accent: "#D946EF", accent2: "#22D3EE", danger: "#FB7185", font: "unbounded", radius: 28, glass: true, headings: "italic", glow: true },
};

/**
 * A built-in template as it comes (subpage.BuiltinTemplate): the editor's «Reset» and the
 * page served without its data (the Vite dev server). Keep the two in step.
 */
export function builtinTemplate(id: BuiltinId): Template {
  const off = id === "minimal" ? ["devices", "guide", "instructions", "telegram"] : [];
  return {
    id,
    base: id,
    name: "",
    look: { ...LOOKS[id], brand_accent: false, background: { kind: "theme", from: "", to: "", angle: 160, dim: 30, image: "" } },
    blocks: BLOCKS.map(([type, on]) => ({ id: type, type, on: on && !off.includes(type), title: "" })),
    texts: [],
    banners: [],
    css: "",
  };
}

/** The page with nothing configured (subpage.Default). */
export function defaultPage(): PageConfig {
  return {
    active: "vpnych",
    brand: { logo: "letter", emoji: "", subtitle: "" },
    apps: { platform: "auto", ios: emptyApps, android: emptyApps, windows: emptyApps, macos: emptyApps, linux: emptyApps, qr: true },
    og: { title: "", description: "", image: false },
    templates: BUILTINS.map(builtinTemplate),
  };
}

/** The page's data from its HTML; ВПНыч's template when it has none. */
export function readPage(): PagePublic {
  try {
    const raw = document.getElementById("mikan-page")?.textContent;
    if (raw) {
      const p = JSON.parse(raw) as PagePublic;
      if (p?.template?.blocks && p.template.look) return { ...p, docs: p.docs ?? [], template: { ...p.template, texts: p.template.texts ?? [], banners: p.template.banners ?? [] } };
    }
  } catch {
    // a page without its data shows as it always did
  }
  const def = defaultPage();
  return { template: builtinTemplate("vpnych"), head: def.brand, apps: def.apps, og: def.og, brand: "", docs: [] };
}

const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255) as [number, number, number];
const isHex = (c: string) => /^#[0-9a-f]{6}$/i.test(c);

/** Text on a colour: dark on a light one, white on the rest (WCAG relative luminance). */
export function onColor(color: string): string {
  if (!isHex(color)) return "#ffffff";
  const [r, g, b] = hex(color).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)) as [number, number, number];
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // Contrast with white (1.05/(l+0.05)) against contrast with ink (#161a24, l≈0.011).
  return 1.05 / (l + 0.05) >= (l + 0.05) / 0.061 ? "#ffffff" : "#161a24";
}

/** A colour with an opacity, as rgba(): the cards' see-through. */
function withAlpha(color: string, percent: number): string {
  if (!isHex(color)) return color;
  const [r, g, b] = hex(color).map((v) => Math.round(v * 255));
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(100, percent)) / 100})`;
}

/** The brand's colour a shade darker: the second colour of the buttons' gradient. */
function darker(color: string): string {
  if (!isHex(color)) return color;
  return "#" + hex(color).map((v) => Math.round(v * 255 * 0.82).toString(16).padStart(2, "0")).join("");
}

const VARS = ["--t-bg", "--t-bg2", "--t-card", "--t-card-solid", "--t-text", "--t-muted", "--t-accent", "--t-accent2", "--t-on-accent", "--t-danger", "--t-radius"] as const;
const DATA = ["scheme", "font", "glass", "headings", "glow", "tpl"] as const;

/** The CSS variables and data attributes a template's look puts on an element (look.css, app/app.css). */
export function lookVars(look: TemplateLook, base: string, accent?: string): { data: Record<(typeof DATA)[number], string>; style: Record<(typeof VARS)[number], string> } {
  const a = accent && isHex(accent) ? accent : look.accent;
  const a2 = accent && isHex(accent) ? darker(accent) : look.accent2;
  return {
    data: { scheme: look.scheme, font: look.font, glass: look.glass ? "on" : "off", headings: look.headings, glow: look.glow ? "on" : "off", tpl: base },
    style: {
      "--t-bg": look.bg,
      "--t-bg2": look.bg2,
      "--t-card": withAlpha(look.card, look.card_alpha),
      "--t-card-solid": look.card,
      "--t-text": look.text,
      "--t-muted": look.muted,
      "--t-accent": a,
      "--t-accent2": a2,
      "--t-on-accent": onColor(a),
      "--t-danger": look.danger,
      "--t-radius": `${look.radius}px`,
    },
  };
}

/** Puts a template's look on el (the page's <html>, the preview's frame), replacing the one it had. */
export function paintLook(el: HTMLElement, look: TemplateLook, base: string, accent?: string) {
  const { data, style } = lookVars(look, base, accent);
  el.classList.add("sub-look");
  for (const k of DATA) el.dataset[k] = data[k];
  for (const k of VARS) el.style.setProperty(k, style[k]);
}

/** The backdrop's CSS: the template's own background over its colours. */
export function backdropStyle(look: TemplateLook, image?: string): CSSProperties {
  const b = look.background;
  switch (b.kind) {
    case "solid":
      return { background: b.from || look.bg };
    case "gradient":
      return { background: `linear-gradient(${b.angle}deg, ${b.from || look.bg2}, ${b.to || look.bg})` };
    case "image":
      if (image) return { backgroundColor: look.bg, backgroundImage: `url("${encodeURI(image)}")`, backgroundSize: "cover", backgroundPosition: "center" };
      break;
  }
  return { background: `linear-gradient(180deg, ${look.bg2} 0%, ${look.bg} 100%)` };
}

/** The colour of the browser's bar and Telegram's header: the top of the backdrop. */
export function barColor(look: TemplateLook): string {
  const b = look.background;
  if ((b.kind === "solid" || b.kind === "gradient") && b.from) return b.from;
  return look.bg2;
}

/** A platform's apps of the catalogue as the admin ordered them, hidden ones left out. */
export function orderApps<T extends { name: string }>(apps: T[], list: { order: string[]; hidden: string[] } | undefined): T[] {
  if (!list) return apps;
  const pos = (name: string) => {
    const i = list.order.indexOf(name);
    return i < 0 ? list.order.length + apps.findIndex((a) => a.name === name) : i;
  };
  return apps.filter((a) => !list.hidden.includes(a.name)).sort((a, b) => pos(a.name) - pos(b.name));
}

/** The title a block shows: the admin's own, or its usual one. */
export function blockTitle(block: PageBlock, usual: string): string {
  return block.title.trim() || usual;
}

/** A block's own heading, "" when it has none (or the template has no such block). */
export function titleOf(template: Template, type: BlockType): string {
  return template.blocks.find((b) => b.type === type)?.title.trim() ?? "";
}

/** The template's banners for a place on the page: where it is drawn, and for which block. */
export function bannersAt(template: Template, where: "miniapp" | "browser", place: PageBanner["place"], after?: string): PageBanner[] {
  const now = Date.now() / 1000;
  return template.banners.filter(
    (b) => b.on && (b.where === "all" || b.where === where) && b.place === place && (place !== "after" || b.after === after) && (!b.from || b.from <= now) && (!b.until || now < b.until),
  );
}

/** The template's own texts instead of the dictionary's (i18n), for every text it reads. */
export function applyTexts(template: Template) {
  overrideTexts(template.texts);
}

/**
 * The admin's CSS as the server keeps it (subpage.CleanCSS): no "<", no @import, no
 * at-rule spelled with an escape. The preview applies the draft the same way.
 */
export function cleanCSS(css: string): string {
  // As the server's subpage.CleanCSS: no escapes, no @import, no url() of another site.
  let out = css.replaceAll("<", "").replaceAll("\0", "").replaceAll("\\", "");
  for (;;) {
    const next = out.replace(/@import/gi, "").replace(/(url|image-set|image)\(\s*['"]?\s*(https?:|\/\/)[^)]*\)/gi, "none");
    if (next === out) break;
    out = next;
  }
  return out.trim();
}

/** An emoji as an icon: an SVG of one letter, a data: link the page's CSP allows. */
function emojiIcon(emoji: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><text x="32" y="54" font-size="52" text-anchor="middle">${emoji.replace(/[<>&"']/g, "")}</text></svg>`;
  return "data:image/svg+xml," + encodeURIComponent(svg);
}

/**
 * Puts the template on the page's <html> (before the first paint: no flash of another
 * look), its texts into the dictionary, its icon on the tab and its colour on the
 * browser's bar.
 */
export function applyLook(page: PagePublic, asset: (path?: string) => string | undefined) {
  const root = document.documentElement;
  const look = page.template.look;
  paintLook(root, look, page.template.base, page.accent);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", barColor(look));
  applyTexts(page.template);

  const brand = page.head;
  const icon = brand.logo === "image" ? asset(page.logo) : brand.logo === "emoji" && brand.emoji ? emojiIcon(brand.emoji) : undefined;
  if (icon) {
    for (const link of document.querySelectorAll<HTMLLinkElement>('link[rel="icon"], link[rel="apple-touch-icon"]')) {
      if (link.rel === "apple-touch-icon" && brand.logo !== "image") continue;
      link.removeAttribute("type");
      link.href = icon;
    }
  }
}
