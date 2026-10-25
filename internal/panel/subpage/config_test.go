package subpage

import (
	"bytes"
	"encoding/json"
	"reflect"
	"slices"
	"strings"
	"testing"
)

// Nothing configured is ВПНыч's page as it always was: the zero document cleans to Default,
// whose templates are the built-in ones and whose active one is ВПНыч.
func TestZeroIsDefault(t *testing.T) {
	var c Page
	if ps := Normalize(&c); len(ps) != 0 {
		t.Fatalf("the zero document has problems: %+v", ps)
	}
	d := Default()
	// What zero means for a switch; a stored document is read over Default (Service.Page),
	// so this never comes from a zero.
	d.Apps.QR = false
	if !reflect.DeepEqual(c, d) {
		t.Fatalf("zero cleans to\n%+v\nwant\n%+v", c, d)
	}
	var order []string
	d0 := Default()
	for _, b := range d0.ActiveTemplate().Blocks {
		if b.On {
			order = append(order, b.ID)
		}
	}
	if got := strings.Join(order, ","); got != "status,promo,shop,traffic,devices,apps,guide,instructions,link,reissue,telegram,support" {
		t.Fatalf("default sections: %s", got)
	}
	def := Default()
	if def.Active != "vpnych" || !def.Apps.QR || def.Apps.Platform != "auto" || len(def.Templates) != len(Builtins) {
		t.Fatalf("default page changed: %+v", def)
	}
	for i, id := range Builtins {
		if def.Templates[i].ID != id || def.Templates[i].Base != id || def.Templates[i].CSS != "" {
			t.Fatalf("built-in %d: %+v", i, def.Templates[i])
		}
	}
	if l := def.ActiveTemplate().Look; l.Bg != "#0B141B" || l.Accent != "#1F9E8E" || l.Font != "inter" || l.Radius != 32 || !l.Glass || l.Headings != "italic" || l.Background != (TemplateBackground{Kind: "theme", Angle: 160, Dim: 30}) {
		t.Fatalf("ВПНыч's look changed: %+v", l)
	}
}

func TestDefaultIsClean(t *testing.T) {
	c := Default()
	if ps := Normalize(&c); len(ps) != 0 || !reflect.DeepEqual(c, Default()) {
		t.Fatalf("Default is not clean: %+v", ps)
	}
}

// Every built-in template is clean as it comes: the editor's reset gives no problems.
func TestBuiltinsAreClean(t *testing.T) {
	for _, id := range Builtins {
		tp, ok := BuiltinTemplate(id)
		want := tp
		if ps := normalizeTemplate(&tp, ""); !ok || len(ps) != 0 || !reflect.DeepEqual(tp, want) {
			t.Errorf("%s: %v %+v", id, ok, ps)
		}
	}
	if _, ok := BuiltinTemplate("own-x"); ok {
		t.Fatal("own-x is not built in")
	}
}

func codes(ps []Problem) map[string]string {
	out := map[string]string{}
	for _, p := range ps {
		if _, ok := out[p.Field]; !ok { // the first: what follows from it comes after
			out[p.Field] = p.Code
		}
	}
	return out
}

