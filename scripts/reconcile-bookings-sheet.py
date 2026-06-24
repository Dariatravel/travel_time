#!/usr/bin/env python3
"""Сверка всех вкладок БРОНИ-2026 с Supabase. Только отчёт."""

import json
import re
from datetime import datetime
from pathlib import Path
from urllib.parse import quote

import requests
from google.oauth2 import service_account
from google.auth.transport.requests import AuthorizedSession

ROOT = Path(__file__).resolve().parents[1]
KEY = Path.home() / "Downloads" / "sonorous-bounty-488706-q9-32a19387de8d.json"
SPREADSHEET_ID = "1XiOl2hSYsVpWSRW3gjEm7rNwhmpVx8gGHka3EbvSvtE"
SKIP = {"ИСТОРИЯ ДЕЙСТВИЙ", "ОТЗЫВЫ 2026"}
YEAR = 2026
OUT = ROOT / "bookings-sheet-reconciliation.txt"


def read_env():
    env = {}
    for line in (ROOT / ".env.local").read_text().splitlines():
        if "=" in line and not line.strip().startswith("#"):
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    return env


def normalize_title(s):
    s = (s or "").lower().replace("ё", "е")
    s = re.sub(r'[“”"«»()\-.,]', " ", s)
    return re.sub(r"\s+", " ", s).strip()


def norm_phone(p):
    d = re.sub(r"\D", "", p or "")
    if not d:
        return ""
    if d.startswith("8") and len(d) == 11:
        d = "7" + d[1:]
    if len(d) == 10:
        d = "7" + d
    return d[-10:]


def norm_guest(g):
    return normalize_title(g)


MONTHS = {
    "январь": 1,
    "февраль": 2,
    "март": 3,
    "апрель": 4,
    "май": 5,
    "июнь": 6,
    "июль": 7,
    "август": 8,
    "сентябрь": 9,
    "октябрь": 10,
    "ноябрь": 11,
    "декабрь": 12,
}


def parse_date_part(part, default_month=None):
    s = (part or "").strip().replace(" ", "")
    m = re.match(r"^(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?$", s)
    if m:
        day, month = int(m.group(1)), int(m.group(2))
        year = int(m.group(3)) if m.group(3) else YEAR
        if year < 100:
            year += 2000
        return f"{year:04d}-{month:02d}-{day:02d}"
    if default_month and re.match(r"^\d{1,2}$", s):
        return f"{YEAR:04d}-{default_month:02d}-{int(s):02d}"
    return None


def parse_booking_dates(raw, month_hint=""):
    text = re.sub(r"\s+", " ", (raw or "").strip())
    text = text.replace(".-", ".").replace(" .", ".")
    if not text:
        return None
    hint_raw = (month_hint or "").lower().strip().split("/")[0].strip()
    hint = MONTHS.get(hint_raw)

    m = re.match(
        r"^(\d{1,2}\.\d{1,2}(?:\.\d{2,4})?)\s*[-–—]\s*(\d{1,2}\.\d{1,2}(?:\.\d{2,4})?)$",
        text,
    )
    if m:
        a, b = parse_date_part(m.group(1)), parse_date_part(m.group(2))
        if a and b:
            return a, b

    m = re.match(r"^(\d{1,2}\.\d{1,2})\s*[-–—]\s*(\d{1,2}\.\d{1,2})$", text)
    if m:
        a, b = parse_date_part(m.group(1)), parse_date_part(m.group(2))
        if a and b:
            return a, b

    m = re.match(r"^(\d{1,2})\s*[-–—]\s*(\d{1,2})\.(\d{1,2})$", text)
    if m:
        month = int(m.group(3))
        a, b = parse_date_part(m.group(1), month), parse_date_part(m.group(2), month)
        if a and b:
            return a, b

    m = re.match(r"^(\d{1,2})\.(\d{1,2})\s*[-–—]\s*(\d{1,2})\.(\d{1,2})$", text)
    if m:
        a = parse_date_part(f"{m.group(1)}.{m.group(2)}")
        b = parse_date_part(f"{m.group(3)}.{m.group(4)}")
        if a and b:
            return a, b

    if hint:
        m = re.match(r"^(\d{1,2})\s*[-–—]\s*(\d{1,2})$", text)
        if m:
            a, b = parse_date_part(m.group(1), hint), parse_date_part(m.group(2), hint)
            if a and b:
                return a, b

    m = re.match(r"^(\d{1,2})\s*[-–—]\s*(\d{1,2})\.(\d{1,2})$", text)
    if m:
        month = int(m.group(3))
        a, b = parse_date_part(m.group(1), month), parse_date_part(m.group(2), month)
        if a and b:
            return a, b

    return None


