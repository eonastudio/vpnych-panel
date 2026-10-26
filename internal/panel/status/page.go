package status

import (
	"fmt"
	"html/template"
	"io"
	"math"
	"strings"
	"time"
)

// Words are the page's texts in one language.
type words struct {
	Lang, Title, AllUp, Partial, AllDown, Unknown         string
	StateUp, StateDown, StateUnknown                      string
	Uptime, NoData, DaysAgo, Today, Updated, None, DownAt string
	Months                                                [12]string
}

var texts = map[string]words{
	"ru": {
		Lang: "ru", Title: "Статус серверов",
		AllUp: "Все серверы работают", Partial: "Часть серверов недоступна", AllDown: "Серверы недоступны", Unknown: "Данных пока нет",
		StateUp: "Работает", StateDown: "Недоступен", StateUnknown: "Нет данных",
		Uptime: "%s аптайм", NoData: "нет данных", DaysAgo: "%d дн. назад", Today: "Сегодня",
		Updated: "Обновлено %s UTC", None: "Пока нет серверов для показа.", DownAt: "не отвечает с %s UTC",
		Months: [12]string{"янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"},
	},
	"en": {
		Lang: "en", Title: "Server status",
		AllUp: "All servers operational", Partial: "Some servers are down", AllDown: "Servers are down", Unknown: "No data yet",
		StateUp: "Operational", StateDown: "Down", StateUnknown: "No data",
		Uptime: "%s uptime", NoData: "no data", DaysAgo: "%d days ago", Today: "Today",
		Updated: "Updated %s UTC", None: "No servers to show yet.", DownAt: "down since %s UTC",
		Months: [12]string{"Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"},
	},
}

// Lang picks the page's language: Russian for a browser that asks for it first, the panel's
// language for one that says nothing, English otherwise.
func Lang(acceptLanguage, panel string) string {
	a := strings.ToLower(strings.TrimSpace(acceptLanguage))
	switch {
	case strings.HasPrefix(a, "ru"), strings.HasPrefix(a, "uk"), strings.HasPrefix(a, "be"), strings.HasPrefix(a, "kk"):
		return "ru"
	case a == "" && panel == "ru":
		return "ru"
	}
	return "en"
}

type bar struct {
	Tone, Tip string
}

type nodeView struct {
	Name, State, StateText, Uptime, Note string
	Bars                                 []bar
}

type pageData struct {
	W                    words
	Title, Brand         string
	Overall, OverallText string
	Nodes                []nodeView
	First, Updated       string
}

func percent(v float64) string {
	// Rounded down: 99.996% is not "100%" while a check failed.
	p := math.Floor(v*10000+1e-9) / 100
	s := fmt.Sprintf("%.2f", p)
	s = strings.TrimRight(strings.TrimRight(s, "0"), ".")
	return s + "%"
}

func (w words) date(unix int64) string {
	t := time.Unix(unix, 0).UTC()
	if w.Lang == "ru" {
		return fmt.Sprintf("%d %s", t.Day(), w.Months[t.Month()-1])
	}
	return fmt.Sprintf("%s %d", w.Months[t.Month()-1], t.Day())
}

func (w words) moment(unix int64) string {
	return w.date(unix) + ", " + time.Unix(unix, 0).UTC().Format("15:04")
}

func tone(d PageDay) string {
	if d.Checks == 0 {
		return "none"
	}
	switch v := float64(d.OK) / float64(d.Checks); {
	case v >= 0.995:
		return "ok"
	case v >= 0.95:
		return "warn"
	}
	return "bad"
}

// Render writes the page of r in lang; title is the admin's, brand the panel's.
func Render(out io.Writer, r PageReport, title, brand, lang string) error {
	w, ok := texts[lang]
	if !ok {
		w = texts["en"]
	}
	if title == "" {
		title = w.Title
	}
	d := pageData{W: w, Title: title, Brand: brand, Overall: r.Overall(), Updated: fmt.Sprintf(w.Updated, w.moment(r.Updated))}
	switch d.Overall {
	case Up:
		d.OverallText = w.AllUp
	case Down:
		d.OverallText = w.AllDown
	case Unknown:
		d.OverallText = w.Unknown
	default:
		d.OverallText = w.Partial
	}
	d.First = fmt.Sprintf(w.DaysAgo, r.Days)
	for _, n := range r.Nodes {
		p := nodeView{Name: n.Name, State: n.State}
		switch n.State {
		case Up:
			p.StateText = w.StateUp
		case Down:
			p.StateText = w.StateDown
			if n.Since > 0 {
				p.Note = fmt.Sprintf(w.DownAt, w.moment(n.Since))
			}
		default:
			p.StateText = w.StateUnknown
		}
		if n.Uptime >= 0 {
			p.Uptime = fmt.Sprintf(w.Uptime, percent(n.Uptime))
		}
		for _, day := range n.Days {
			tip := w.date(day.Day) + ": " + w.NoData
			if day.Checks > 0 {
				tip = w.date(day.Day) + ": " + percent(float64(day.OK)/float64(day.Checks))
			}
			p.Bars = append(p.Bars, bar{Tone: tone(day), Tip: tip})
		}
		d.Nodes = append(d.Nodes, p)
	}
	return page.Execute(out, d)
}

