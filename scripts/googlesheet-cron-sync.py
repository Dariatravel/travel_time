#!/usr/bin/env python3
"""Ежечасная синхронизация занятости из Google-таблиц отельеров в нашу шахматку.

Источник — таблица-шахматка отельера (месяцы-листы, номера в столбце A,
дни в строке-шапке, бронь = объединённая ячейка). Пишем занятость метками
external_source='googlesheet_<tag>' (наши брони НЕ трогаем, пересечения
пропускаем — их отобьёт триггер А1). Идемпотентно: перед вставкой удаляем
прошлые метки этого источника.

Креды из окружения (GitHub secrets):
  GOOGLE_SERVICE_ACCOUNT_JSON  — JSON ключа сервис-аккаунта (строкой)
  NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
"""
import os, json, re, datetime, urllib.request, urllib.error, urllib.parse, base64
import gspread
from google.oauth2.service_account import Credentials

YEAR = 2026

# --- Источники (расширяемо: Санрайз сейчас; Фемели/Данелян добавим позже) ---
SOURCES = [
    {
        'name': 'Санрайз',
        'tag': 'googlesheet_sunrise',
        'sheet_id': '16jmZEO_nWlZSY5hVS6F7rSzAxW9CRWlhppcV3XU-lms',
        'hotel_like': '%санрайз%',
        'header_row': 0,           # строка с днями
        'months': {'Май':5,'Июнь':6,'Июль':7,'Август':8,'Сентябрь':9},
        # лист-номер (столбец A) -> номер нашего номера
        'map': {'1':1,'2':2,'21':3,'22':4,'23':5,'24':6,'25':7,'26':8,
                '31':9,'32':10,'33':11,'34':12,'35':13,'36':14},
        'guest': 'Занято (Санрайз)',
    },
]

SB_URL = os.environ['NEXT_PUBLIC_SUPABASE_URL'].rstrip('/')
SB_KEY = os.environ['SUPABASE_SERVICE_ROLE_KEY']