def nights_between(start, end):
    a = datetime.strptime(start, "%Y-%m-%d")
    b = datetime.strptime(end, "%Y-%m-%d")
    return (b - a).days


def score_match(a, b):
    na, nb = normalize_title(a), normalize_title(b)
    if not na or not nb:
        return 0
    if na == nb:
        return 1
    if na in nb or nb in na:
        return 0.85
    wa = {w for w in na.split(" ") if len(w) > 2}
    wb = {w for w in nb.split(" ") if len(w) > 2}
    if not wa or not wb:
        return 0
    return len(wa & wb) / max(len(wa), len(wb))


def find_hotel(name, sheet, hotels):
    obj = normalize_title(name or sheet)
    best = None
    for h in hotels:
        sc = max(score_match(obj, h["title"]), score_match(normalize_title(sheet), h["title"]))
        if best is None or sc > best[0]:
            best = (sc, h)
    return best


def is_technical(g):
    n = norm_guest(g)
    return n in ("занят", "занято", "занята") or n.startswith("занят")


def to_int(val):
    if val is None or val == "":
        return None
    s = str(val).strip().replace(",", ".")
    m = re.search(r"\d+", s)
    return int(m.group()) if m else None


def compare(sheet_row, reserve):
    issues = []
    if sheet_row["start"] != reserve["startDate"]:
        issues.append(f"начало {sheet_row['start']} vs {reserve['startDate']}")
    if sheet_row["end"] != reserve["endDate"]:
        issues.append(f"конец {sheet_row['end']} vs {reserve['endDate']}")
    sn = to_int(sheet_row.get("nights"))
    if sn is not None and reserve.get("nights"):
        rn = int(reserve["nights"])
        dates_match = sheet_row["start"] == reserve["startDate"] and sheet_row["end"] == reserve["endDate"]
        if sn != rn and not (dates_match and abs(sn - rn) == 1):
            issues.append(f"ночей {sheet_row['nights']} vs {reserve['nights']}")
    sp = to_int(sheet_row.get("people"))
    if sp is not None and reserve.get("quantity") and sp != int(reserve["quantity"]):
        issues.append(f"гостей {sheet_row['people']} vs {reserve['quantity']}")
    sr = to_int(sheet_row.get("rate"))
    if sr is not None and reserve.get("price") and sr != int(reserve["price"]):
        issues.append(f"тариф {sheet_row['rate']} vs {reserve['price']}")
    spr = to_int(sheet_row.get("prepay"))
    if spr is not None and reserve.get("prepayment"):
        ap = to_int(reserve["prepayment"])
        if ap is not None and spr != ap:
            issues.append(f"предоплата {sheet_row['prepay']} vs {reserve['prepayment']}")
    sg = norm_guest(sheet_row["guest"])
    rg = norm_guest(reserve["guest"])
    if sg and rg:
        g0 = sg.split(" ")[0]
        if g0 and g0 not in rg and not any(w in rg for w in sg.split(" ")[:2]):
            issues.append(f"ФИО «{sheet_row['guest']}» vs «{reserve['guest']}»")
    return issues


def sheet_values(session, sheet_title, retries=3):
    safe = sheet_title.replace("'", "''")
    range_ = quote(f"'{safe}'!A1:M300", safe="")
    url = f"https://sheets.googleapis.com/v4/spreadsheets/{SPREADSHEET_ID}/values/{range_}"
    for attempt in range(retries):
        try:
            r = session.get(url, timeout=60)
            if r.ok:
                return r.json().get("values", [])
            if r.status_code in (429, 500, 502, 503) and attempt < retries - 1:
                import time
                time.sleep(2 ** attempt)
                continue
            print(f"  warn: {sheet_title}: {r.status_code}")
            return []
        except requests.RequestException as e:
            if attempt < retries - 1:
                import time
                time.sleep(2 ** attempt)
                continue
            print(f"  warn: {sheet_title}: {e}")
            return []
    return []


