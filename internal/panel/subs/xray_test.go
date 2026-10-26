package subs

import (
	"encoding/json"
	"testing"
)

// The first config is the auto-select group under its own name: every server Xray takes
// behind a leastPing balancer the observatory feeds; then a config per server.
func TestXrayProfile(t *testing.T) {
	lists(t)
	prof := twoNodes(t)
	cfg := Config{Nodes: prof.Nodes, Groups: Groups{Auto: "⚡ Быстрый"},
		Rules: []string{"DOMAIN-SUFFIX,sber.ru,DIRECT", "GEOSITE,category-ads-all,REJECT"}}
	body, ps, err := xrayProfile(prof, cfg)
	if err != nil {
		t.Fatal(err)
	}
	var configs []map[string]any
	if err := json.Unmarshal(body, &configs); err != nil {
		t.Fatal(err)
	}
	if len(configs) != len(ps)+1 || len(ps) == 0 {
		t.Fatalf("%d configs for %d servers", len(configs), len(ps))
	}
	auto := configs[0]
	if auto["remarks"] != "⚡ Быстрый" || auto["observatory"] == nil {
		t.Fatalf("group: %v", auto["remarks"])
	}
	routing := auto["routing"].(map[string]any)
	b := routing["balancers"].([]any)[0].(map[string]any)
	if b["strategy"].(map[string]any)["type"] != "leastPing" || b["fallbackTag"] != "proxy-1" {
		t.Fatalf("balancer: %v", b)
	}
	outs := auto["outbounds"].([]any)
	if len(outs) != len(ps)+2 {
		t.Fatalf("outbounds: %d", len(outs))
	}
	for _, o := range outs {
		switch p := o.(map[string]any)["protocol"]; p {
		case "vless", "trojan", "shadowsocks", "freedom", "blackhole":
		default:
			t.Errorf("Xray has no %v", p)
		}
	}
	rules := routing["rules"].([]any)
	first, last := rules[0].(map[string]any), rules[len(rules)-1].(map[string]any)
	if first["outboundTag"] != "block" || last["balancerTag"] != "auto" || last["network"] != "tcp,udp" {
		t.Fatalf("rules: %v … %v", first, last)
	}
	for i, p := range ps {
		c := configs[i+1]
		if c["remarks"] != p.name || c["observatory"] != nil {
			t.Fatalf("server %d: %v", i, c["remarks"])
		}
		r := c["routing"].(map[string]any)["rules"].([]any)
		if r[len(r)-1].(map[string]any)["outboundTag"] != "proxy" {
			t.Fatalf("server %d goes to %v", i, r[len(r)-1])
		}
	}
	// REALITY and XHTTP keep their settings.
	var reality, xhttp bool
	for _, o := range outs {
		s, _ := o.(map[string]any)["streamSettings"].(map[string]any)
		if r, ok := s["realitySettings"].(map[string]any); ok && r["publicKey"] != "" {
			reality = true
		}
		if s["network"] == "xhttp" && s["xhttpSettings"] != nil {
			xhttp = true
		}
	}
	if !reality || !xhttp {
		t.Fatalf("reality %v, xhttp %v", reality, xhttp)
	}
}

func TestXrayOutbound(t *testing.T) {
	vless := xrayOutbound("vless://11111111-2222-3333-4444-555555555555@vpn.example.com:443?type=ws&path=%2Fws&host=cdn.example.com&security=tls&sni=vpn.example.com&fp=chrome&alpn=h2%2Chttp%2F1.1&encryption=none#DE")
	s := vless["streamSettings"].(map[string]any)
	tls := s["tlsSettings"].(map[string]any)
	ws := s["wsSettings"].(map[string]any)
	if s["network"] != "ws" || ws["path"] != "/ws" || ws["host"] != "cdn.example.com" || tls["serverName"] != "vpn.example.com" || len(tls["alpn"].([]string)) != 2 {
		t.Fatalf("vless: %v", vless)
	}
	for link, want := range map[string]string{
		"ss://Y2hhY2hhMjAtaWV0Zi1wb2x5MTMwNTpzZWNyZXQ=@1.2.3.4:8388#SS": "chacha20-ietf-poly1305/secret",
		"ss://2022-blake3-aes-128-gcm:a%2Bb%3D@1.2.3.4:8388#SS":         "2022-blake3-aes-128-gcm/a+b=",
	} {
		o := xrayOutbound(link)
		if o == nil {
			t.Fatalf("%s: nil", link)
		}
		srv := o["settings"].(map[string]any)["servers"].([]any)[0].(map[string]any)
		if got := srv["method"].(string) + "/" + srv["password"].(string); got != want {
			t.Errorf("%s: %s, want %s", link, got, want)
		}
	}
	for _, link := range []string{"hysteria2://x@1.2.3.4:443#H", "tuic://a:b@1.2.3.4:443#T", "vless://x@host#noport"} {
		if xrayOutbound(link) != nil {
			t.Errorf("%s: taken", link)
		}
	}
}

func TestXrayFormat(t *testing.T) {
	if Format("Happ/3.6.0", "", "xray") != "xray" || Format("", "", "json") != "xray" || Format("Happ/3.6.0", "", "") != "uri" {
		t.Fatal("format")
	}
	for ua, want := range map[string]bool{"Happ/3.6.0/Android": true, "v2RayTun/5.1": true, "v2rayNG/1.10.5": true, "INCY/1.0": true, "v2rayN/7.0": false, "clash-verge/v2": false} {
		if XrayJSONApp(ua) != want {
			t.Errorf("%s: %v", ua, !want)
		}
	}
}