func TestNormalizeRefuses(t *testing.T) {
	banner := func(b PageBanner) func(*Page) {
		return func(c *Page) { c.Templates[0].Banners = []PageBanner{b} }
	}
	block := func(b PageBlock) func(*Page) {
		return func(c *Page) { c.Templates[0].Blocks = append(c.Templates[0].Blocks, b) }
	}
	cases := []struct {
		name  string
		edit  func(*Page)
		field string
		code  string
	}{
		{"colour without #", func(c *Page) { c.Templates[0].Look.Background = TemplateBackground{Kind: "solid", From: "F07A2E"} }, "templates[0].look.background.from", "color_invalid"},
		{"colour with a name", func(c *Page) {
			c.Templates[0].Look.Background = TemplateBackground{Kind: "gradient", From: "#F07A2E", To: "red"}
		}, "templates[0].look.background.to", "color_invalid"},
		{"short colour", func(c *Page) { c.Templates[1].Look.Accent = "#FFF" }, "templates[1].look.accent", "color_invalid"},
		{"solid without a colour", func(c *Page) { c.Templates[0].Look.Background = TemplateBackground{Kind: "solid"} }, "templates[0].look.background.from", "color_required"},
		{"background image by another name", func(c *Page) {
			c.Templates[0].Look.Background = TemplateBackground{Kind: "image", Image: "logo"}
		}, "templates[0].look.background.image", "value_invalid"},
		{"unknown font", func(c *Page) { c.Templates[0].Look.Font = "comic" }, "templates[0].look.font", "value_invalid"},
		{"radius out of range", func(c *Page) { c.Templates[0].Look.Radius = 99 }, "templates[0].look.radius", "value_invalid"},
		{"dim out of range", func(c *Page) { c.Templates[0].Look.Background.Dim = 95 }, "templates[0].look.background.dim", "value_invalid"},
		{"unknown template", func(c *Page) { c.Templates = append(c.Templates, Template{ID: "mine"}) }, "templates[5].id", "template_id_invalid"},
		{"template twice", func(c *Page) { c.Templates = append(c.Templates, Template{ID: "neon"}) }, "templates[5].id", "template_duplicate"},
		{"own on an unknown base", func(c *Page) { c.Templates = append(c.Templates, Template{ID: "own-a", Base: "retro"}) }, "templates[5].base", "value_invalid"},
		{"name on two lines", func(c *Page) { c.Templates[2].Name = "a\nb" }, "templates[2].name", "one_line"},
		{"unknown active", func(c *Page) { c.Active = "own-zz" }, "active", "value_invalid"},
		{"text of another page", func(c *Page) { c.Templates[0].Texts = []PageText{{Key: "admin.title", RU: "x"}} }, "templates[0].texts[0].key", "value_invalid"},
		{"text twice", func(c *Page) {
			c.Templates[0].Texts = []PageText{{Key: "sub.shop", RU: "a"}, {Key: "sub.shop", EN: "b"}}
		}, "templates[0].texts[1].key", "duplicate"},
		{"text too long", func(c *Page) { c.Templates[0].Texts = []PageText{{Key: "sub.shop", RU: strings.Repeat("я", 501)}} }, "templates[0].texts[0].ru", "too_long"},
		{"banner without id", banner(PageBanner{Title: "x"}), "templates[0].banners[0].id", "value_invalid"},
		{"empty banner", banner(PageBanner{ID: "a"}), "templates[0].banners[0].title", "banner_empty"},
		{"banner button without a label", banner(PageBanner{ID: "a", Title: "x", Button: BannerButton{URL: "https://example.com"}}), "templates[0].banners[0].button.label", "label_required"},
		{"banner javascript link", banner(PageBanner{ID: "a", Title: "x", Button: BannerButton{Label: "Go", URL: "javascript:alert(1)"}}), "templates[0].banners[0].button.url", "link_invalid"},
		{"banner after no block", banner(PageBanner{ID: "a", Title: "x", Place: "after", After: "ads"}), "templates[0].banners[0].after", "block_unknown"},
		{"banner ends before it starts", banner(PageBanner{ID: "a", Title: "x", From: 200, Until: 100}), "templates[0].banners[0].until", "value_invalid"},
		{"banner image by another name", banner(PageBanner{ID: "a", Title: "x", Image: "logo"}), "templates[0].banners[0].image", "value_invalid"},
		{"emoji logo without emoji", func(c *Page) { c.Brand.Logo = "emoji" }, "brand.emoji", "emoji_required"},
		{"markup for an emoji", func(c *Page) { c.Brand.Logo, c.Brand.Emoji = "emoji", "<b>" }, "brand.emoji", "emoji_invalid"},
		{"subtitle on two lines", func(c *Page) { c.Brand.Subtitle = "a\nb" }, "brand.subtitle", "one_line"},
		{"unknown block", block(PageBlock{ID: "ads", Type: "ads", On: true}), "templates[0].blocks[14].type", "block_unknown"},
		{"built-in twice", block(PageBlock{ID: "status", Type: "status"}), "templates[0].blocks[14].id", "block_duplicate"},
		{"built-in under another id", func(c *Page) { c.Templates[0].Blocks[0].ID = "news" }, "templates[0].blocks[0].id", "block_id_invalid"},
		{"own block without its prefix", block(PageBlock{ID: "links-1", Type: TypeText}), "templates[0].blocks[14].id", "block_id_invalid"},
		{"own text too long", block(PageBlock{ID: "text-a", Type: TypeText, Text: strings.Repeat("я", 8001)}), "templates[0].blocks[14].text", "too_long"},
		{"image over http", block(PageBlock{ID: "text-a", Type: TypeText, Text: "see ![x](http://example.com/a.png)"}), "templates[0].blocks[14].text", "image_https"},
		{"javascript link", block(PageBlock{ID: "links-a", Type: TypeLinks, Links: []PageLink{{Label: "Go", URL: "javascript:alert(1)"}}}), "templates[0].blocks[14].links[0].url", "link_invalid"},
		{"data link", block(PageBlock{ID: "links-a", Type: TypeLinks, Links: []PageLink{{Label: "Go", URL: "data:text/html,x"}}}), "templates[0].blocks[14].links[0].url", "link_invalid"},
		{"link with credentials", block(PageBlock{ID: "links-a", Type: TypeLinks, Links: []PageLink{{Label: "Go", URL: "https://user:pw@example.com"}}}), "templates[0].blocks[14].links[0].url", "link_invalid"},
		{"link without a label", block(PageBlock{ID: "links-a", Type: TypeLinks, Links: []PageLink{{URL: "https://example.com"}}}), "templates[0].blocks[14].links[0].label", "label_required"},
		{"app name with markup", func(c *Page) { c.Apps.IOS.Order = []string{"<Happ>"} }, "apps.ios.order", "app_invalid"},
		{"css too long", func(c *Page) { c.Templates[0].CSS = strings.Repeat("a", 20481) }, "templates[0].css", "too_long"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			c := Default()
			tc.edit(&c)
			got := codes(Normalize(&c))
			if got[tc.field] != tc.code {
				t.Fatalf("problems %v, want %s at %s", got, tc.code, tc.field)
			}
		})
	}
}

