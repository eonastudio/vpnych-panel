package subpage

import (
	"regexp"
	"slices"
	"strconv"
	"strings"
	"unicode/utf8"

	"mikan/internal/textutil"
)

// Template is a look of the Mini App and the browser page with everything on it: colours,
// font and background, the blocks and their order, the texts and buttons in both languages
// and the banners. The page has the built-in ones (Builtins), each the admin's to change and
// to reset, and up to MaxOwn of the admin's own; one of them is shown (Page.Active), the
// others are drafts the editor previews.
type Template struct {
	ID      string       `json:"id" maxLength:"16" doc:"Встроенные: vpnych, classic, light, minimal, neon; свои: own-<x>"`
	Name    string       `json:"name" maxLength:"40" doc:"Название в редакторе; пусто — название встроенного"`
	Base    string       `json:"base" enum:"vpnych,classic,light,minimal,neon" doc:"Встроенный шаблон, к которому ведёт «Сбросить»"`
	Look    TemplateLook `json:"look"`
	Blocks  []PageBlock  `json:"blocks" maxItems:"40" doc:"Блоки в их порядке; встроенные — по одному, своих (text, links) — до 12"`
	Texts   []PageText   `json:"texts" maxItems:"400" doc:"Свои тексты и надписи кнопок вместо обычных, по ключам словаря sub.*"`
	Banners []PageBanner `json:"banners" maxItems:"10"`
	CSS     string       `json:"css" maxLength:"20480" doc:"Свой CSS шаблона, до 20 КБ; @import и < убираются"`
}

// TemplateLook is a template's colours, type and shapes.
type TemplateLook struct {
	Scheme      string             `json:"scheme" enum:"light,dark" doc:"Светлая или тёмная схема: от неё цвета системных элементов"`
	Bg          string             `json:"bg" maxLength:"7" doc:"Фон, #RRGGBB"`
	Bg2         string             `json:"bg2" maxLength:"7" doc:"Второй цвет фона (верх градиента и шапка Telegram)"`
	Card        string             `json:"card" maxLength:"7" doc:"Карточки"`
	CardAlpha   int                `json:"card_alpha" minimum:"0" maximum:"100" doc:"Непрозрачность карточек, %"`
	Text        string             `json:"text" maxLength:"7"`
	Muted       string             `json:"muted" maxLength:"7" doc:"Второстепенный текст"`
	Accent      string             `json:"accent" maxLength:"7" doc:"Кнопки и акценты"`
	Accent2     string             `json:"accent2" maxLength:"7" doc:"Второй цвет акцента (градиент кнопок)"`
	Danger      string             `json:"danger" maxLength:"7" doc:"Ошибки и предупреждения"`
	BrandAccent bool               `json:"brand_accent" doc:"Акцент — цвет бренда (brand_accent) вместо accent"`
	Font        string             `json:"font" enum:"inter,onest,unbounded,system,rounded,mono" doc:"unbounded — заголовки Unbounded, текст Onest"`
	Radius      int                `json:"radius" minimum:"0" maximum:"40" doc:"Скругление карточек, px"`
	Glass       bool               `json:"glass" doc:"Стеклянные карточки (размытие под ними)"`
	Headings    string             `json:"headings" enum:"italic,regular" doc:"italic — курсивом заглавными, как ВПНыч"`
	Glow        bool               `json:"glow" doc:"Свечение акцента на фоне"`
	Background  TemplateBackground `json:"background"`
}

// TemplateBackground is what is behind the cards.
type TemplateBackground struct {
	Kind  string `json:"kind" enum:"theme,solid,gradient,image" doc:"theme — от bg2 к bg, solid — цвет from, gradient — от from к to, image — картинка image"`
	From  string `json:"from" maxLength:"7"`
	To    string `json:"to" maxLength:"7"`
	Angle int    `json:"angle" minimum:"0" maximum:"359"`
	Dim   int    `json:"dim" minimum:"0" maximum:"80" doc:"Затемнение картинки, %"`
	Image string `json:"image" maxLength:"40" doc:"Загруженная картинка: background или bg-<x>"`
}

