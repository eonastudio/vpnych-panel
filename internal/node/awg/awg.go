// Package awg is the node's AmneziaWG inbound. The core has no WireGuard listener, so the
// node runs one itself as a core listener: an AmneziaWG device (the core's own amneziawg-go)
// over a userspace IP stack (mipstack), whose TCP connections and UDP flows go to the core's
// tunnel like those of any other inbound, each with the user of the peer that sent it.
//
// The peers are the slots: proto renders each one's public key and address, and a change of
// the slots alone is applied to the running device (SetUsers), so nobody else reconnects.
package awg

import (
	"context"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/netip"
	"os"
	"reflect"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	awgdev "github.com/metacubex/amneziawg-go/device_v1"
	"github.com/metacubex/mihomo/adapter/inbound"
	C "github.com/metacubex/mihomo/constant"
	"github.com/metacubex/mihomo/transport/socks5"
	"github.com/metacubex/mipstack"
	"github.com/metacubex/wireguard-go/conn"
	wgdevice "github.com/metacubex/wireguard-go/device"
	"github.com/metacubex/wireguard-go/tun"
)

// ConfigKey is where the node's config carries these listeners: the core's own parser does
// not know the type, so they are not in "listeners" and the node adds them after parsing.
const ConfigKey = "mikan-amneziawg"

// udpIdle closes a UDP flow nobody used this long.
const udpIdle = 2 * time.Minute

// Peer is one slot: its public key and address in the clients' network.
type Peer struct {
	Name      string `json:"name"`
	PublicKey string `json:"public-key"`
	IP        string `json:"ip"`
}

// Config is the listener as proto renders it.
type Config struct {
	Name      string `json:"name"`
	Listen    string `json:"listen"`
	Port      string `json:"port"`
	ServerKey string `json:"server-key"`
	Jc        int    `json:"jc"`
	Jmin      int    `json:"jmin"`
	Jmax      int    `json:"jmax"`
	S1        int    `json:"s1"`
	S2        int    `json:"s2"`
	H1        uint32 `json:"h1"`
	H2        uint32 `json:"h2"`
	H3        uint32 `json:"h3"`
	H4        uint32 `json:"h4"`
	MTU       int    `json:"mtu"`
	Subnet    string `json:"subnet"`
	Users     []Peer `json:"users"`
}

// Parse reads and checks a listener of proto.Listener.
func Parse(l map[string]any) (*Config, error) {
	b, err := json.Marshal(l)
	if err != nil {
		return nil, err
	}
	var c Config
	if err := json.Unmarshal(b, &c); err != nil {
		return nil, fmt.Errorf("amneziawg: %w", err)
	}
	if p, err := strconv.Atoi(c.Port); err != nil || p < 1 || p > 65535 {
		return nil, fmt.Errorf("amneziawg: bad port %q", c.Port)
	}
	if _, err := hexKey(c.ServerKey); err != nil {
		return nil, fmt.Errorf("amneziawg: server-key: %w", err)
	}
	if c.MTU < 1280 || c.MTU > 1500 {
		return nil, fmt.Errorf("amneziawg: bad mtu %d", c.MTU)
	}
	subnet, err := netip.ParsePrefix(c.Subnet)
	if err != nil || !subnet.Addr().Is4() {
		return nil, fmt.Errorf("amneziawg: bad subnet %q", c.Subnet)
	}
	seen := map[string]bool{}
	for _, p := range c.Users {
		ip, err := netip.ParseAddr(p.IP)
		if err != nil || !subnet.Contains(ip) {
			return nil, fmt.Errorf("amneziawg: user %s: address %q outside %s", p.Name, p.IP, c.Subnet)
		}
		if _, err := hexKey(p.PublicKey); err != nil {
			return nil, fmt.Errorf("amneziawg: user %s: %w", p.Name, err)
		}
		if seen[p.IP] || seen[p.PublicKey] {
			return nil, fmt.Errorf("amneziawg: user %s: address or key taken", p.Name)
		}
		seen[p.IP], seen[p.PublicKey] = true, true
	}
	if err := c.check(); err != nil {
		return nil, fmt.Errorf("amneziawg: %w", err)
	}
	return &c, nil
}

