package subpage

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"html"
	"net/http"
	"slices"
	"time"

	"mikan/internal/panel/settings"
	"mikan/internal/panel/store/db"
)

// The page's images, one of each.
const (
	AssetLogo       = "logo"
	AssetBackground = "background"
)

// AssetLimit is how big an image of name may be; 0: no such image. Besides the logo and the
// background the templates have their own: bg-<x> backgrounds and banner-<x> pictures.
func AssetLimit(name string) int {
	switch {
	case name == AssetLogo:
		return 512 << 10
	case name == AssetBackground, bgImageRe.MatchString(name):
		return 2 << 20
	case bannerImgRe.MatchString(name):
		return 1 << 20
	}
	return 0
}

var (
	// ErrImageType: the bytes are no PNG, JPEG or WebP (an SVG, which may carry script,
	// or an HTML page named .png among them).
	ErrImageType = errors.New("image_type")
	// ErrImageTooBig: over AssetLimit.
	ErrImageTooBig = errors.New("image_too_big")
)

// CheckImage says what kind of image data is, the way a browser would sniff it, and takes
// only PNG, JPEG and WebP within the image's limit: the type is fixed by what the bytes
// are, not by a name or a header someone sent.
func CheckImage(name string, data []byte) (string, error) {
	if len(data) == 0 {
		return "", ErrImageType
	}
	if len(data) > AssetLimit(name) {
		return "", ErrImageTooBig
	}
	switch ct := http.DetectContentType(data); ct {
	case "image/png", "image/jpeg", "image/webp":
		return ct, nil
	}
	return "", ErrImageType
}

// Hash names a version of an image in its links.
func Hash(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:8])
}

// AssetPath is where the page finds an image, relative to the subscription path.
func AssetPath(name, hash string) string { return "brand/" + name + "?v=" + hash }

// Service reads the page's settings, instructions and images.
type Service struct {
	q   *db.Queries
	set *settings.Settings
}

func NewService(q *db.Queries) *Service { return &Service{q: q, set: settings.New(q)} }

// Page is the stored document over the defaults, cleaned: what does not fit is shown as
// the default (an older or a hand-edited document never breaks the page).
func (s *Service) Page(ctx context.Context) (Page, error) {
	def := stored{Page: Default()}
	// Read over a list of its own: JSON fills the elements of a default slice in place.
	def.Templates = nil
	st, _, err := settings.GetOver(ctx, s.set, settings.KeySubPage, def)
	if err != nil {
		return Default(), err
	}
	c := st.migrate()
	_ = Normalize(&c)
	return c, nil
}

// stored is the document as an older version may have saved it: one look, one list of
// blocks and one CSS for the whole page, before there were templates.
type stored struct {
	Page
	Look   *legacyLook `json:"look"`
	Blocks []PageBlock `json:"blocks"`
	CSS    *string     `json:"css"`
}

type legacyLook struct {
	Mode       string             `json:"mode"`
	Accent     string             `json:"accent"`
	Background TemplateBackground `json:"background"`
	Font       string             `json:"font"`
	Radius     string             `json:"radius"`
	Cards      string             `json:"cards"`
}

// migrate turns a document saved before the templates into the classic template, which is
// what that page looked like; the page keeps showing ВПНыч's unless another was chosen.
func (st stored) migrate() Page {
	c := st.Page
	if c.Templates != nil || st.Look == nil && st.Blocks == nil && st.CSS == nil {
		return c
	}
	t, _ := BuiltinTemplate("classic")
	if st.Blocks != nil {
		t.Blocks = st.Blocks
	}
	if st.CSS != nil {
		t.CSS = *st.CSS
	}
	if l := st.Look; l != nil {
		if l.Mode == "dark" {
			t.Look.Scheme, t.Look.Bg, t.Look.Bg2, t.Look.Card, t.Look.Text, t.Look.Muted, t.Look.Danger = "dark", "#0E1418", "#141D22", "#1B262C", "#F2F5F4", "#93A39F", "#EE4D6A"
		}
		t.Look.BrandAccent = l.Accent == "brand"
		switch l.Font {
		case "onest", "system", "rounded":
			t.Look.Font = l.Font
		}
		switch l.Radius {
		case "small":
			t.Look.Radius = 12
		case "medium":
			t.Look.Radius = 18
		}
		if l.Cards == "solid" {
			t.Look.Glass, t.Look.CardAlpha = false, 100
		}
		if l.Background.Kind != "" {
			t.Look.Background = l.Background
			if l.Background.Kind == "image" {
				t.Look.Background.Image = AssetBackground
			}
		}
	}
	c.Templates = []Template{t}
	return c
}

