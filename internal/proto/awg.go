package proto

import (
	"crypto/ecdh"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"net/netip"
)

// AmneziaWG is WireGuard whose handshake hides from DPI: junk packets before it (jc, jmin,
// jmax), random padding of the handshake messages (s1, s2) and own message types instead of
// WireGuard's 1-4 (h1-h4). The node runs it in the Citrus core's userspace stack (node/awg);
// clients are mihomo's "wireguard" proxy with amnezia-wg-option.
//
// Every slot is a peer: its key is made from the slot's secret (awgClientKey) and its address
// from the slot's number in the subnet, so neither is stored and a new user needs no
// restart. The server's own key is the template's server-key; the panel makes it.

const (
	awgDefaultMTU    = 1420
	awgDefaultSubnet = "10.64.0.0/10"
	// awgMaxJunk keeps a junk packet within one segment of the device (MaxSegmentSize).
	awgMaxJunk = 1280
	// awgMaxPad: the padded handshake still fits a 1280-byte path.
	awgMaxPad = 1132
)

// AWGParams are the obfuscation settings both ends must share.
var AWGParams = []string{"jc", "jmin", "jmax", "s1", "s2", "h1", "h2", "h3", "h4"}

func validateAWG(t Template) error {
	if _, err := awgKey(t.str("server-key")); err != nil {
		return fail("awg_key", "server-key")
	}
	n := map[string]int{}
	for _, k := range AWGParams {
		v, ok := toInt(t[k])
		if !ok {
			return fail("awg_params", k)
		}
		n[k] = v
	}
	switch {
	case n["jc"] < 0 || n["jc"] > 128:
		return fail("awg_params", "jc")
	case n["jmin"] < 0 || n["jmin"] > n["jmax"]:
		return fail("awg_params", "jmin")
	case n["jmax"] > awgMaxJunk:
		return fail("awg_params", "jmax")
	case n["s1"] < 0 || n["s1"] > awgMaxPad:
		return fail("awg_params", "s1")
	case n["s2"] < 0 || n["s2"] > awgMaxPad, n["s1"]+56 == n["s2"]:
		// With s1+56 = s2 the padded init and response are one size: told apart by nothing.
		return fail("awg_params", "s2")
	}
	seen := map[int]bool{}
	for _, k := range []string{"h1", "h2", "h3", "h4"} {
		if h := n[k]; h < 5 || h > 1<<32-1 || seen[h] {
			return fail("awg_params", k)
		} else {
			seen[h] = true
		}
	}
	if v, set := t["mtu"]; set {
		if m, ok := toInt(v); !ok || m < 1280 || m > 1500 {
			return fail("awg_mtu", "mtu")
		}
	}
	if _, set := t["subnet"]; set {
		if _, err := awgSubnet(t); err != nil {
			return fail("awg_subnet", "subnet")
		}
	}
	return nil
}

// awgKey reads a WireGuard key: 32 bytes in standard base64.
func awgKey(s string) ([]byte, error) {
	k, err := base64.StdEncoding.DecodeString(s)
	if err != nil || len(k) != 32 {
		return nil, fmt.Errorf("not a WireGuard key")
	}
	return k, nil
}

// AWGPublicKey is the public key of a private one, both in standard base64.
func AWGPublicKey(private string) (string, error) {
	k, err := awgKey(private)
	if err != nil {
		return "", err
	}
	p, err := ecdh.X25519().NewPrivateKey(k)
	if err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(p.PublicKey().Bytes()), nil
}

// AWGClampKey makes 32 random bytes a WireGuard private key.
func AWGClampKey(k []byte) string {
	k[0] &= 248
	k[31] = k[31]&127 | 64
	return base64.StdEncoding.EncodeToString(k)
}

// awgClientKey is a slot's private key, made from its secret.
func awgClientKey(secret string) string {
	sum := sha256.Sum256([]byte("mikan/awg/" + secret))
	return AWGClampKey(sum[:])
}