func TestNormalizeKeepsWhatIsRight(t *testing.T) {
	c := Default()
	own, _ := BuiltinTemplate("neon")
	own.ID, own.Base, own.Name = "own-promo", "neon", "  Акция  "
	own.Look = TemplateLook{Accent: "#ff8800", Background: TemplateBackground{Kind: "gradient", From: "#0f6272", To: "#eaf5f8", Angle: 90}}
	own.Blocks = append([]PageBlock{
		{ID: "links-x1", Type: TypeLinks, On: true, Title: " Каналы ", Links: []PageLink{{Label: "Канал", URL: "https://t.me/mikan", Emoji: "📣"}, {Label: "Бот", URL: "tg://resolve?domain=mikan_bot"}, {Label: "Сайт", URL: "http://example.com"}}},
		{ID: "text-1", Type: TypeText, On: true, Text: "# Привет\r\n![](https://example.com/a.png)", Links: []PageLink{{Label: "dropped", URL: "https://x"}}},
	}, own.Blocks[:3]...) // the other built-ins are left out: they come back at the end
	own.Texts = []PageText{{Key: "sub.shop", RU: " Магазин ", EN: ""}, {Key: "sub.app.pay", RU: "", EN: ""}}
	own.Banners = []PageBanner{{ID: "sale", On: true, Title: "Скидка", Image: "banner-sale", Button: BannerButton{Label: "Купить", URL: "https://example.com"}, Place: "after", After: "status", Until: 2000000000}}
	c.Templates = append([]Template{own}, c.Templates[2:]...) // own first, two built-ins missing
	c.Active = "own-promo"
	c.Apps.Android = PageAppList{Order: []string{"INCY", "Happ", "INCY"}, Hidden: []string{"Hiddify"}}
	if ps := Normalize(&c); len(ps) != 0 {
		t.Fatalf("problems: %+v", ps)
	}
	var ids []string
	for _, x := range c.Templates {
		ids = append(ids, x.ID)
	}
	if strings.Join(ids, ",") != "vpnych,classic,light,minimal,neon,own-promo" || c.Active != "own-promo" {
		t.Fatalf("templates not in order: %v, active %s", ids, c.Active)
	}
	o := c.Templates[5]
	if o.Name != "Акция" || o.Look.Accent != "#FF8800" || o.Look.Bg != "#0A0612" || o.Look.Font != "unbounded" || o.Look.Background.From != "#0F6272" {
		t.Fatalf("own look not filled from its base: %+v", o.Look)
	}
	if o.Blocks[0].Title != "Каналы" || len(o.Blocks[0].Links) != 3 || o.Blocks[1].Links != nil || o.Blocks[1].Text != "# Привет\n![](https://example.com/a.png)" {
		t.Fatalf("cleaned wrong: %+v", o.Blocks[:2])
	}
	if len(o.Blocks) != 16 || o.Blocks[5].ID != "shop" || o.Blocks[15].ID != "support" || o.Blocks[12].ID != "reissue" {
		t.Fatalf("missing built-ins not put back in order: %+v", o.Blocks)
	}
	if len(o.Texts) != 1 || o.Texts[0] != (PageText{Key: "sub.shop", RU: "Магазин"}) {
		t.Fatalf("texts: %+v", o.Texts)
	}
	if len(o.Banners) != 1 || o.Banners[0].Tone != "accent" || o.Banners[0].Where != "all" || o.Banners[0].After != "status" {
		t.Fatalf("banners: %+v", o.Banners)
	}
	if strings.Join(c.Apps.Android.Order, ",") != "INCY,Happ" {
		t.Fatalf("app order not deduplicated: %v", c.Apps.Android.Order)
	}
	if im := c.Images(); len(im) != 1 || !im["banner-sale"] {
		t.Fatalf("images in use: %v", im)
	}
}