// check is the device's own checks of the obfuscation: what it would refuse on Listen.
func (c *Config) check() error {
	hs := []uint32{c.H1, c.H2, c.H3, c.H4}
	for i, h := range hs {
		if h < 5 {
			return fmt.Errorf("h%d must be above 4", i+1)
		}
		for _, o := range hs[:i] {
			if o == h {
				return errors.New("h1-h4 must differ")
			}
		}
	}
	switch {
	case c.Jc < 0 || c.Jmin < 0 || c.Jmin > c.Jmax || c.Jmax >= awgdev.MaxSegmentSize:
		return errors.New("bad junk sizes")
	case c.S1 < 0 || c.S2 < 0 || c.S1+56 == c.S2:
		return errors.New("bad padding sizes")
	}
	return nil
}

func hexKey(s string) (string, error) {
	k, err := base64.StdEncoding.DecodeString(s)
	if err != nil || len(k) != 32 {
		return "", errors.New("not a WireGuard key")
	}
	return hex.EncodeToString(k), nil
}

// inboundConfig is Config as the core compares listeners (C.InboundConfig).
type inboundConfig struct{ c *Config }

func (i inboundConfig) Name() string { return i.c.Name }

func (i inboundConfig) Equal(o C.InboundConfig) bool {
	x, ok := o.(inboundConfig)
	return ok && reflect.DeepEqual(*i.c, *x.c)
}

// Listener is the running inbound (C.InboundListener, C.InboundUserUpdater).
type Listener struct {
	cfg *Config

	mu    sync.Mutex
	peers []Peer
	byIP  atomic.Pointer[map[netip.Addr]string] // address → slot name

	dev   *awgdev.Device
	stack *mipstack.Stack
	tcp   *mipstack.TCPForwarder
	udp   *mipstack.UDPForwarder

	// ends are the peers' endpoints (their real addresses) by public key, read from the
	// device: the node's checks (allowed countries, devices of a user) go by them.
	endsMu sync.Mutex
	ends   map[string]netip.AddrPort
	endsAt time.Time

	ctx    context.Context
	cancel context.CancelFunc
}

// New is the listener of c; it opens nothing until Listen.
func New(c *Config) *Listener {
	l := &Listener{cfg: c, peers: append([]Peer(nil), c.Users...)}
	l.setByIP(c.Users)
	return l
}

func (l *Listener) setByIP(peers []Peer) {
	m := make(map[netip.Addr]string, len(peers))
	for _, p := range peers {
		if ip, err := netip.ParseAddr(p.IP); err == nil {
			m[ip] = p.Name
		}
	}
	l.byIP.Store(&m)
}

func (l *Listener) Name() string       { return l.cfg.Name }
func (l *Listener) RawAddress() string { return net.JoinHostPort(l.cfg.Listen, l.cfg.Port) }
func (l *Listener) Address() string    { return l.RawAddress() }

func (l *Listener) Config() C.InboundConfig { return inboundConfig{l.cfg} }

// deviceConf is the device's settings in its UAPI form, without the peers.
func (l *Listener) deviceConf() string {
	c := l.cfg
	key, _ := hexKey(c.ServerKey)
	var b strings.Builder
	fmt.Fprintf(&b, "private_key=%s\nlisten_port=%s\n", key, c.Port)
	fmt.Fprintf(&b, "jc=%d\njmin=%d\njmax=%d\ns1=%d\ns2=%d\n", c.Jc, c.Jmin, c.Jmax, c.S1, c.S2)
	fmt.Fprintf(&b, "h1=%d\nh2=%d\nh3=%d\nh4=%d\n", c.H1, c.H2, c.H3, c.H4)
	return b.String()
}

// peerConf adds the peers of add and removes those of remove.
func peerConf(add, remove []Peer) string {
	var b strings.Builder
	for _, p := range remove {
		key, _ := hexKey(p.PublicKey)
		fmt.Fprintf(&b, "public_key=%s\nremove=true\n", key)
	}
	for _, p := range add {
		key, _ := hexKey(p.PublicKey)
		fmt.Fprintf(&b, "public_key=%s\nreplace_allowed_ips=true\nallowed_ip=%s/32\n", key, p.IP)
	}
	return b.String()
}

