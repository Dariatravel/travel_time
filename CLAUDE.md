# Правило цветов шахматок (Дарья, 01.08.2026)

- **Голубая (mirror)** = занятость подтягивается АВТОМАТИКОЙ (вебхук, крон,
  iCal, Google/WPS-таблица). У шахматки есть кнопка «Обновить занятость».
  Менеджеры видят: данные обновляет робот, а не человек в отеле.
- **Зелёная (active)** = шахматку ведёт ЖИВОЙ ЧЕЛОВЕК (отельер или наши
  менеджеры) и она актуальна.
- Жёлтая (access) = есть доступ к чужой системе; белая (request) = по запросу.

Подключая отелю автосинк, ВСЕГДА: добавь его в `MIRROR_HOTEL_TITLES`
(`chessmateHotelHeaderStatus.ts`) и обеспечь работу кнопки — источник в
`MIRROR_SOURCES` либо воркфлоу в `CRON_WORKFLOW_BY_TITLE` (`mirrorSources.ts`).

# Единая программа: как добавлять новое (решение Дарьи, 11.09.2026)

Шахматка — центр будущей единой программы (брони, клиенты, финансы). Правила:

- **Только за флагом.** Новый экран или функция сначала доступны только роли
  `admin` (Дарья) и/или включаются переменной `NEXT_PUBLIC_FEATURE_*`. Менеджерам
  открываем после того, как Дарья проверила на тестовом контуре, потом на рабочем.
- **Только добавлять.** Существующие таблицы не переписывать: новые столбцы и
  таблицы — да, изменение смысла старых столбцов — нет. Миграции регистрировать
  в `scripts/apply-release-migrations.sh`.
- **Сначала тестовый контур.** `.github/workflows/deploy-yandex-staging.yml`
  собирает копию с отдельной базой (см. `deploy/yandex/backend-proxy.md`).
  Push в `main` автоматически выкатывает рабочий сайт — не вливать без Дарьи.
- **Деньги, брони, подтверждения — только через человека.** Агент готовит
  черновик, менеджер нажимает.
- Резервная копия рабочей базы: `.github/workflows/backup-supabase.yml`
  (ежедневно, зашифрована; расшифровка только на Mac mini).

# Manual Belvedere occupancy

`Бельведер` has manually entered category-level occupancy through 30 October 2026.

- Rows titled `стандарт` correspond to rooms without a balcony.
- Rows titled `люкс` correspond to rooms with a balcony.
- The records have `external_source = 'manual_belvedere'` and are intentional.

Do not delete, replace, or overwrite these records in sync, migration, cleanup, or data-reconciliation work unless the user explicitly asks. Preserve real bookings alongside these manual occupancy markers.