func TestTooManyOwn(t *testing.T) {
	c := Default()
	for i := range MaxCustom + 1 {
		c.Templates[0].Blocks = append(c.Templates[0].Blocks, PageBlock{ID: "text-" + string(rune('a'+i)), Type: TypeText})
	}
	for i := range MaxOwn + 1 {
		c.Templates = append(c.Templates, Template{ID: "own-" + string(rune('a'+i)), Base: "light"})
	}
	got := codes(Normalize(&c))
	if got["templates[0].blocks[26]"] != "too_many_blocks" || got["templates[13].id"] != "too_many_templates" || len(c.Templates) != len(Builtins)+MaxOwn {
		t.Fatalf("too many: %v", got)
	}
}

// A page saved before the templates is the classic template with what the admin had set;
// ВПНыч's stays the one shown.
func TestMigrate(t *testing.T) {
	css := "a{color:red}"
	st := stored{Page: Default(), Look: &legacyLook{Mode: "dark", Accent: "brand", Font: "rounded", Radius: "small", Cards: "solid", Background: TemplateBackground{Kind: "image", Dim: 40}},
		Blocks: []PageBlock{{ID: "link", Type: "link", On: true}, {ID: "status", Type: "status", On: true}}, CSS: &css}
	st.Templates = nil
	c := st.migrate()
	if ps := Normalize(&c); len(ps) != 0 {
		t.Fatalf("problems: %+v", ps)
	}
	cl, _ := c.Template("classic")
	l := cl.Look
	if c.Active != "vpnych" || l.Scheme != "dark" || l.Bg != "#0E1418" || !l.BrandAccent || l.Font != "rounded" || l.Radius != 12 || l.Glass || l.CardAlpha != 100 ||
		l.Background.Kind != "image" || l.Background.Image != AssetBackground || l.Background.Dim != 40 || cl.CSS != css || cl.Blocks[0].ID != "link" {
		t.Fatalf("classic from the old page: %+v", cl)
	}
	if v, _ := c.Template("vpnych"); !reflect.DeepEqual(*v, Default().Templates[0]) {
		t.Fatalf("ВПНыч changed: %+v", v)
	}
	if im := c.Images(); !im[AssetBackground] {
		t.Fatalf("the old background is in use: %v", im)
	}
	// Saved with templates: nothing to move.
	st = stored{Page: Default(), Blocks: []PageBlock{{ID: "link", Type: "link"}}}
	if c := st.migrate(); !reflect.DeepEqual(c, Default()) {
		t.Fatal("a page with templates was migrated")
	}
}