func (l *Listener) Listen(tunnel C.Tunnel) error {
	stack, err := mipstack.New(mipstack.Config{
		Promiscuous: true,
		MTU:         uint32(l.cfg.MTU),
		TCP: mipstack.TCPSocketDefaults{
			KeepAlive:       true,
			KeepAliveConfig: mipstack.KeepAliveConfig{Idle: 15 * time.Second, Interval: 15 * time.Second, Count: 9},
		},
		IP: mipstack.IPSocketDefaults{IPHeaderIncludedOnRead: true, IPHeaderIncludedOnWrite: true},
	})
	if err != nil {
		return err
	}
	if err := stack.Start(); err != nil {
		_ = stack.Close()
		return err
	}
	l.ctx, l.cancel = context.WithCancel(context.Background())
	l.stack = stack
	l.tcp, err = mipstack.NewTCPForwarder(stack, mipstack.TCPForwarderOptions{}, func(r *mipstack.TCPForwarderRequest) { l.handleTCP(tunnel, r) })
	if err == nil {
		l.udp, err = mipstack.NewUDPForwarder(stack, mipstack.UDPForwarderOptions{}, func(r *mipstack.UDPForwarderRequest) { l.handleUDP(tunnel, r) })
	}
	if err != nil {
		_ = l.Close()
		return err
	}
	dev := &stackDevice{Stack: stack, events: make(chan tun.Event, 1)}
	quiet := func(string, ...any) {}
	l.dev = awgdev.NewDevice(dev, conn.NewDefaultBind(), &wgdevice.Logger{Verbosef: quiet, Errorf: quiet}, 0)
	l.mu.Lock()
	err = l.dev.IpcSet(l.deviceConf() + "replace_peers=true\n" + peerConf(l.peers, nil))
	l.mu.Unlock()
	if err == nil {
		err = l.dev.Up()
	}
	if err == nil {
		err = dev.Start()
	}
	if err != nil {
		_ = l.Close()
		return fmt.Errorf("amneziawg: %w", err)
	}
	return nil
}

func (l *Listener) Close() error {
	if l.cancel != nil {
		l.cancel()
	}
	if l.tcp != nil {
		_ = l.tcp.Close()
	}
	if l.udp != nil {
		_ = l.udp.Close()
	}
	if l.dev != nil {
		l.dev.Close() // closes the stack too, as the device's tun
	} else if l.stack != nil {
		_ = l.stack.Close()
	}
	return nil
}

// user is the slot of a client address; false for an address no peer has.
func (l *Listener) user(src netip.Addr) (string, bool) {
	name, ok := (*l.byIP.Load())[src.Unmap()]
	return name, ok
}

// source is the real address of the slot's peer, its tunnel address when not known.
func (l *Listener) source(name string, tunnelAddr netip.AddrPort) netip.AddrPort {
	l.mu.Lock()
	key := ""
	for _, p := range l.peers {
		if p.Name == name {
			key = p.PublicKey
			break
		}
	}
	l.mu.Unlock()
	if key == "" || l.dev == nil {
		return tunnelAddr
	}
	l.endsMu.Lock()
	defer l.endsMu.Unlock()
	end, ok := l.ends[key]
	// A peer that has just come or roamed: the device is asked again, once a second at most.
	if !ok && time.Since(l.endsAt) >= time.Second || time.Since(l.endsAt) >= 30*time.Second {
		l.ends, l.endsAt = endpoints(l.dev), time.Now()
		end, ok = l.ends[key]
	}
	if !ok {
		return tunnelAddr
	}
	return end
}

// endpoints are the device's peers' endpoints by base64 public key.
func endpoints(dev *awgdev.Device) map[string]netip.AddrPort {
	out := map[string]netip.AddrPort{}
	s, err := dev.IpcGet()
	if err != nil {
		return out
	}
	key := ""
	for _, line := range strings.Split(s, "\n") {
		k, v, _ := strings.Cut(line, "=")
		switch k {
		case "public_key":
			if b, err := hex.DecodeString(v); err == nil {
				key = base64.StdEncoding.EncodeToString(b)
			}
		case "endpoint":
			if ap, err := netip.ParseAddrPort(v); err == nil && key != "" {
				out[key] = ap
			}
		}
	}
	return out
}

func (l *Listener) metadata(user string, src netip.AddrPort) []inbound.Addition {
	return []inbound.Addition{inbound.WithInName(l.cfg.Name), inbound.WithInUser(user), inbound.WithSrcAddrPort(l.source(user, src))}
}

func (l *Listener) handleTCP(tunnel C.Tunnel, r *mipstack.TCPForwarderRequest) {
	f := r.Flow()
	user, ok := l.user(f.Source.Addr())
	if !ok {
		_ = r.Drop()
		return
	}
	c, err := r.Accept(l.ctx)
	if err != nil {
		return
	}
	tunnel.HandleTCPConn(inbound.NewSocket(socks5.AddrFromStdAddrPort(f.Destination), c, C.TUN, l.metadata(user, f.Source)...))
}

