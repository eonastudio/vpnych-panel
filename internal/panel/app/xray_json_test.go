package app

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"mikan/internal/panel/domain"
	"mikan/internal/panel/settings"
)

// The Xray JSON subscription end to end: with the switch on, Happ gets the configs with
// the auto-select group first; with it off, the share links.
func TestXrayJSONOverHTTP(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	if err := domain.Seed(ctx, h.st, h.now); err != nil {
		t.Fatal(err)
	}
	set := settings.New(h.st.Q)
	if err := settings.Set(ctx, set, settings.KeyPublicHost, "203.0.113.10"); err != nil {
		t.Fatal(err)
	}
	tariffs, err := h.st.Q.ListTariffs(ctx)
	if err != nil {
		t.Fatal(err)
	}
	clock := func() time.Time { return h.now }
	u, err := domain.NewUsers(h.st, domain.NewPool(h.st, clock), noChanges{}, clock).Create(ctx, domain.CreateInput{Name: "a", TariffID: tariffs[1].ID})
	if err != nil {
		t.Fatal(err)
	}
	fetch := func(ua string) (string, []byte) {
		t.Helper()
		h.now = h.now.Add(time.Minute) // past the settings cache
		resp, body := h.do(http.MethodGet, "/"+subPath+"/"+u.SubToken, nil, map[string]string{"User-Agent": ua})
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("%s: %d %s", ua, resp.StatusCode, body)
		}
		return resp.Header.Get("Content-Type"), body
	}
	if ct, body := fetch("Happ/3.6.0/Android/1"); ct != "text/plain; charset=utf-8" {
		t.Fatalf("switch off: %s %s", ct, body)
	}
	if err := settings.Set(ctx, set, settings.KeyXrayJSON, true); err != nil {
		t.Fatal(err)
	}
	for _, ua := range []string{"Happ/3.6.0/Android/1", "v2RayTun/5.1.0", "v2rayNG/1.10.5"} {
		ct, body := fetch(ua)
		var configs []struct {
			Remarks string `json:"remarks"`
			Routing struct {
				Balancers []struct {
					Tag string `json:"tag"`
				} `json:"balancers"`
			} `json:"routing"`
		}
		if ct != "application/json; charset=utf-8" || json.Unmarshal(body, &configs) != nil || len(configs) < 2 {
			t.Fatalf("%s: %s %s", ua, ct, body)
		}
		if len(configs[0].Routing.Balancers) != 1 || configs[0].Routing.Balancers[0].Tag != "auto" || configs[0].Remarks == "" {
			t.Errorf("%s: the group is not first: %+v", ua, configs[0])
		}
	}
	if ct, _ := fetch("clash.meta/1.19"); ct == "application/json; charset=utf-8" {
		t.Error("Clash got Xray JSON")
	}
}
