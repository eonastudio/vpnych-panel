package awg

import (
	"context"
	"crypto/ecdh"
	"crypto/rand"
	"encoding/base64"
	"io"
	"net"
	"net/netip"
	"strconv"
	"sync"
	"testing"
	"time"

	"github.com/metacubex/mihomo/adapter"
	C "github.com/metacubex/mihomo/constant"
)

// tunnel echoes every TCP connection and keeps what came with it.
type tunnel struct {
	mu   sync.Mutex
	seen []C.Metadata
}

func (t *tunnel) HandleTCPConn(c net.Conn, m *C.Metadata) {
	t.mu.Lock()
	t.seen = append(t.seen, *m)
	t.mu.Unlock()
	defer c.Close()
	_, _ = io.Copy(c, c)
}

func (t *tunnel) HandleUDPPacket(C.UDPPacket, *C.Metadata) {}
func (t *tunnel) NatTable() C.NatTable                     { return nil }

func key(t *testing.T) (private, public string) {
	t.Helper()
	k, err := ecdh.X25519().GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	return base64.StdEncoding.EncodeToString(k.Bytes()), base64.StdEncoding.EncodeToString(k.PublicKey().Bytes())
}

func freePort(t *testing.T) int {
	t.Helper()
	c, err := net.ListenUDP("udp4", &net.UDPAddr{IP: net.IPv4(127, 0, 0, 1)})
	if err != nil {
		t.Fatal(err)
	}
	defer c.Close()
	return c.LocalAddr().(*net.UDPAddr).Port
}

func config(port int, serverKey string, users ...Peer) map[string]any {
	return map[string]any{
		"name": "awg", "type": "amneziawg", "listen": "0.0.0.0", "port": strconv.Itoa(port), "server-key": serverKey,
		"jc": 4, "jmin": 50, "jmax": 1000, "s1": 30, "s2": 40, "h1": 1001, "h2": 2002, "h3": 3003, "h4": 4004,
		"mtu": 1420, "subnet": "10.64.0.0/10", "users": users,
	}
}

func TestParseRefuses(t *testing.T) {
	sk, _ := key(t)
	_, pub := key(t)
	ok := config(51820, sk, Peer{Name: "s000001", PublicKey: pub, IP: "10.64.0.3"})
	if _, err := Parse(ok); err != nil {
		t.Fatal(err)
	}
	for name, change := range map[string]func(m map[string]any){
		"port":    func(m map[string]any) { m["port"] = "0" },
		"key":     func(m map[string]any) { m["server-key"] = "nope" },
		"same h":  func(m map[string]any) { m["h2"] = 1001 },
		"junk":    func(m map[string]any) { m["jmin"] = 2000 },
		"outside": func(m map[string]any) { m["users"] = []Peer{{Name: "s000001", PublicKey: pub, IP: "192.168.0.2"}} },
		"address twice": func(m map[string]any) {
			_, pub2 := key(t)
			m["users"] = []Peer{{Name: "a", PublicKey: pub, IP: "10.64.0.3"}, {Name: "b", PublicKey: pub2, IP: "10.64.0.3"}}
		},
	} {
		m := config(51820, sk)
		change(m)
		if _, err := Parse(m); err == nil {
			t.Errorf("%s: accepted", name)
		}
	}
}

// A client of mihomo's own AmneziaWG reaches the tunnel through the listener, as its slot
// and from its real address; once its peer is gone, it does not.
func TestClientConnects(t *testing.T) {
	serverKey, serverPub := key(t)
	clientKey, clientPub := key(t)
	port := freePort(t)
	c, err := Parse(config(port, serverKey, Peer{Name: "s000001", PublicKey: clientPub, IP: "10.64.0.3"}))
	if err != nil {
		t.Fatal(err)
	}
	tun := &tunnel{}
	l := New(c)
	if err := l.Listen(tun); err != nil {
		t.Fatal(err)
	}
	defer l.Close()

	proxy, err := adapter.ParseProxy(map[string]any{
		"name": "awg", "type": "wireguard", "server": "127.0.0.1", "port": port, "ip": "10.64.0.3", "mtu": 1420, "udp": true,
		"private-key": clientKey, "public-key": serverPub, "allowed-ips": []string{"0.0.0.0/0"},
		"amnezia-wg-option": map[string]any{"jc": 4, "jmin": 50, "jmax": 1000, "s1": 30, "s2": 40, "h1": 1001, "h2": 2002, "h3": 3003, "h4": 4004},
	})
	if err != nil {
		t.Fatal(err)
	}
	defer proxy.Close()
	dial := func(timeout time.Duration) (net.Conn, error) {
		ctx, cancel := context.WithTimeout(context.Background(), timeout)
		defer cancel()
		return proxy.DialContext(ctx, &C.Metadata{NetWork: C.TCP, DstIP: netip.MustParseAddr("192.0.2.7"), DstPort: 8080})
	}
	conn, err := dial(10 * time.Second)
	if err != nil {
		t.Fatal(err)
	}
	_ = conn.SetDeadline(time.Now().Add(10 * time.Second))
	if _, err := conn.Write([]byte("ping")); err != nil {
		t.Fatal(err)
	}
	buf := make([]byte, 4)
	if _, err := io.ReadFull(conn, buf); err != nil || string(buf) != "ping" {
		t.Fatalf("echo %q: %v", buf, err)
	}
	conn.Close()

	tun.mu.Lock()
	m := tun.seen[0]
	tun.mu.Unlock()
	if m.InUser != "s000001" || m.InName != "awg" || m.SrcIP != netip.MustParseAddr("127.0.0.1") || m.DstPort != 8080 || m.DstIP.String() != "192.0.2.7" {
		t.Fatalf("metadata %+v", m)
	}

	// The users alone change in place; without its peer the client gets nowhere.
	if !l.SameExceptUsers(inboundConfig{c}) {
		t.Fatal("the same listener differs")
	}
	if err := l.SetUsers(nil); err != nil {
		t.Fatal(err)
	}
	if len(l.InboundUsers()) != 0 || len(endpoints(l.dev)) != 0 {
		t.Fatalf("peers left: %v", l.InboundUsers())
	}
	if conn, err := dial(2 * time.Second); err == nil {
		conn.Close()
		t.Fatal("a removed peer still connects")
	}
	// Back again, it connects as before.
	if err := l.SetUsers([]C.InboundUser{{Name: "s000001", Secret: clientPub + "@10.64.0.3"}}); err != nil {
		t.Fatal(err)
	}
	if got := l.Users(); len(got) != 1 || got[0].Secret != clientPub+"@10.64.0.3" {
		t.Fatalf("users %v", got)
	}
}
