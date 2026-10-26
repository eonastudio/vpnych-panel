-- +goose Up
-- The referral program: an account's own link (/start r_<code>) and the friends who came by it.
-- A friend is the referrer's while it has no subscription and no payment yet; its first paid
-- tariff gives the referrer days, on the referrer's subscription or, without one, waiting for
-- the first one it buys.
CREATE TABLE referral_codes (
  tg_id      BIGINT PRIMARY KEY,
  code       TEXT NOT NULL UNIQUE,
  created_at BIGINT NOT NULL
);
CREATE TABLE referrals (
  tg_id       BIGINT PRIMARY KEY,  -- the friend
  referrer    BIGINT NOT NULL,
  created_at  BIGINT NOT NULL,
  payment_id  BIGINT,              -- the friend's first paid tariff
  paid_at     BIGINT,
  days        INTEGER NOT NULL DEFAULT 0, -- the referrer's reward for it
  user_id     BIGINT,              -- the subscription the reward went to
  rewarded_at BIGINT
);
CREATE INDEX referrals_referrer ON referrals (referrer, created_at DESC);
CREATE INDEX referrals_waiting ON referrals (referrer) WHERE payment_id IS NOT NULL AND rewarded_at IS NULL;

-- +goose Down
DROP TABLE referrals;
DROP TABLE referral_codes;
