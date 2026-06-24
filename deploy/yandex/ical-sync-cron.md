# iCal cron trigger (Yandex Cloud)

Production endpoint:

`GET https://d5d4qekr1vt33i1f6g42.tmjd4m4j.apigw.yandexcloud.net/api/realtycalendar/ical-sync/cron?token=<REALTYCALENDAR_WEBHOOK_TOKEN>`

Recommended schedule: every 6 hours.

Example trigger via Yandex Cloud Scheduler:

```bash
yc serverless trigger create timer \
  --name travel-time-ical-sync \
  --cron-expression "0 */6 * * *" \
  --invoke-container-id "$(yc serverless container get travel-time --format json | jq -r .id)" \
  --invoke-path "/api/realtycalendar/ical-sync/cron?token=${REALTYCALENDAR_WEBHOOK_TOKEN}" \
  --invoke-service-account-id ajengmf1j6jbk729ut5q
```

Alternatively, use an external cron (GitHub Actions, UptimeRobot, etc.) to call the URL above.

The cron sync uses service role credentials on the server and:
- upserts all mapped RealtyCalendar iCal feeds
- prunes stale iCal blocks that disappeared from the feed
