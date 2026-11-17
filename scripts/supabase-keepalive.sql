-- =============================================================================
-- TitanBot MBVN — Supabase External Keep-Alive Pinger (pg_cron + pg_net)
-- =============================================================================
-- Keeps Render Free Web Service instances awake 24/7 by sending an external
-- HTTP GET request from Supabase's AWS infrastructure to Render's /health
-- endpoint every 5 minutes (*/5 * * * *), staying well under Render's 15-minute
-- idle spin-down threshold.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'titanbot_render_keepalive') THEN
    PERFORM cron.unschedule('titanbot_render_keepalive');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'titanbot_cron_log_cleanup') THEN
    PERFORM cron.unschedule('titanbot_cron_log_cleanup');
  END IF;
END
$$;

SELECT cron.schedule(
  'titanbot_render_keepalive',
  '*/5 * * * *',
  $$SELECT net.http_get(url := 'https://titanbot-mbvn.onrender.com/health', timeout_milliseconds := 30000);$$
);

SELECT cron.schedule(
  'titanbot_cron_log_cleanup',
  '0 4 * * *',
  $$DELETE FROM cron.job_run_details WHERE end_time < now() - interval '3 days'; DELETE FROM net._http_response WHERE created < now() - interval '1 day';$$
);