// awgSubnet is the clients' network: an IPv4 prefix of at least 256 addresses.
func awgSubnet(t Template) (netip.Prefix, error) {
	s := t.str("subnet")
	if s == "" {
		s = awgDefaultSubnet
	}
	p, err := netip.ParsePrefix(s)
	if err != nil || !p.Addr().Is4() || p.Bits() < 8 || p.Bits() > 24 {
		return netip.Prefix{}, fmt.Errorf("bad subnet %q", s)
	}
	return p.Masked(), nil
}

// awgAddr is the n-th address of p, false past its end.
func awgAddr(p netip.Prefix, n int) (netip.Addr, bool) {
	if n < 0 || n >= 1<<(32-p.Bits()) {
		return netip.Addr{}, false
	}
	b := p.Addr().As4()
	v := uint32(b[0])<<24 | uint32(b[1])<<16 | uint32(b[2])<<8 | uint32(b[3])
	v += uint32(n)
	return netip.AddrFrom4([4]byte{byte(v >> 24), byte(v >> 16), byte(v >> 8), byte(v)}), true
}

// AWGServerAddr is the node's address in the clients' network: the subnet's first host.
func AWGServerAddr(t Template) netip.Addr {
	p, err := awgSubnet(t)
	if err != nil {
		return netip.Addr{}
	}
	a, _ := awgAddr(p, 1)
	return a
}

// awgSlotAddr is a slot's address: its number past the server's. A slot whose name is not
// a pool slot's (s000123) has none, nor one past the subnet's end.
func awgSlotAddr(t Template, slot string) (netip.Addr, bool) {
	var n int
	if _, err := fmt.Sscanf(slot, "s%06d", &n); err != nil || fmt.Sprintf("s%06d", n) != slot {
		return netip.Addr{}, false
	}
	p, err := awgSubnet(t)
	if err != nil {
		return netip.Addr{}, false
	}
	a, ok := awgAddr(p, n+2)
	if !ok || a == lastAddr(p) {
		return netip.Addr{}, false
	}
	return a, true
}

func lastAddr(p netip.Prefix) netip.Addr {
	a, _ := awgAddr(p, 1<<(32-p.Bits())-1)
	return a
}

func awgMTU(t Template) int {
	if m, ok := toInt(t["mtu"]); ok && m > 0 {
		return m
	}
	return awgDefaultMTU
}

// awgUsers are the listener's peers: each slot's public key and address.
func awgUsers(t Template, slots []Slot) []map[string]any {
	out := make([]map[string]any, 0, len(slots))
	for _, s := range slots {
		ip, ok := awgSlotAddr(t, s.Name)
		if !ok {
			continue
		}
		pub, err := AWGPublicKey(awgClientKey(s.Secret))
		if err != nil {
			continue
		}
		out = append(out, map[string]any{"name": s.Name, "public-key": pub, "ip": ip.String()})
	}
	return out
}

// awgListener fills in what the node decides: the MTU and subnet the template leaves out.
func awgListener(t Template, l map[string]any) {
	l["mtu"] = awgMTU(t)
	p, _ := awgSubnet(t)
	l["subnet"] = p.String()
}

// awgClient is mihomo's wireguard proxy of the slot.
func (c *clientBuilder) awgClient() (Client, error) {
	ip, ok := awgSlotAddr(c.t, c.in.Slot.Name)
	if !ok {
		return Client{}, fail("awg_subnet", "subnet")
	}
	pub, err := AWGPublicKey(c.t.str("server-key"))
	if err != nil {
		return Client{}, fail("awg_key", "server-key")
	}
	opt := map[string]any{}
	for _, k := range AWGParams {
		opt[k], _ = toInt(c.t[k])
	}
	c.y["type"], c.y["private-key"], c.y["public-key"] = "wireguard", awgClientKey(c.in.Slot.Secret), pub
	c.y["ip"], c.y["mtu"], c.y["udp"] = ip.String(), awgMTU(c.t), true
	c.y["allowed-ips"] = []string{"0.0.0.0/0"}
	c.y["amnezia-wg-option"] = opt
	return Client{Mihomo: c.y}, nil
}