// PageText puts the admin's words in place of a text of the page, by its dictionary key
// (web/src/i18n, the sub.* keys); a language left empty keeps the usual words.
type PageText struct {
	Key string `json:"key" maxLength:"84" doc:"Ключ словаря, sub.…"`
	RU  string `json:"ru" maxLength:"500"`
	EN  string `json:"en" maxLength:"500"`
}

// PageBanner is a notice the template shows over its blocks, for a time if it has one.
type PageBanner struct {
	ID     string       `json:"id" maxLength:"12"`
	On     bool         `json:"on"`
	Title  string       `json:"title" maxLength:"80"`
	Text   string       `json:"text" maxLength:"300"`
	Image  string       `json:"image" maxLength:"48" doc:"Загруженная картинка banner-<x>; пусто — без неё"`
	Button BannerButton `json:"button"`
	Place  string       `json:"place" enum:"top,bottom,after" doc:"top — над блоками, bottom — под ними, after — после блока after"`
	After  string       `json:"after" maxLength:"24"`
	From   int64        `json:"from" minimum:"0" doc:"Показывать с (unix-время); 0 — сразу"`
	Until  int64        `json:"until" minimum:"0" doc:"Показывать до (unix-время); 0 — всегда"`
	Tone   string       `json:"tone" enum:"accent,card,warning"`
	Where  string       `json:"where" enum:"all,miniapp,browser" doc:"Где показывать: везде, только в Mini App, только в браузере"`
}

// BannerButton is a banner's button; no label, no button.
type BannerButton struct {
	Label string `json:"label" maxLength:"40"`
	URL   string `json:"url" maxLength:"500" doc:"https://, http:// или tg://"`
}

// Limits of a page's templates.
const (
	MaxOwn     = 8
	MaxTexts   = 400
	MaxBanners = 10
	// TemplateDefault is the template shown when none is chosen.
	TemplateDefault = "vpnych"
)

var (
	ownRe       = regexp.MustCompile(`^own-[a-z0-9]{1,12}$`)
	textKeyRe   = regexp.MustCompile(`^sub\.[A-Za-z0-9_]+(\.[A-Za-z0-9_]+)*$`)
	bannerIDRe  = regexp.MustCompile(`^[a-z0-9]{1,12}$`)
	bgImageRe   = regexp.MustCompile(`^(background|bg-[a-z0-9-]{1,24})$`)
	bannerImgRe = regexp.MustCompile(`^banner-[a-z0-9-]{1,40}$`)
)

// Builtins are the templates every page has, in the editor's order.
var Builtins = []string{"vpnych", "classic", "light", "minimal", "neon"}

// BuiltinTemplate is a built-in template as it comes, ok false for an unknown id.
func BuiltinTemplate(id string) (Template, bool) {
	t := Template{ID: id, Base: id, Blocks: defaultBlocks(), Texts: []PageText{}, Banners: []PageBanner{}}
	bg := TemplateBackground{Kind: "theme", Angle: 160, Dim: 30}
	switch id {
	case "vpnych":
		t.Look = TemplateLook{Scheme: "dark", Bg: "#0B141B", Bg2: "#0F1B24", Card: "#1A2832", CardAlpha: 72, Text: "#FFFFFF", Muted: "#8A99A8",
			Accent: "#1F9E8E", Accent2: "#2BB3A1", Danger: "#EE4D6A", Font: "inter", Radius: 32, Glass: true, Headings: "italic", Glow: true, Background: bg}
	case "classic":
		t.Look = TemplateLook{Scheme: "light", Bg: "#EAF4F2", Bg2: "#F4FAF8", Card: "#FFFFFF", CardAlpha: 80, Text: "#161A24", Muted: "#5C6474",
			Accent: "#1F9E8E", Accent2: "#17877A", Danger: "#BB382F", Font: "unbounded", Radius: 24, Glass: true, Headings: "regular", Glow: true, Background: bg}
	case "light":
		t.Look = TemplateLook{Scheme: "light", Bg: "#F5F6F8", Bg2: "#FFFFFF", Card: "#FFFFFF", CardAlpha: 100, Text: "#111827", Muted: "#6B7280",
			Accent: "#2563EB", Accent2: "#1D4ED8", Danger: "#DC2626", Font: "system", Radius: 20, Headings: "regular", Background: bg}
	case "minimal":
		t.Look = TemplateLook{Scheme: "light", Bg: "#FFFFFF", Bg2: "#FFFFFF", Card: "#F4F4F5", CardAlpha: 100, Text: "#09090B", Muted: "#71717A",
			Accent: "#18181B", Accent2: "#3F3F46", Danger: "#DC2626", Font: "system", Radius: 12, Headings: "regular", Background: bg}
		for i, b := range t.Blocks {
			t.Blocks[i].On = b.On && !slices.Contains([]string{"devices", "guide", "instructions", "telegram"}, b.ID)
		}
	case "neon":
		t.Look = TemplateLook{Scheme: "dark", Bg: "#0A0612", Bg2: "#160B2E", Card: "#1C1030", CardAlpha: 70, Text: "#F5F3FF", Muted: "#A59CC4",
			Accent: "#D946EF", Accent2: "#22D3EE", Danger: "#FB7185", Font: "unbounded", Radius: 28, Glass: true, Headings: "italic", Glow: true, Background: bg}
	default:
		return Template{}, false
	}
	return t, true
}