def sb(method, path, body=None, prefer=None):
    headers = {'apikey': SB_KEY, 'Authorization': 'Bearer '+SB_KEY,
               'Content-Type': 'application/json'}
    if prefer: headers['Prefer'] = prefer
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(SB_URL+path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            txt = r.read().decode()
            return r.status, (json.loads(txt) if txt else None)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()

def rooms_of(hotel_like):
    """num -> room_id для отеля."""
    st, hs = sb('GET', f"/rest/v1/hotels?select=id&title=ilike.{urllib.parse.quote(hotel_like)}")
    if not hs: raise SystemExit(f"отель не найден: {hotel_like}")
    hid = hs[0]['id']
    st, rs = sb('GET', f"/rest/v1/rooms?select=id,title,is_service&hotel_id=eq.{hid}")
    num2id = {}
    for r in rs or []:
        if r.get('is_service'): continue
        m = re.search(r'номер\s*(\d+)', r['title'] or '')
        if m: num2id[int(m.group(1))] = r['id']
    return hid, num2id

def ci_unix(d): return int(datetime.datetime(d.year,d.month,d.day,11,tzinfo=datetime.timezone.utc).timestamp())
def co_unix(d): return int(datetime.datetime(d.year,d.month,d.day,9,tzinfo=datetime.timezone.utc).timestamp())
NIGHT = 86400

def parse_sheet(gc, src):
    """-> list of (room_num, checkin_date, checkout_date)."""
    sh = gc.open_by_key(src['sheet_id']); meta = sh.fetch_sheet_metadata()
    def merges_of(t):
        sm = next((s for s in meta['sheets'] if s['properties']['title']==t), None)
        return sm.get('merges', []) if sm else []
    hr = src['header_row']; stays = []
    for title, mon in src['months'].items():
        try: ws = sh.worksheet(title)
        except gspread.WorksheetNotFound: continue
        vals = ws.get_all_values()
        if len(vals) <= hr: continue
        col2date = {}; prev = 0
        for c, v in enumerate(vals[hr]):
            v = v.strip()
            if not v.isdigit(): continue
            d = int(v)
            if d < prev: break
            try: col2date[c] = datetime.date(YEAR, mon, d)
            except ValueError: break
            prev = d
        row2num = {r: src['map'][vals[r][0].strip()]
                   for r in range(hr+1, len(vals)) if vals[r][0].strip() in src['map']}
        for m in merges_of(title):
            sr = m.get('startRowIndex', 0)
            if sr <= hr: continue
            er = m.get('endRowIndex', sr+1); sc = m['startColumnIndex']; ec = m['endColumnIndex']
            num = next((row2num[rr] for rr in range(sr, er) if rr in row2num), None)
            if num is None: continue
            dates = sorted(col2date[c] for c in range(sc, ec) if c in col2date)
            if not dates: continue
            stays.append((num, dates[0], dates[-1]+datetime.timedelta(days=1)))
    return stays

def sync_source(gc, src):
    hid, num2id = rooms_of(src['hotel_like'])
    ids = list(num2id.values())
    stays = parse_sheet(gc, src)

    # наши ручные занятые ночи (чтобы заранее отсеять пересечения с А1)
    inlist = ",".join(f'"{i}"' for i in ids)
    st, rows = sb('GET', f"/rest/v1/reserves?select=room_id,start,end,external_source&room_id=in.({inlist})")
    ours = {i: set() for i in ids}
    for z in rows or []:
        if z.get('external_source') == src['tag']:
            continue
        for n in range(z['start']//NIGHT, z['end']//NIGHT):
            ours.setdefault(z['room_id'], set()).add(n)

    # удалить прошлые метки этого источника
    sb('DELETE', f"/rest/v1/reserves?external_source=eq.{src['tag']}&room_id=in.({inlist})", prefer='return=minimal')

    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    to_insert = []; skipped = 0
    for num, ci, co in stays:
        rid = num2id.get(num)
        if not rid: continue
        s = ci_unix(ci); e = co_unix(co)
        nights = set(range(s//NIGHT, e//NIGHT))
        if nights & ours.get(rid, set()):   # пересекается с нашей бронью — пропускаем
            skipped += 1; continue
        to_insert.append({'room_id': rid, 'start': s, 'end': e,
            'guest': src['guest'], 'phone': '', 'price': 0, 'quantity': 1,
            'comment': f"Занятость из таблицы {src['name']} (авто, крон)",
            'created_by': src['tag'], 'edited_at': now, 'edited_by': src['tag'],
            'external_source': src['tag'], 'external_uid': f"{src['tag']}:{rid}:{s}-{e}",
            'external_feed_url': 'https://docs.google.com/spreadsheets/d/'+src['sheet_id'],
            'external_synced_at': now})

    inserted = 0
    if to_insert:
        st, resp = sb('POST', "/rest/v1/reserves", body=to_insert, prefer='return=minimal')
        if st in (200,201,204):
            inserted = len(to_insert)
        else:  # на всякий случай — построчно с пропуском А1
            for row in to_insert:
                st2, r2 = sb('POST', "/rest/v1/reserves", body=row, prefer='return=minimal')
                if st2 in (200,201,204): inserted += 1
                elif isinstance(r2, str) and ('23P01' in r2 or 'Наложени' in r2): skipped += 1
    return {'hotel': src['name'], 'parsed': len(stays), 'inserted': inserted, 'skipped': skipped}

def load_key():
    if os.environ.get('GOOGLE_SA_B64'):
        return json.loads(base64.b64decode(os.environ['GOOGLE_SA_B64']))
    return json.loads(os.environ['GOOGLE_SERVICE_ACCOUNT_JSON'])

def main():
    key = load_key()
    creds = Credentials.from_service_account_info(
        key, scopes=['https://www.googleapis.com/auth/spreadsheets.readonly'])
    gc = gspread.authorize(creds)
    summary = [sync_source(gc, src) for src in SOURCES]
    print(json.dumps({'status': 'ok', 'summary': summary}, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()
