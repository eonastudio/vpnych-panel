-- +goose Up
-- The nodes' health checks by UTC day, for the public status page: how many the panel made and
-- how many the node answered. The checks are counted in memory and added here about once a
-- minute (nodesync), so a day's row is written some 1440 times, not once every few seconds.
CREATE TABLE node_uptime (
  node_id BIGINT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  day     BIGINT NOT NULL, -- the day's start, unix seconds
  checks  BIGINT NOT NULL DEFAULT 0,
  ok      BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (node_id, day)
);

-- +goose Down
DROP TABLE node_uptime;
