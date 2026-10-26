package subs

import (
	"encoding/base64"
	"encoding/json"
	"net/url"
	"slices"
	"strconv"
	"strings"
)

// The Xray JSON subscription (settings.KeyXrayJSON, ?format=xray): a JSON array of whole
// Xray configs, which Happ, v2RayTun, v2rayNG and INCY list as servers. The first is the
// auto-select group under the group's own name: every server behind a leastPing balancer,
// so the app keeps to the fastest one that answers, as Clash apps do with url-test. One
// config per server follows. The configs carry their own routing, made of the profile's
// rules as Happ's routing profile is: the app's own routing does not apply to them.

// xrayProbe is what the observatory fetches through every server, as url-test does.
const xrayProbe = "https://www.gstatic.com/generate_204"

// xrayTagPrefix starts the tags of the servers in the group: the observatory and the
// balancer pick outbounds by tag prefix.
const xrayTagPrefix = "proxy-"

// XrayJSONApp tells the apps that take a JSON array of Xray configs as a subscription.
func XrayJSONApp(ua string) bool {
	ua = strings.ToLower(ua)
	return IsHapp(ua) || IsINCY(ua) || strings.Contains(ua, "v2raytun") || strings.Contains(ua, "v2rayng")
}

// xrayProfile is the Xray JSON subscription of prof: the group named auto, then the
// servers whose share links Xray takes; ErrNoProxies without any.
func xrayProfile(prof Profile, cfg Config) ([]byte, []proxy, error) {
	_, ps, err := uris(prof)
	if err != nil {
		return nil, nil, err
	}
	lists := happListsOf(profileRules(cfg))
	var outs []map[string]any
	var in []proxy
	for _, p := range ps {
		if o := xrayOutbound(p.uri); o != nil {
			outs = append(outs, o)
			in = append(in, p)
		}
	}
	if len(outs) == 0 {
		return nil, nil, ErrNoProxies
	}
	configs := make([]map[string]any, 0, len(outs)+1)
	// The group: the servers tagged by number, the balancer over them.
	group := make([]any, 0, len(outs)+2)
	for i, o := range outs {
		group = append(group, withTag(o, xrayTagPrefix+strconv.Itoa(i+1)))
	}
	group = append(group, xrayDirect(), xrayBlock())
	balancer := map[string]any{"balancerTag": "auto"}
	auto := xrayConfig(cfg.Groups.WithDefaults(cfg.Lang).Auto, group, lists, balancer)
	auto["observatory"] = map[string]any{
		"subjectSelector": []string{xrayTagPrefix}, "probeUrl": xrayProbe, "probeInterval": "5m", "enableConcurrency": true,
	}
	routing := auto["routing"].(map[string]any)
	routing["balancers"] = []any{map[string]any{
		"tag": "auto", "selector": []string{xrayTagPrefix}, "strategy": map[string]any{"type": "leastPing"},
		// Until the first probe answers, and when none does, the first server.
		"fallbackTag": xrayTagPrefix + "1",
	}}
	configs = append(configs, auto)
	for i, o := range outs {
		configs = append(configs, xrayConfig(in[i].name, []any{withTag(o, "proxy"), xrayDirect(), xrayBlock()}, lists, map[string]any{"outboundTag": "proxy"}))
	}
	body, err := json.MarshalIndent(configs, "", "  ")
	return body, in, err
}

// xrayConfig is one whole config: local inbounds for the app, outbounds, DNS and the
// routing of lists, where the proxied goes to via (an outbound or the balancer).
func xrayConfig(remarks string, outbounds []any, lists happProfile, via map[string]any) map[string]any {
	rule := func(key string, values []string, to map[string]any) []any {
		if len(values) == 0 {
			return nil
		}
		r := map[string]any{"type": "field", key: values}
		for k, v := range to {
			r[k] = v
		}
		return []any{r}
	}
	direct, block := map[string]any{"outboundTag": "direct"}, map[string]any{"outboundTag": "block"}
	var rules []any
	// Happ's order: the blocked and the proxied ahead of the direct.
	rules = append(rules, rule("domain", lists.BlockSites, block)...)
	rules = append(rules, rule("ip", lists.BlockIP, block)...)
	rules = append(rules, rule("domain", lists.ProxySites, via)...)
	rules = append(rules, rule("ip", lists.ProxyIP, via)...)
	rules = append(rules, rule("domain", lists.DirectSites, direct)...)
	directIP := lists.DirectIP
	if !slices.Contains(directIP, "geoip:private") {
		directIP = append([]string{"geoip:private"}, directIP...)
	}
	rules = append(rules, rule("ip", directIP, direct)...)
	last := via
	if lists.GlobalProxy == "false" {
		last = direct
	}
	final := map[string]any{"type": "field", "network": "tcp,udp"}
	for k, v := range last {
		final[k] = v
	}
	rules = append(rules, final)
	return map[string]any{
		"remarks": remarks,
		"log":     map[string]any{"loglevel": "warning"},
		"dns":     map[string]any{"servers": []string{"1.1.1.1", "8.8.8.8"}},
		"inbounds": []any{
			map[string]any{"tag": "socks", "listen": "127.0.0.1", "port": 10808, "protocol": "socks",
				"settings": map[string]any{"auth": "noauth", "udp": true},
				"sniffing": map[string]any{"enabled": true, "destOverride": []string{"http", "tls", "quic"}, "routeOnly": true}},
			map[string]any{"tag": "http", "listen": "127.0.0.1", "port": 10809, "protocol": "http",
				"sniffing": map[string]any{"enabled": true, "destOverride": []string{"http", "tls"}, "routeOnly": true}},
		},
		"outbounds": outbounds,
		"routing":   map[string]any{"domainStrategy": "IPIfNonMatch", "rules": rules},
	}
}