// What the page is told: the blocks it shows, the banners of now with their images as links,
// the template's CSS kept for the head and the images that are gone left out.
func TestBuild(t *testing.T) {
	c := Default()
	tp := c.Templates[0]
	tp.Look.BrandAccent = true
	tp.Look.Background = TemplateBackground{Kind: "image", Image: "bg-a"}
	tp.CSS = "a{}"
	tp.Banners = []PageBanner{
		{ID: "now", On: true, Title: "x", Image: "banner-a", Place: "top", Tone: "accent", Where: "all"},
		{ID: "gone", On: true, Image: "banner-b", Place: "top", Tone: "accent", Where: "all"},
		{ID: "later", On: true, Title: "x", From: 2000, Place: "top", Tone: "accent", Where: "all"},
		{ID: "off", Title: "x", Place: "top", Tone: "accent", Where: "all"},
	}
	c.Brand.Logo = "image"
	assets := map[string]PageAsset{"banner-a": {Name: "banner-a", Hash: "h1"}, "bg-a": {Name: "bg-a", Hash: "h2"}}
	p := build(c, tp, assets, "VPN", "#123456", 1000)
	if len(p.Template.Banners) != 1 || p.Template.Banners[0].Image != "brand/banner-a?v=h1" {
		t.Fatalf("banners: %+v", p.Template.Banners)
	}
	if p.Accent != "#123456" || p.Background != "brand/bg-a?v=h2" || p.Template.Look.Background.Image != "" || p.Template.CSS != "" || p.css != "a{}" {
		t.Fatalf("public: %+v", p)
	}
	if p.Header.Logo != "letter" || p.Logo != "" {
		t.Fatalf("logo gone: %+v %q", p.Header, p.Logo)
	}
	for _, b := range p.Template.Blocks {
		if !b.On {
			t.Fatalf("an off block went out: %+v", b)
		}
	}
	delete(assets, "bg-a")
	if p := build(c, tp, assets, "VPN", "", 1000); p.Background != "" || p.Template.Look.Background.Kind != "theme" || p.Accent != "" {
		t.Fatalf("background gone: %+v", p.Template.Look.Background)
	}
}

func TestTemplateImages(t *testing.T) {
	for name, want := range map[string]bool{"bg-a": true, "banner-sale-1": true, "background": false, "logo": false, "bg-": false, "banner-A": false} {
		if TemplateImage(name) != want {
			t.Errorf("TemplateImage(%q) != %v", name, want)
		}
	}
	for name, want := range map[string]int{"logo": 512 << 10, "background": 2 << 20, "bg-x": 2 << 20, "banner-x": 1 << 20, "favicon": 0, "bg-../x": 0} {
		if got := AssetLimit(name); got != want {
			t.Errorf("AssetLimit(%q) = %d, want %d", name, got, want)
		}
	}
}