func defaultBlocks() []PageBlock {
	out := make([]PageBlock, 0, len(builtins))
	for _, b := range builtins {
		out = append(out, PageBlock{ID: b.typ, Type: b.typ, On: b.on})
	}
	return out
}

// Template is the page's template by id, ok false when there is none.
func (c *Page) Template(id string) (*Template, bool) {
	i := slices.IndexFunc(c.Templates, func(t Template) bool { return t.ID == id })
	if i < 0 {
		return nil, false
	}
	return &c.Templates[i], true
}

// ActiveTemplate is the template the page shows.
func (c *Page) ActiveTemplate() Template {
	if t, ok := c.Template(c.Active); ok {
		return *t
	}
	t, _ := BuiltinTemplate(TemplateDefault)
	return t
}

// normalizeTemplates cleans c's templates: the built-in ones are all there, first and in
// their order, the admin's own follow in theirs; what does not fit is dropped or set to its
// base's value. Fields are named by the template's place in the list as sent.
func normalizeTemplates(c *Page) []Problem {
	var out []Problem
	seen := map[string]bool{}
	own := []Template{}
	got := map[string]Template{}
	for i, t := range c.Templates {
		at := "templates[" + strconv.Itoa(i) + "]."
		t.ID = strings.TrimSpace(t.ID)
		builtin := slices.Contains(Builtins, t.ID)
		switch {
		case !builtin && !ownRe.MatchString(t.ID):
			out = append(out, Problem{Field: at + "id", Code: "template_id_invalid", Value: t.ID})
			continue
		case seen[t.ID]:
			out = append(out, Problem{Field: at + "id", Code: "template_duplicate", Value: t.ID})
			continue
		case !builtin && len(own) >= MaxOwn:
			out = append(out, Problem{Field: at + "id", Code: "too_many_templates", Value: MaxOwn})
			continue
		}
		seen[t.ID] = true
		out = append(out, normalizeTemplate(&t, at)...)
		if builtin {
			got[t.ID] = t
		} else {
			own = append(own, t)
		}
	}
	list := make([]Template, 0, len(Builtins)+len(own))
	for _, id := range Builtins {
		if t, ok := got[id]; ok {
			list = append(list, t)
		} else {
			t, _ := BuiltinTemplate(id)
			list = append(list, t)
		}
	}
	c.Templates = append(list, own...)
	c.Active = strings.TrimSpace(c.Active)
	switch {
	case c.Active == "":
		c.Active = TemplateDefault
	case !seen[c.Active] && !slices.Contains(Builtins, c.Active):
		out = append(out, Problem{Field: "active", Code: "value_invalid", Value: c.Active})
		c.Active = TemplateDefault
	}
	return out
}