func xrayDirect() map[string]any { return map[string]any{"tag": "direct", "protocol": "freedom"} }
func xrayBlock() map[string]any  { return map[string]any{"tag": "block", "protocol": "blackhole"} }

// withTag is a copy of the outbound o under tag: the group and the server's own config
// share the map otherwise.
func withTag(o map[string]any, tag string) map[string]any {
	c := make(map[string]any, len(o)+1)
	for k, v := range o {
		c[k] = v
	}
	c["tag"] = tag
	return c
}

// xrayOutbound is the Xray outbound of a vless://, trojan:// or ss:// share link, nil for
// any other: the panel's links carry Xray's own parameters, so they map one to one.
func xrayOutbound(link string) map[string]any {
	u, err := url.Parse(link)
	if err != nil || u.Hostname() == "" {
		return nil
	}
	port, err := strconv.Atoi(u.Port())
	if err != nil || port <= 0 {
		return nil
	}
	host, q := u.Hostname(), u.Query()
	switch u.Scheme {
	case "vless":
		user := map[string]any{"id": u.User.Username(), "encryption": or(q.Get("encryption"), "none")}
		if f := q.Get("flow"); f != "" {
			user["flow"] = f
		}
		return map[string]any{"protocol": "vless", "streamSettings": xrayStream(q),
			"settings": map[string]any{"vnext": []any{map[string]any{"address": host, "port": port, "users": []any{user}}}}}
	case "trojan":
		return map[string]any{"protocol": "trojan", "streamSettings": xrayStream(q),
			"settings": map[string]any{"servers": []any{map[string]any{"address": host, "port": port, "password": u.User.Username()}}}}
	case "ss":
		method, password, ok := ssUser(u.User)
		if !ok {
			return nil
		}
		return map[string]any{"protocol": "shadowsocks",
			"settings": map[string]any{"servers": []any{map[string]any{"address": host, "port": port, "method": method, "password": password}}}}
	}
	return nil
}

// ssUser is the method and password of an ss:// link: method:password as it is, or the
// base64 of it (SIP002).
func ssUser(u *url.Userinfo) (method, password string, ok bool) {
	if u == nil {
		return "", "", false
	}
	if p, set := u.Password(); set {
		return u.Username(), p, u.Username() != ""
	}
	s := u.Username()
	for _, enc := range []*base64.Encoding{base64.StdEncoding, base64.RawStdEncoding, base64.URLEncoding, base64.RawURLEncoding} {
		if b, err := enc.DecodeString(s); err == nil {
			s = string(b)
			break
		}
	}
	method, password, ok = strings.Cut(s, ":")
	return method, password, ok && method != ""
}

// xrayStream is the streamSettings of a share link's query (XTLS/Xray-core#716).
func xrayStream(q url.Values) map[string]any {
	network := or(q.Get("type"), "tcp")
	s := map[string]any{"network": network}
	switch network {
	case "ws":
		ws := map[string]any{"path": or(q.Get("path"), "/")}
		if h := q.Get("host"); h != "" {
			ws["host"] = h
		}
		s["wsSettings"] = ws
	case "grpc":
		s["grpcSettings"] = map[string]any{"serviceName": q.Get("serviceName"), "multiMode": q.Get("mode") == "multi"}
	case "xhttp":
		x := map[string]any{"path": or(q.Get("path"), "/")}
		for _, k := range []string{"host", "mode"} {
			if v := q.Get(k); v != "" {
				x[k] = v
			}
		}
		var extra map[string]any
		if json.Unmarshal([]byte(q.Get("extra")), &extra) == nil && len(extra) > 0 {
			x["extra"] = extra
		}
		s["xhttpSettings"] = x
	}
	sni, fp := q.Get("sni"), q.Get("fp")
	switch security := q.Get("security"); security {
	case "reality":
		r := map[string]any{"serverName": sni, "fingerprint": or(fp, "chrome"), "publicKey": q.Get("pbk"), "shortId": q.Get("sid")}
		if v := q.Get("spx"); v != "" {
			r["spiderX"] = v
		}
		s["security"], s["realitySettings"] = "reality", r
	case "tls":
		t := map[string]any{}
		if sni != "" {
			t["serverName"] = sni
		}
		if fp != "" {
			t["fingerprint"] = fp
		}
		if a := q.Get("alpn"); a != "" {
			t["alpn"] = strings.Split(a, ",")
		}
		if v := q.Get("pcs"); v != "" {
			t["pinnedPeerCertSha256"] = v
		}
		if q.Get("allowInsecure") == "1" || q.Get("insecure") == "1" {
			t["allowInsecure"] = true
		}
		s["security"], s["tlsSettings"] = "tls", t
	}
	return s
}

func or(s, def string) string {
	if s == "" {
		return def
	}
	return s
}
