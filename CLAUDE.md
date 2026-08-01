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

# Manual Belvedere occupancy

`Бельведер` has manually entered category-level occupancy through 30 October 2026.

- Rows titled `стандарт` correspond to rooms without a balcony.
- Rows titled `люкс` correspond to rooms with a balcony.
- The records have `external_source = 'manual_belvedere'` and are intentional.

Do not delete, replace, or overwrite these records in sync, migration, cleanup, or data-reconciliation work unless the user explicitly asks. Preserve real bookings alongside these manual occupancy markers.