func normalizeTemplate(t *Template, at string) []Problem {
	var out []Problem
	bad := func(field, code string, value any) {
		out = append(out, Problem{Field: at + field, Code: code, Value: value})
	}
	if slices.Contains(Builtins, t.ID) {
		t.Base = t.ID
	} else if t.Base = strings.TrimSpace(t.Base); t.Base == "" {
		t.Base = TemplateDefault
	} else if !slices.Contains(Builtins, t.Base) {
		bad("base", "value_invalid", t.Base)
		t.Base = TemplateDefault
	}
	d, _ := BuiltinTemplate(t.Base)
	t.Name = strings.TrimSpace(t.Name)
	if !oneLine(t.Name, 40) {
		bad("name", "one_line", nil)
		t.Name = ""
	}

	l, dl := &t.Look, d.Look
	enum := func(field string, v *string, def string, set ...string) {
		*v = strings.TrimSpace(*v)
		switch {
		case *v == "":
			*v = def
		case !oneOf(*v, set...):
			bad(field, "value_invalid", *v)
			*v = def
		}
	}
	color := func(field string, v *string, def string) {
		*v = strings.ToUpper(strings.TrimSpace(*v))
		switch {
		case *v == "":
			*v = def
		case !ValidColor(*v):
			bad(field, "color_invalid", *v)
			*v = def
		}
	}
	number := func(field string, v *int, lo, hi, def int) {
		if *v < lo || *v > hi {
			bad(field, "value_invalid", *v)
			*v = def
		}
	}
	enum("look.scheme", &l.Scheme, dl.Scheme, "light", "dark")
	color("look.bg", &l.Bg, dl.Bg)
	color("look.bg2", &l.Bg2, dl.Bg2)
	color("look.card", &l.Card, dl.Card)
	color("look.text", &l.Text, dl.Text)
	color("look.muted", &l.Muted, dl.Muted)
	color("look.accent", &l.Accent, dl.Accent)
	color("look.accent2", &l.Accent2, dl.Accent2)
	color("look.danger", &l.Danger, dl.Danger)
	number("look.card_alpha", &l.CardAlpha, 0, 100, dl.CardAlpha)
	enum("look.font", &l.Font, dl.Font, "inter", "onest", "unbounded", "system", "rounded", "mono")
	number("look.radius", &l.Radius, 0, 40, dl.Radius)
	enum("look.headings", &l.Headings, dl.Headings, "italic", "regular")

	bg := &l.Background
	enum("look.background.kind", &bg.Kind, "theme", "theme", "solid", "gradient", "image")
	for field, v := range map[string]*string{"look.background.from": &bg.From, "look.background.to": &bg.To} {
		*v = strings.ToUpper(strings.TrimSpace(*v))
		if *v != "" && !ValidColor(*v) {
			bad(field, "color_invalid", *v)
			*v = ""
		}
	}
	bg.Image = strings.TrimSpace(bg.Image)
	switch {
	case bg.Kind == "solid" && bg.From == "":
		bad("look.background.from", "color_required", nil)
		bg.Kind = "theme"
	case bg.Kind == "gradient" && (bg.From == "" || bg.To == ""):
		field := "look.background.from"
		if bg.From != "" {
			field = "look.background.to"
		}
		bad(field, "color_required", nil)
		bg.Kind = "theme"
	case bg.Kind == "image" && !bgImageRe.MatchString(bg.Image):
		bad("look.background.image", "value_invalid", bg.Image)
		bg.Kind = "theme"
	}
	if bg.Kind != "image" {
		bg.Image = ""
	}
	number("look.background.angle", &bg.Angle, 0, 359, dl.Background.Angle)
	number("look.background.dim", &bg.Dim, 0, 80, dl.Background.Dim)

	out = append(out, normalizeBlocks(&t.Blocks, at)...)

	if len(t.Texts) > MaxTexts {
		bad("texts", "too_many", MaxTexts)
		t.Texts = t.Texts[:MaxTexts]
	}
	texts := []PageText{}
	keys := map[string]bool{}
	for i, x := range t.Texts {
		f := "texts[" + strconv.Itoa(i) + "]."
		x.Key = strings.TrimSpace(x.Key)
		x.RU = strings.TrimSpace(strings.ReplaceAll(x.RU, "\r\n", "\n"))
		x.EN = strings.TrimSpace(strings.ReplaceAll(x.EN, "\r\n", "\n"))
		switch {
		case len(x.Key) > 84 || !textKeyRe.MatchString(x.Key):
			bad(f+"key", "value_invalid", x.Key)
			continue
		case keys[x.Key]:
			bad(f+"key", "duplicate", x.Key)
			continue
		}
		ok := true
		for _, v := range []struct {
			field string
			s     *string
		}{{"ru", &x.RU}, {"en", &x.EN}} {
			if utf8.RuneCountInString(*v.s) > 500 {
				bad(f+v.field, "too_long", 500)
				ok = false
			} else if HasControl(*v.s) {
				bad(f+v.field, "value_invalid", nil)
				ok = false
			}
		}
		if !ok || x.RU == "" && x.EN == "" {
			continue
		}
		keys[x.Key] = true
		texts = append(texts, x)
	}
	t.Texts = texts

	if len(t.Banners) > MaxBanners {
		bad("banners", "too_many", MaxBanners)
		t.Banners = t.Banners[:MaxBanners]
	}
	banners := []PageBanner{}
	ids := map[string]bool{}
	for i, b := range t.Banners {
		f := "banners[" + strconv.Itoa(i) + "]."
		b.ID = strings.TrimSpace(b.ID)
		if !bannerIDRe.MatchString(b.ID) {
			bad(f+"id", "value_invalid", b.ID)
			continue
		}
		if ids[b.ID] {
			bad(f+"id", "duplicate", b.ID)
			continue
		}
		ok := true
		b.Title = strings.TrimSpace(b.Title)
		if !oneLine(b.Title, 80) {
			bad(f+"title", "one_line", nil)
			ok = false
		}
		b.Text = strings.TrimSpace(strings.ReplaceAll(b.Text, "\r\n", "\n"))
		if utf8.RuneCountInString(b.Text) > 300 {
			bad(f+"text", "too_long", 300)
			ok = false
		} else if HasControl(b.Text) {
			bad(f+"text", "value_invalid", nil)
			ok = false
		}
		if b.Image = strings.TrimSpace(b.Image); b.Image != "" && !bannerImgRe.MatchString(b.Image) {
			bad(f+"image", "value_invalid", b.Image)
			ok = false
		}
		bt := &b.Button
		bt.Label, bt.URL = strings.TrimSpace(bt.Label), strings.TrimSpace(bt.URL)
		switch {
		case bt.Label == "" && bt.URL == "":
		case bt.Label == "" || !oneLine(bt.Label, 40):
			bad(f+"button.label", "label_required", nil)
			ok = false
		case !textutil.ValidLink(bt.URL, pageLinks):
			bad(f+"button.url", "link_invalid", nil)
			ok = false
		}
		if b.Title == "" && b.Text == "" && b.Image == "" {
			bad(f+"title", "banner_empty", nil)
			ok = false
		}
		enum(f+"place", &b.Place, "top", "top", "bottom", "after")
		b.After = strings.TrimSpace(b.After)
		if b.Place == "after" && !slices.ContainsFunc(t.Blocks, func(x PageBlock) bool { return x.ID == b.After }) {
			bad(f+"after", "block_unknown", b.After)
			b.Place = "top"
		}
		if b.Place != "after" {
			b.After = ""
		}
		if b.From < 0 || b.Until < 0 || b.Until != 0 && b.Until <= b.From {
			bad(f+"until", "value_invalid", b.Until)
			ok = false
		}
		enum(f+"tone", &b.Tone, "accent", "accent", "card", "warning")
		enum(f+"where", &b.Where, "all", "all", "miniapp", "browser")
		if !ok {
			continue
		}
		ids[b.ID] = true
		banners = append(banners, b)
	}
	t.Banners = banners

	if utf8.RuneCountInString(t.CSS) > 20480 {
		bad("css", "too_long", 20480)
		t.CSS = ""
	}
	t.CSS = CleanCSS(t.CSS)
	return out
}

// Live says whether a banner shows at the unix time now.
func (b PageBanner) Live(now int64) bool {
	return b.On && (b.From == 0 || now >= b.From) && (b.Until == 0 || now < b.Until)
}

// Images are the uploaded images the templates use, bg-* and banner-* ones.
func (c *Page) Images() map[string]bool {
	out := map[string]bool{}
	for _, t := range c.Templates {
		if t.Look.Background.Kind == "image" {
			out[t.Look.Background.Image] = true
		}
		for _, b := range t.Banners {
			if b.Image != "" {
				out[b.Image] = true
			}
		}
	}
	return out
}

// TemplateImage says whether name is an image of a template (its background or a banner's),
// those the editor uploads under names of its own.
func TemplateImage(name string) bool {
	return name != AssetBackground && bgImageRe.MatchString(name) || bannerImgRe.MatchString(name)
}