var page = template.Must(template.New("status").Parse(`<!doctype html>
<html lang="{{.W.Lang}}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<meta http-equiv="refresh" content="60">
<title>{{.Title}}{{if .Brand}} · {{.Brand}}{{end}}</title>
<style>
:root{--bg:#f6f7f9;--card:#fff;--ink:#14161a;--muted:#6b7280;--line:#e5e7eb;--ok:#22c55e;--warn:#f59e0b;--bad:#ef4444;--none:#d1d5db}
@media (prefers-color-scheme:dark){:root{--bg:#0e1013;--card:#171a1f;--ink:#eef0f3;--muted:#9aa1ac;--line:#262a31;--none:#353a43}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:760px;margin:0 auto;padding:40px 16px 56px}
header{margin-bottom:24px}
.brand{color:var(--muted);font-size:13px;letter-spacing:.04em;text-transform:uppercase}
h1{margin:4px 0 0;font-size:28px;line-height:1.2}
.overall{display:flex;align-items:center;gap:12px;padding:16px 20px;border-radius:16px;color:#fff;font-weight:600;margin-bottom:20px}
.overall.up{background:var(--ok)}.overall.partial{background:var(--warn)}.overall.down{background:var(--bad)}.overall.unknown{background:var(--muted)}
.dot{width:10px;height:10px;border-radius:50%;flex:none;background:var(--none)}
.overall .dot{background:#fff;box-shadow:0 0 0 4px rgba(255,255,255,.3)}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:6px 20px}
.node{padding:16px 0;border-top:1px solid var(--line)}.node:first-child{border-top:0}
.row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.name{font-weight:600;flex:1;min-width:0;overflow-wrap:anywhere}
.state{font-size:13px;font-weight:600}
.up .dot{background:var(--ok)}.down .dot{background:var(--bad)}
.up .state{color:var(--ok)}.down .state{color:var(--bad)}.unknown .state{color:var(--muted)}
.bars{display:flex;gap:2px;height:32px;margin:10px 0 6px}
.bars i{flex:1;min-width:2px;border-radius:3px;background:var(--none)}
.bars i.ok{background:var(--ok)}.bars i.warn{background:var(--warn)}.bars i.bad{background:var(--bad)}
.bars i:hover{opacity:.7}
.legend{display:flex;justify-content:space-between;gap:8px;color:var(--muted);font-size:12px}
.note{color:var(--bad);font-size:13px;margin-top:2px}
.empty{color:var(--muted);padding:16px 0;margin:0}
footer{color:var(--muted);font-size:12px;text-align:center;margin-top:20px}
@media (max-width:480px){h1{font-size:23px}.bars{height:28px;gap:1px}.bars i{border-radius:2px}}
</style>
</head>
<body>
<main>
<header>{{if .Brand}}<div class="brand">{{.Brand}}</div>{{end}}<h1>{{.Title}}</h1></header>
<div class="overall {{.Overall}}" role="status"><span class="dot"></span>{{.OverallText}}</div>
<section class="card">
{{range .Nodes}}<div class="node {{.State}}">
<div class="row"><span class="dot"></span><span class="name">{{.Name}}</span><span class="state">{{.StateText}}</span></div>
{{if .Note}}<div class="note">{{.Note}}</div>{{end}}
<div class="bars" role="img" aria-label="{{.Uptime}}">{{range .Bars}}<i class="{{.Tone}}" title="{{.Tip}}"></i>{{end}}</div>
<div class="legend"><span>{{$.First}}</span><span>{{.Uptime}}</span><span>{{$.W.Today}}</span></div>
</div>
{{else}}<p class="empty">{{.W.None}}</p>
{{end}}</section>
<footer>{{.Updated}}</footer>
</main>
</body>
</html>
`))
