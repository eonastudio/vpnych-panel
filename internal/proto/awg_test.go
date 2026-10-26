package proto

import (
	"errors"
	"strings"
	"testing"
)

const awgTemplate = "type: amneziawg\nserver-key: YNqHwpcAmVj0lVzPGv5ZnQ8tUUZ0zUfvBQ1N9NV6zFI=\n" +
	"jc: 4\njmin: 50\njmax: 1000\ns1: 30\ns2: 40\nh1: 1001\nh2: 2002\nh3: 3003\nh4: 4004\n"

// Every slot is a peer with a key made from its secret and an address by its number; the
// client is mihomo's wireguard proxy with the same obfuscation and the server's public key.
func TestAmneziaWG(t *testing.T) {
	tpl, err := Parse(awgTemplate)
	if err != nil {
		t.Fatal(err)
	}
	l, err := Listener(tpl, "awg", "", "51820", slots, Cert{}, Options{})
	if err != nil {
		t.Fatal(err)
	}
	us, _ := l["users"].([]map[string]any)
	if len(us) != 2 || us[0]["ip"] != "10.64.0.3" || us[1]["ip"] != "10.64.0.4" || l["mtu"] != awgDefaultMTU || l["subnet"] != "10.64.0.0/10" {
		t.Fatalf("listener: %v", l)
	}
	if us[0]["public-key"] == us[1]["public-key"] {
		t.Fatal("two slots share a key")
	}
	if a := AWGServerAddr(tpl); a.String() != "10.64.0.1" {
		t.Fatalf("server address %s", a)
	}

	c, err := ClientConfig(tpl, ClientInput{Name: "AWG", Host: "vpn.example.com", Port: 51820, Slot: slots[0]})
	if err != nil {
		t.Fatal(err)
	}
	m := c.Mihomo
	pub, _ := AWGPublicKey(tpl.str("server-key"))
	if m["type"] != "wireguard" || m["public-key"] != pub || m["ip"] != "10.64.0.3" || m["server"] != "vpn.example.com" || m["port"] != 51820 || m["udp"] != true {
		t.Fatalf("client: %v", m)
	}
	// The client's key is the one whose public half the listener has.
	if mine, _ := AWGPublicKey(m["private-key"].(string)); mine != us[0]["public-key"] {
		t.Fatalf("client key %s does not match the peer %s", mine, us[0]["public-key"])
	}
	if o, _ := m["amnezia-wg-option"].(map[string]any); o["jc"] != 4 || o["s2"] != 40 || o["h4"] != 4004 {
		t.Fatalf("obfuscation: %v", m["amnezia-wg-option"])
	}
	if c.URI != "" {
		t.Fatalf("no share link format: %s", c.URI)
	}

	// A slot past the subnet's end has no address and no peer.
	small, _ := Parse(awgTemplate + "subnet: 10.9.9.0/24\n")
	if _, ok := awgSlotAddr(small, "s000252"); !ok {
		t.Fatal("s000252 fits a /24")
	}
	if _, ok := awgSlotAddr(small, "s000253"); ok {
		t.Fatal("s000253 would be the broadcast address")
	}
	if _, ok := awgSlotAddr(small, "validate"); ok {
		t.Fatal("a name that is no pool slot has no address")
	}
}

func TestAmneziaWGRefuses(t *testing.T) {
	for src, code := range map[string]string{
		strings.Replace(awgTemplate, "server-key: YNqHwpcAmVj0lVzPGv5ZnQ8tUUZ0zUfvBQ1N9NV6zFI=", "server-key: short", 1): "awg_key",
		strings.Replace(awgTemplate, "jmin: 50", "jmin: 1100", 1):                                                        "awg_params",
		strings.Replace(awgTemplate, "jmax: 1000", "jmax: 1400", 1):                                                      "awg_params",
		strings.Replace(awgTemplate, "s2: 40", "s2: 86", 1):                                                              "awg_params",
		strings.Replace(awgTemplate, "h2: 2002", "h2: 1001", 1):                                                          "awg_params",
		strings.Replace(awgTemplate, "h1: 1001", "h1: 3", 1):                                                             "awg_params",
		awgTemplate + "mtu: 9000\n":                                                                                      "awg_mtu",
		awgTemplate + "subnet: 10.0.0.0/30\n":                                                                            "awg_subnet",
		awgTemplate + "subnet: fd00::/64\n":                                                                              "awg_subnet",
	} {
		tpl, err := Parse(src)
		if err == nil {
			err = Validate(tpl, Options{})
		}
		var pe *Error
		if !errors.As(err, &pe) || pe.Code != code {
			t.Errorf("%q: %v, want %s", src, err, code)
		}
	}
}

// The server key is a secret: a reader without the right sees Hidden in its place.
func TestAmneziaWGRedact(t *testing.T) {
	red := Redact(awgTemplate)
	if strings.Contains(red, "YNqHwpcAmVj0lVzPGv5ZnQ8tUUZ0zUfvBQ1N9NV6zFI=") || !strings.Contains(red, Hidden) {
		t.Fatalf("redacted:\n%s", red)
	}
	if back := Restore(red, awgTemplate); !strings.Contains(back, "YNqHwpcAmVj0lVzPGv5ZnQ8tUUZ0zUfvBQ1N9NV6zFI=") {
		t.Fatalf("restored:\n%s", back)
	}
}