// PageAsset is an uploaded image without its bytes.
type PageAsset struct {
	Name      string `json:"name"`
	Type      string `json:"content_type"`
	Hash      string `json:"hash"`
	Size      int64  `json:"size"`
	UpdatedAt int64  `json:"updated_at"`
}

// Assets are the uploaded images by name.
func (s *Service) Assets(ctx context.Context) (map[string]PageAsset, error) {
	rows, err := s.q.ListSubAssetMeta(ctx)
	if err != nil {
		return nil, err
	}
	out := map[string]PageAsset{}
	for _, r := range rows {
		out[r.Name] = PageAsset{Name: r.Name, Type: r.ContentType, Hash: r.Hash, Size: r.Size, UpdatedAt: r.UpdatedAt}
	}
	return out, nil
}

// DocItem is an instruction as the page lists it.
type DocItem struct {
	ID       int64  `json:"id"`
	Title    string `json:"title"`
	Emoji    string `json:"emoji,omitempty"`
	Platform string `json:"platform,omitempty"`
}

// Public is what the page is told about itself: the template it shows (its CSS goes into a
// style of its own; blocks turned off, banners out of their time and images that are gone
// left out, the banners' images as links), the page's head, apps and preview, the brand and
// links to the images.
type Public struct {
	Template Template  `json:"template"`
	Header   PageBrand `json:"head" doc:"Шапка: логотип и название"`
	Apps     PageApps  `json:"apps"`
	OG       PageOG    `json:"og"`
	Brand    string    `json:"brand"`
	// Accent is the brand's colour when the page takes it; "" keeps the palette's.
	Accent     string    `json:"accent,omitempty"`
	Logo       string    `json:"logo,omitempty"`
	Background string    `json:"background,omitempty"`
	Docs       []DocItem `json:"docs"`
	css        string
}

// Public gathers the page's data with the active template. brand and accent are the panel's
// (settings.KeyBrand, KeyBrandAccent). An image chosen but gone shows as the default: the
// letter, the template's own background, a banner without its picture.
func (s *Service) Public(ctx context.Context, brand, accent string) (Public, error) {
	c, err := s.Page(ctx)
	if err != nil {
		return Public{}, err
	}
	return s.PublicOf(ctx, c, c.ActiveTemplate(), brand, accent)
}

// PublicOf is Public with template t of page c: the editor previews a draft with it.
func (s *Service) PublicOf(ctx context.Context, c Page, t Template, brand, accent string) (Public, error) {
	assets, err := s.Assets(ctx)
	if err != nil {
		return Public{}, err
	}
	docs, err := s.q.ListPublishedSubDocs(ctx)
	if err != nil {
		return Public{}, err
	}
	p := build(c, t, assets, brand, accent, time.Now().Unix())
	for _, d := range docs {
		p.Docs = append(p.Docs, DocItem{ID: d.ID, Title: d.Title, Emoji: d.Emoji, Platform: d.Platform})
	}
	return p, nil
}