def load_sheet_data(session):
    meta = session.get(
        f"https://sheets.googleapis.com/v4/spreadsheets/{SPREADSHEET_ID}",
        params={"fields": "sheets.properties(title)"},
        timeout=60,
    ).json()
    sheet_names = [
        sh["properties"]["title"]
        for sh in meta.get("sheets", [])
        if sh["properties"]["title"] not in SKIP
    ]

    sheet_data = {}
    for title in sheet_names:
        vals = sheet_values(session, title)
        if len(vals) < 2:
            continue

        header = vals[0]
        col = {}
        for i, h in enumerate(header):
            k = normalize_title(h)
            if "объект" in k:
                col["object"] = i
            if "гость" in k or k == "фио":
                col["guest"] = i
            if "телефон" in k:
                col["phone"] = i
            if "даты брони" in k:
                col["dates"] = i
            if "месяц" in k:
                col["month"] = i
            if "суток" in k:
                col["nights"] = i
            if "чел" in k:
                col["people"] = i
            if k == "тариф" or "тариф" in k:
                col["rate"] = i
            if "предоплата" in k:
                col["prepay"] = i
        if "guest" not in col and "phone" not in col:
            continue

        bookings = []
        for ridx, row in enumerate(vals[1:], start=2):
            if not row or all(not str(c).strip() for c in row):
                continue
            guest = (row[col["guest"]] if "guest" in col and col["guest"] < len(row) else "").strip()
            phone = (row[col["phone"]] if "phone" in col and col["phone"] < len(row) else "").strip()
            if not guest and not phone:
                continue
            if is_technical(guest) and not re.sub(r"\D", "", phone):
                continue

            month = row[col["month"]] if "month" in col and col["month"] < len(row) else ""
            dates_raw = row[col["dates"]] if "dates" in col and col["dates"] < len(row) else ""
            parsed = parse_booking_dates(dates_raw, month)
            object_name = (
                row[col["object"]] if "object" in col and col["object"] < len(row) else ""
            ).strip()

            bookings.append(
                {
                    "sheet": title,
                    "rowNum": ridx,
                    "object": object_name,
                    "guest": guest,
                    "phone": phone,
                    "phoneNorm": norm_phone(phone),
                    "datesRaw": dates_raw,
                    "start": parsed[0] if parsed else None,
                    "end": parsed[1] if parsed else None,
                    "nights": row[col["nights"]] if "nights" in col and col["nights"] < len(row) else "",
                    "people": row[col["people"]] if "people" in col and col["people"] < len(row) else "",
                    "rate": row[col["rate"]] if "rate" in col and col["rate"] < len(row) else "",
                    "prepay": row[col["prepay"]] if "prepay" in col and col["prepay"] < len(row) else "",
                }
            )
        if bookings:
            sheet_data[title] = bookings
    return sheet_data


def supabase_get(env, table, params="select=*", range_header=None):
    url = f"{env['NEXT_PUBLIC_SUPABASE_URL']}/rest/v1/{table}?{params}"
    headers = {
        "apikey": env["SUPABASE_SERVICE_ROLE_KEY"],
        "Authorization": f"Bearer {env['SUPABASE_SERVICE_ROLE_KEY']}",
    }
    if range_header:
        headers["Range"] = range_header
    r = requests.get(url, headers=headers, timeout=120)
    if not r.ok:
        raise RuntimeError(f"Supabase {table}: {r.status_code} {r.text[:500]}")
    return r.json()