func (l *Listener) handleUDP(tunnel C.Tunnel, r *mipstack.UDPForwarderRequest) {
	f := r.Flow()
	user, ok := l.user(f.Source.Addr())
	if !ok {
		_ = r.Drop()
		return
	}
	c, err := r.Accept()
	if err != nil {
		return
	}
	add := l.metadata(user, f.Source)
	target := socks5.AddrFromStdAddrPort(f.Destination)
	go func() {
		defer c.Close()
		buf := make([]byte, 65535)
		for {
			_ = c.SetReadDeadline(time.Now().Add(udpIdle))
			n, err := c.Read(buf)
			if err != nil {
				return
			}
			p := &packet{data: append([]byte(nil), buf[:n]...), conn: c, local: f.Destination}
			tunnel.HandleUDPPacket(inbound.NewPacket(target, p, C.TUN, add...))
		}
	}()
}

// packet is one datagram of a client's UDP flow (C.UDPPacket); replies go back on the flow.
type packet struct {
	data  []byte
	conn  *mipstack.UDPConn
	local netip.AddrPort
}

func (p *packet) Data() []byte { return p.data }

func (p *packet) WriteBack(b []byte, _ net.Addr) (int, error) { return p.conn.Write(b) }

func (p *packet) Drop() {}

func (p *packet) LocalAddr() net.Addr { return net.UDPAddrFromAddrPort(p.local) }

// Users implements C.InboundUserUpdater: the slots, by name.
func (l *Listener) Users() []C.InboundUser {
	l.mu.Lock()
	defer l.mu.Unlock()
	out := make([]C.InboundUser, 0, len(l.peers))
	for _, p := range l.peers {
		out = append(out, C.InboundUser{Name: p.Name, Secret: p.PublicKey + "@" + p.IP})
	}
	return out
}

// InboundUsers implements C.InboundUserLister.
func (l *Listener) InboundUsers() []string {
	l.mu.Lock()
	defer l.mu.Unlock()
	out := make([]string, 0, len(l.peers))
	for _, p := range l.peers {
		out = append(out, p.Name)
	}
	return out
}

// SetUsers implements C.InboundUserUpdater: the peers become users, each a name and its
// key@address as Users gives them. Only the peers that changed are touched on the device.
func (l *Listener) SetUsers(users []C.InboundUser) error {
	peers := make([]Peer, 0, len(users))
	for _, u := range users {
		key, ip, ok := strings.Cut(u.Secret, "@")
		if !ok {
			return fmt.Errorf("amneziawg: user %s: no key@address", u.Name)
		}
		peers = append(peers, Peer{Name: u.Name, PublicKey: key, IP: ip})
	}
	next := *l.cfg
	next.Users = peers
	m := map[string]any{}
	b, _ := json.Marshal(next)
	_ = json.Unmarshal(b, &m)
	if _, err := Parse(m); err != nil {
		return err
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	old := map[string]Peer{}
	for _, p := range l.peers {
		old[p.PublicKey] = p
	}
	var add, remove []Peer
	for _, p := range peers {
		if o, had := old[p.PublicKey]; !had || o != p {
			add = append(add, p)
		}
		delete(old, p.PublicKey)
	}
	for _, p := range old {
		remove = append(remove, p)
	}
	if l.dev != nil && len(add)+len(remove) > 0 {
		if err := l.dev.IpcSet(peerConf(add, remove)); err != nil {
			return fmt.Errorf("amneziawg: %w", err)
		}
	}
	l.peers = peers
	l.setByIP(peers)
	return nil
}

// SameExceptUsers implements C.InboundUserUpdater.
func (l *Listener) SameExceptUsers(o C.InboundConfig) bool {
	x, ok := o.(inboundConfig)
	if !ok {
		return false
	}
	a, b := *l.cfg, *x.c
	a.Users, b.Users = nil, nil
	return reflect.DeepEqual(a, b)
}

var (
	_ C.InboundListener    = (*Listener)(nil)
	_ C.InboundUserUpdater = (*Listener)(nil)
	_ C.InboundUserLister  = (*Listener)(nil)
)

// stackDevice is the IP stack as the device's tun, as the core's WireGuard outbound has it.
type stackDevice struct {
	*mipstack.Stack
	events    chan tun.Event
	closeOnce sync.Once
}

func (d *stackDevice) File() *os.File           { return nil }
func (d *stackDevice) Events() <-chan tun.Event { return d.events }

func (d *stackDevice) Start() error {
	d.events <- tun.EventUp
	return nil
}

func (d *stackDevice) Close() error {
	d.closeOnce.Do(func() { close(d.events) })
	return d.Stack.Close()
}