func TestCleanCSS(t *testing.T) {
	for in, want := range map[string]string{
		"body{color:red}":                              "body{color:red}",
		"a{}</style><script>alert(1)</script>":         "a{}/style>script>alert(1)/script>",
		"@import url(https://evil.example/x.css); a{}": "none; a{}",
		"@IMPORT 'x'; @imp@importort 'y';":             "'x';  'y';",
		`@\69mport url(x); b{}`:                        "@69mport url(x); b{}",
		// Images of other sites would let them count the subscribers; the panel's and
		// data: images stay, and an escape cannot spell url( past the check.
		"body{background:url(https://t.example/p.gif)}":         "body{background:none}",
		"a{background:URL( '//t.example/p.gif' )}":              "a{background:none}",
		"a{background:image-set('https://t.example/a.png' 1x)}": "a{background:none}",
		`a{background:u\72l(https://t.example/p.gif)}`:          "a{background:u72l(https://t.example/p.gif)}",
		"a{background:url(/sub/brand/logo)}":                    "a{background:url(/sub/brand/logo)}",
		"a{background:url(data:image/png;base64,AAAA)}":         "a{background:url(data:image/png;base64,AAAA)}",
		".x::after{content:'<'}":                                ".x::after{content:''}",
		"  @media (max-width: 400px){.a{color:red}}  \n\n":      "@media (max-width: 400px){.a{color:red}}",
	} {
		if got := CleanCSS(in); got != want {
			t.Errorf("CleanCSS(%q) = %q, want %q", in, got, want)
		}
	}
}
func TestNormalizeDoc(t *testing.T) {
	d := Doc{Title: "  Как подключить iPhone ", Emoji: "📱", Body: "Шаг 1\r\n![](https://example.com/1.png)", Platform: "ios"}
	if ps := NormalizeDoc(&d); len(ps) != 0 || d.Title != "Как подключить iPhone" || d.Body != "Шаг 1\n![](https://example.com/1.png)" {
		t.Fatalf("a good page: %+v %+v", ps, d)
	}
	for name, c := range map[string]struct {
		d     Doc
		field string
		code  string
	}{
		"no title":       {Doc{Title: "  "}, "title", "title_required"},
		"title on lines": {Doc{Title: "a\nb"}, "title", "title_required"},
		"bad platform":   {Doc{Title: "x", Platform: "beos"}, "platform", "value_invalid"},
		"http image":     {Doc{Title: "x", Body: "![a](http://example.com/x.png)"}, "body", "image_https"},
		"data image":     {Doc{Title: "x", Body: "![a](data:image/png;base64,AAAA)"}, "body", "image_https"},
		"too long":       {Doc{Title: "x", Body: strings.Repeat("a", 20001)}, "body", "too_long"},
	} {
		if got := codes(NormalizeDoc(&c.d)); got[c.field] != c.code {
			t.Errorf("%s: %v, want %s at %s", name, got, c.code, c.field)
		}
	}
}

func TestCheckImage(t *testing.T) {
	png := append([]byte("\x89PNG\r\n\x1a\n"), make([]byte, 64)...)
	jpeg := append([]byte("\xff\xd8\xff\xe0"), make([]byte, 64)...)
	webp := append([]byte("RIFF\x00\x00\x00\x00WEBPVP8 "), make([]byte, 64)...)
	for name, c := range map[string]struct {
		asset string
		data  []byte
		want  string
		err   error
	}{
		"png":             {AssetLogo, png, "image/png", nil},
		"jpeg":            {AssetBackground, jpeg, "image/jpeg", nil},
		"webp":            {AssetLogo, webp, "image/webp", nil},
		"svg":             {AssetLogo, []byte(`<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`), "", ErrImageType},
		"svg with xml":    {AssetLogo, []byte(`<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>`), "", ErrImageType},
		"html as png":     {AssetLogo, []byte("<!doctype html><script>alert(1)</script>"), "", ErrImageType},
		"gif":             {AssetLogo, []byte("GIF89a......"), "", ErrImageType},
		"empty":           {AssetLogo, nil, "", ErrImageType},
		"logo too big":    {AssetLogo, append(png, make([]byte, 512<<10)...), "", ErrImageTooBig},
		"background fit":  {AssetBackground, append(png, make([]byte, 1<<20)...), "image/png", nil},
		"template bg fit": {"bg-x", append(png, make([]byte, 1<<20)...), "image/png", nil},
		"banner too big":  {"banner-x", append(png, make([]byte, 1<<20)...), "", ErrImageTooBig},
		"unknown name":    {"favicon", png, "", ErrImageTooBig},
	} {
		got, err := CheckImage(c.asset, c.data)
		if got != c.want || err != c.err {
			t.Errorf("%s: %q %v, want %q %v", name, got, err, c.want, c.err)
		}
	}
}