def load_supabase(env):
    hotels = supabase_get(env, "hotels", "select=id,title&order=title")

    rooms = []
    start = 0
    page_size = 1000
    while True:
        end = start + page_size - 1
        chunk = supabase_get(
            env,
            "rooms",
            "select=id,hotel_id,title&order=id.asc",
            range_header=f"{start}-{end}",
        )
        if not chunk:
            break
        rooms.extend(chunk)
        if len(chunk) < page_size:
            break
        start += page_size
    print(f"Loaded {len(rooms)} rooms from Supabase")

    all_reserves = []
    start = 0
    page_size = 1000
    while True:
        end = start + page_size - 1
        chunk = supabase_get(
            env,
            "reserves",
            "select=*&order=start.asc",
            range_header=f"{start}-{end}",
        )
        if not chunk:
            break
        all_reserves.extend(chunk)
        if len(chunk) < page_size:
            break
        start += page_size
    print(f"Loaded {len(all_reserves)} reserves from Supabase")

    hotel_map = {h["id"]: h["title"] for h in hotels}
    room_map = {r["id"]: r for r in rooms}
    reserves = []
    for r in all_reserves:
        room = room_map.get(r["room_id"])
        if not room:
            continue
        reserves.append(
            {
                **r,
                "hotelId": room["hotel_id"],
                "hotel": hotel_map.get(room["hotel_id"]),
                "roomTitle": room["title"],
                "startDate": datetime.utcfromtimestamp(r["start"]).strftime("%Y-%m-%d"),
                "endDate": datetime.utcfromtimestamp(r["end"]).strftime("%Y-%m-%d"),
                "nights": int((r["end"] - r["start"]) / 86400),
                "phoneNorm": norm_phone(r.get("phone")),
                "guestNorm": norm_guest(r.get("guest")),
            }
        )
    return hotels, reserves


