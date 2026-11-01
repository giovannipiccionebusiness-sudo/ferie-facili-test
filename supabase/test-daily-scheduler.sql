select cron.schedule('lavoro-facile-test-daily-presence','* * * * *','select private.test_daily_presence_tick();');