// What the page's head gets cannot close its own tags, whatever the admin typed.
func TestHeadEscapes(t *testing.T) {
	c := Default()
	c.OG = PageOG{Title: `"><script>alert(1)</script>`, Description: "Быстрый VPN", Image: true}
	tp := c.ActiveTemplate()
	tp.Blocks = append(tp.Blocks, PageBlock{ID: "text-a", Type: TypeText, On: true, Text: "</script><script>alert(2)</script>"})
	p := Public{Template: tp, OG: c.OG, Brand: "</script>", Logo: AssetPath(AssetLogo, "abc"), Docs: []DocItem{}, css: "a{}</style><b>"}
	head := p.Head("https://vpn.example.com/sub")
	if bytes.Count(head, []byte("<script")) != 1 || bytes.Count(head, []byte("</script>")) != 1 || bytes.Count(head, []byte("</style>")) != 1 {
		t.Fatalf("markup leaked into the head: %s", head)
	}
	for _, want := range []string{`<meta property="og:title" content="&#34;&gt;&lt;script&gt;`, `<meta property="og:image" content="https://vpn.example.com/sub/brand/logo?v=abc">`, `<meta property="og:description" content="Быстрый VPN">`, `<style id="mikan-css">a{}/style>b></style>`} {
		if !bytes.Contains(head, []byte(want)) {
			t.Errorf("head lacks %s:\n%s", want, head)
		}
	}
	start := bytes.Index(head, []byte(`id="mikan-page">`)) + len(`id="mikan-page">`)
	end := bytes.Index(head, []byte("</script>"))
	var back Public
	if err := json.Unmarshal(head[start:end], &back); err != nil || back.Brand != "</script>" || back.Template.CSS != "" || back.Template.ID != "vpnych" {
		t.Fatalf("the page's data does not read back: %v %+v", err, back)
	}
}

// Nothing set: no preview tags, no style, no images from other sites.
func TestHeadOfDefault(t *testing.T) {
	c := Default()
	p := Public{Template: c.ActiveTemplate(), Brand: "VPN", Docs: []DocItem{}}
	head := string(p.Head("https://vpn.example.com/sub"))
	if strings.Contains(head, "og:") || strings.Contains(head, "<style") || p.RemoteImages() {
		t.Fatalf("the default page got more than its data: %s", head)
	}
	p.Docs = []DocItem{{ID: 1, Title: "x"}}
	if !p.RemoteImages() {
		t.Fatal("instructions may show https images")
	}
}

// A list saved before the "new link" block existed gets it right behind the link block,
// wherever the admin put that; a list that has it keeps it where it is.
func TestReissueFollowsLink(t *testing.T) {
	index := func(list []PageBlock, id string) int {
		return slices.IndexFunc(list, func(b PageBlock) bool { return b.ID == id })
	}
	c := Default()
	if def := c.ActiveTemplate().Blocks; index(def, "reissue") != index(def, "link")+1 || !def[index(def, "reissue")].On {
		t.Fatalf("default page: %+v", def)
	}
	old := []PageBlock{{ID: "link", Type: "link", On: true}, {ID: "status", Type: "status", On: true}}
	if ps := normalizeBlocks(&old, ""); len(ps) != 0 || index(old, "reissue") != 1 || !old[1].On {
		t.Fatalf("saved before the block: %v %+v", ps, old)
	}
	moved := []PageBlock{{ID: "reissue", Type: "reissue"}, {ID: "status", Type: "status", On: true}, {ID: "link", Type: "link", On: true}}
	if ps := normalizeBlocks(&moved, ""); len(ps) != 0 || index(moved, "reissue") != 0 || moved[0].On {
		t.Fatalf("the admin's place and choice kept: %v %+v", ps, moved)
	}
}