func build(c Page, t Template, assets map[string]PageAsset, brand, accent string, now int64) Public {
	p := Public{Template: t, Header: c.Brand, Apps: c.Apps, OG: c.OG, Brand: brand, Docs: []DocItem{}, css: t.CSS}
	p.Template.CSS = ""
	// A block turned off is the admin's draft: it does not go into the page's source.
	p.Template.Blocks = slices.DeleteFunc(slices.Clone(t.Blocks), func(b PageBlock) bool { return !b.On })
	p.Template.Banners = []PageBanner{}
	for _, b := range t.Banners {
		if !b.Live(now) {
			continue
		}
		if a, ok := assets[b.Image]; ok && b.Image != "" {
			b.Image = AssetPath(b.Image, a.Hash)
		} else {
			b.Image = ""
		}
		if b.Title != "" || b.Text != "" || b.Image != "" {
			p.Template.Banners = append(p.Template.Banners, b)
		}
	}
	if t.Look.BrandAccent && ValidColor(accent) {
		p.Accent = accent
	}
	if a, ok := assets[AssetLogo]; ok {
		p.Logo = AssetPath(AssetLogo, a.Hash)
	} else if c.Brand.Logo == "image" {
		p.Header.Logo = "letter"
	}
	bg := t.Look.Background
	if a, ok := assets[bg.Image]; ok && bg.Kind == "image" {
		p.Background = AssetPath(bg.Image, a.Hash)
	} else if bg.Kind == "image" {
		p.Template.Look.Background.Kind = "theme"
	}
	p.Template.Look.Background.Image = ""
	return p
}

// RemoteImages says whether the page may show images from other sites: an instruction or
// a text block may hold https images. The admin's CSS may not (CleanCSS).
func (p Public) RemoteImages() bool {
	if len(p.Docs) > 0 {
		return true
	}
	for _, b := range p.Template.Blocks {
		if b.Type == TypeText && b.On && b.Text != "" {
			return true
		}
	}
	return false
}

// Head is what goes into the page's <head>: the page's data for its script (a JSON block,
// which the browser does not run), the link preview messengers read and the admin's own
// CSS. root is the subscription path's absolute address (https://host/<sub path>), for
// the preview's image.
func (p Public) Head(root string) []byte {
	var b bytes.Buffer
	og := p.OG
	image := og.Image && p.Logo != ""
	if og.Title != "" || og.Description != "" || image {
		meta := func(prop, content string) {
			if content != "" {
				b.WriteString(`<meta property="` + prop + `" content="` + html.EscapeString(content) + `">`)
			}
		}
		title := og.Title
		if title == "" {
			title = p.Brand
		}
		meta("og:type", "website")
		meta("og:site_name", p.Brand)
		meta("og:title", title)
		meta("og:description", og.Description)
		if og.Description != "" {
			b.WriteString(`<meta name="description" content="` + html.EscapeString(og.Description) + `">`)
		}
		if image {
			meta("og:image", root+"/"+p.Logo)
		}
		b.WriteString(`<meta name="twitter:card" content="summary">`)
	}
	// json.Marshal writes <, > and & as \u escapes: nothing in it can close the script.
	data, _ := json.Marshal(p)
	b.WriteString(`<script type="application/json" id="mikan-page">`)
	b.Write(data)
	b.WriteString(`</script>`)
	if css := CleanCSS(p.css); css != "" {
		b.WriteString(`<style id="mikan-css">`)
		b.WriteString(css)
		b.WriteString(`</style>`)
	}
	return b.Bytes()
}

// DocView is an instruction with its text, as the page opens it.
type DocView struct {
	DocItem
	Body string `json:"body"`
}

// Doc is a published instruction; ok is false when there is none by that id.
func (s *Service) Doc(ctx context.Context, id int64) (DocView, bool, error) {
	d, err := s.q.GetPublishedSubDoc(ctx, id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return DocView{}, false, nil
		}
		return DocView{}, false, err
	}
	return DocView{DocItem: DocItem{ID: d.ID, Title: d.Title, Emoji: d.Emoji, Platform: d.Platform}, Body: d.Body}, true, nil
}

// Image is an uploaded image with its bytes; ok is false when there is none.
func (s *Service) Image(ctx context.Context, name string) (db.SubAsset, bool, error) {
	a, err := s.q.GetSubAsset(ctx, name)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return a, false, nil
		}
		return a, false, err
	}
	return a, true, nil
}