def main():
    env = read_env()
    creds = service_account.Credentials.from_service_account_file(
        str(KEY), scopes=["https://www.googleapis.com/auth/spreadsheets.readonly"]
    )
    session = AuthorizedSession(creds)

    print("Loading Google Sheet...")
    sheet_data = load_sheet_data(session)
    print("Loading Supabase...")
    hotels, reserves = load_supabase(env)

    client_email = json.loads(KEY.read_text())["client_email"]
    lines = [
        "ПОЛНАЯ СВЕРКА: БРОНИ-2026. список из ваучеров ↔ шахматка (Supabase)",
        f"Дата: {datetime.now().strftime('%Y-%m-%d')}",
        f"Таблица ID: {SPREADSHEET_ID}",
        f"Service account: {client_email}",
        f"JSON ключ: {KEY}",
        f"Отелей в программе: {len(hotels)}, броней: {len(reserves)}",
        "",
    ]

    full = partial = missing = unparsed = 0
    sheets_without = set()
    sheets_with = []
    problems = []
    total_in_program = 0

    for sheet_name in sorted(sheet_data.keys(), key=lambda x: x.lower()):
        bookings = sheet_data[sheet_name]
        sample = next((b["object"] for b in bookings if b["object"]), sheet_name)
        sc, hotel = find_hotel(sample, sheet_name, hotels)
        if sc < 0.5:
            sheets_without.add(sheet_name)
            continue

        hotel_reserves = [r for r in reserves if r["hotelId"] == hotel["id"]]
        sheets_with.append((sheet_name, hotel["title"], sc, len(bookings)))
        lines.append(f"━━━ {sheet_name} → «{hotel['title']}» (score {sc:.2f}) ━━━")
        lines.append(
            f"Броней на вкладке: {len(bookings)}, в программе для объекта: {len(hotel_reserves)}"
        )
        sf = sp = sm = sn = 0

        for b in bookings:
            total_in_program += 1
            if not b["start"] or not b["end"]:
                unparsed += 1
                sn += 1
                problems.append({**b, "hotel": hotel["title"], "status": "ДАТЫ", "issues": [b["datesRaw"]]})
                lines.append(f"  ? [{b['rowNum']}] {b['guest']} даты «{b['datesRaw']}» — не распознаны")
                continue

            if not b["nights"]:
                b["nights"] = nights_between(b["start"], b["end"])

            obj_sc, obj_hotel = find_hotel(b["object"] or sheet_name, sheet_name, hotels)
            target_hotel = obj_hotel if obj_sc >= 0.5 else hotel
            target_reserves = [r for r in reserves if r["hotelId"] == target_hotel["id"]]

            candidates = target_reserves
            if b["start"] and b["end"]:
                by_dates = [
                    r
                    for r in candidates
                    if r["startDate"] == b["start"] and r["endDate"] == b["end"]
                ]
                if by_dates:
                    candidates = by_dates
            if b["phoneNorm"]:
                by_phone = [r for r in candidates if r["phoneNorm"] == b["phoneNorm"]]
                if by_phone:
                    candidates = by_phone
            if len(candidates) > 1 and b["guest"]:
                g0 = norm_guest(b["guest"]).split(" ")[0]
                by_g = [r for r in candidates if g0 in r["guestNorm"]]
                if by_g:
                    candidates = by_g

            match = candidates[0] if candidates else None
            label = (b["object"] + " — " if b["object"] else "")

            if not match:
                missing += 1
                sm += 1
                problems.append({**b, "hotel": target_hotel["title"], "status": "НЕ НАЙДЕНА", "issues": []})
                lines.append(
                    f"  ❌ [{b['rowNum']}] {label}{b['guest']} {b['start']}–{b['end']} {b['phone']}"
                )
                continue

            issues = compare(b, match)
            if not issues:
                full += 1
                sf += 1
                lines.append(f"  ✅ [{b['rowNum']}] {b['guest']} {b['start']}–{b['end']}")
            else:
                partial += 1
                sp += 1
                problems.append(
                    {
                        **b,
                        "hotel": target_hotel["title"],
                        "status": "РАСХОЖДЕНИЯ",
                        "issues": issues,
                        "app": match["guest"],
                    }
                )
                lines.append(
                    f"  ⚠️ [{b['rowNum']}] {b['guest']} {b['start']}–{b['end']}: {'; '.join(issues)}"
                )

        if sn:
            lines.append(f"  (не распознаны даты: {sn})")
        lines.append(f"  Итог: ✅{sf} ⚠️{sp} ❌{sm}")
        lines.append("")

    lines += [
        "═══════════════════════════════════════",
        "СВОДКА",
        "═══════════════════════════════════════",
        f"Вкладок с бронями: {len(sheet_data)}",
        f"Сопоставлено с программой: {len(sheets_with)}",
        f"Без объекта в программе: {len(sheets_without)}",
        f"Броней на сопоставленных вкладках: {total_in_program}",
        f"  ✅ Полное совпадение: {full}",
        f"  ⚠️ С расхождениями: {partial}",
        f"  ❌ Не найдено: {missing}",
        f"  ? Не распознаны даты: {unparsed}",
        "",
    ]

    if sheets_without:
        lines.append("Вкладки БЕЗ объекта в программе:")
        for sn in sorted(sheets_without, key=lambda x: x.lower()):
            lines.append(f"  - {sn} ({len(sheet_data[sn])} броней)")
        lines.append("")

    lines.append("Сопоставленные вкладки (вкладка → объект программы, броней):")
    for sn, ht, sc, cnt in sorted(sheets_with, key=lambda x: x[0].lower()):
        lines.append(f"  {sn} → {ht} ({cnt})")
    lines.append("")
    lines.append("Все расхождения и пропуски:")
    for p in problems:
        if p["status"] == "ДАТЫ":
            lines.append(
                f"  ? {p['sheet']}[{p['rowNum']}] {p['hotel']} {p['guest']} даты «{p['datesRaw']}»"
            )
        elif p["status"] == "НЕ НАЙДЕНА":
            lines.append(
                f"  ❌ {p['sheet']}[{p['rowNum']}] {p['hotel']} {p['guest']} {p.get('start')}–{p.get('end')} {p['phone']}"
            )
        else:
            lines.append(
                f"  ⚠️ {p['sheet']}[{p['rowNum']}] {p['hotel']} {p['guest']} {p.get('start')}–{p.get('end')}: {'; '.join(p['issues'])}"
            )

    OUT.write_text("\n".join(lines), encoding="utf-8")
    print(f"Written {OUT}")
    print(
        f"summary full={full} partial={partial} missing={missing} "
        f"no_hotel_tabs={len(sheets_without)} unparsed={unparsed}"
    )


if __name__ == "__main__":
    main()
