"""Разбор: до каких чатов бот достучится и почему не достучался.

Печатает ТОЛЬКО названия чатов и имя бота. Ни один id в вывод не попадает:
репозиторий публичный, журналы Actions видны всем.
"""

import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

API = 'https://api.telegram.org/bot{token}/{method}'


def call(token, method, **params):
    """Запрос к Telegram. Возвращает разобранный ответ, ошибки не бросает."""
    url = API.format(token=token, method=method)
    data = urllib.parse.urlencode(params).encode() if params else None
    try:
        with urllib.request.urlopen(url, data=data, timeout=30) as response:
            return json.loads(response.read().decode('utf-8'))
    except urllib.error.HTTPError as error:  # Telegram отвечает 400 с описанием
        try:
            return json.loads(error.read().decode('utf-8'))
        except Exception:
            return {'ok': False, 'description': f'HTTP {error.code}'}
    except Exception as error:
        return {'ok': False, 'description': f'связь не удалась: {error}'}


def shape(entry):
    """Как выглядит запись — без самой записи."""
    if re.fullmatch(r'-100\d+', entry):
        return 'supergroup', 'числовой id супергруппы или канала'
    if re.fullmatch(r'-\d+', entry):
        return 'group', ('числовой id ОБЫЧНОЙ группы — такой id перестаёт '
                         'работать, когда группу повышают до супергруппы')
    if re.fullmatch(r'\d+', entry):
        return 'private', 'числовой id личного чата — оповещения придут одному человеку'
    if entry.startswith('@'):
        return 'username', '@логин — Telegram принимает такие только для публичных каналов'
    return 'junk', 'НЕ ПОХОЖЕ НА ID: в секрет попал текст, ссылка или опечатка'


def describe(chat):
    title = chat.get('title') or chat.get('username') or chat.get('first_name') or '(без названия)'
    return f'«{title}» — тип {chat.get("type", "?")}'


def main():
    token = os.environ.get('TELEGRAM_BOT_TOKEN', '').strip()
    raw_ids = os.environ.get('TELEGRAM_MANAGER_CHAT_IDS', '').strip()
    booking_id = os.environ.get('TELEGRAM_BOOKING_CHAT_ID', '').strip()

    if not token:
        print('Не задан секрет TELEGRAM_BOT_TOKEN')
        return 1
    if not raw_ids:
        print('Не задан секрет TELEGRAM_MANAGER_CHAT_IDS')
        return 1

    me = call(token, 'getMe').get('result') or {}
    bot_name = f'@{me.get("username")}' if me.get('username') else '(имя не узнать)'
    print(f'=== БОТ: {me.get("first_name", "")} {bot_name} ===')
    if not me:
        print('Telegram не признал токен — проверьте секрет TELEGRAM_BOT_TOKEN.')
        return 1

    entries = [part.strip() for part in raw_ids.split(',') if part.strip()]
    print(f'\n=== ЧАТЫ ИЗ TELEGRAM_MANAGER_CHAT_IDS (записей: {len(entries)}) ===')

    reachable = 0
    hints = []
    for number, entry in enumerate(entries, start=1):
        kind, human = shape(entry)
        print(f'\nЗапись {number}: {human}')

        if kind == 'junk':
            hints.append(f'Запись {number}: это вообще не id — секрет надо переписать.')
            print('  ✗ спрашивать Telegram не о чем')
            continue

        answer = call(token, 'getChat', chat_id=entry)
        if answer.get('ok'):
            print(f'  ✓ {describe(answer.get("result", {}))}, бот в чате состоит')
            reachable += 1
            continue

        print(f'  ✗ Telegram отказал: {answer.get("description", "без объяснения")}')

        # Группа, повышенная до супергруппы, получает id «-100» + прежние цифры.
        # Если такой чат находится — причина ясна без всяких догадок.
        if kind == 'group':
            candidate = '-100' + entry.lstrip('-')
            print(f'::add-mask::{candidate}')
            grown = call(token, 'getChat', chat_id=candidate)
            if grown.get('ok'):
                print(f'  → та же группа нашлась как супергруппа: {describe(grown.get("result", {}))}')
                hints.append(
                    f'Запись {number}: группу повысили до супергруппы, поэтому старый id '
                    'больше не работает. Новый номер бот назовёт сам — командой /chatid в этом чате.'
                )
                continue
            hints.append(
                f'Запись {number}: id обычной группы не работает, и супергруппы с таким '
                f'номером тоже нет. Скорее всего {bot_name} из чата удалили либо номер неверный.'
            )
        elif kind == 'private':
            hints.append(
                f'Запись {number}: это личный чат. Бот не может написать первым — '
                f'человек должен один раз нажать «Start» у {bot_name}.'
            )
        else:
            hints.append(
                f'Запись {number}: номер похож на настоящий, значит {bot_name} в этом чате '
                'не состоит — его надо добавить участником.'
            )

    # Чат карточки брони: он заведомо рабочий, и по нему видно, что дело не в
    # токене. Заодно проверяем, не он ли уже вписан менеджерам.
    if booking_id:
        print('\n=== ДЛЯ СРАВНЕНИЯ: чат карточки брони ===')
        answer = call(token, 'getChat', chat_id=booking_id)
        if answer.get('ok'):
            print(f'  ✓ {describe(answer.get("result", {}))}, бот в чате состоит')
            print('  Токен рабочий: как минимум в один чат бот пишет.')
            if booking_id in entries:
                print('  Этот чат уже вписан и в TELEGRAM_MANAGER_CHAT_IDS.')
            else:
                print('  В TELEGRAM_MANAGER_CHAT_IDS его нет.')
                print('  Если оповещения о синхронизации должны идти именно сюда —')
                print('  скопируйте значение переменной TELEGRAM_BOOKING_CHAT_ID в секрет.')
        else:
            print(f'  ✗ Telegram отказал: {answer.get("description", "без объяснения")}')

    print(f'\nВсего записей: {len(entries)}, чатов доступно боту: {reachable}')

    if hints:
        print('\nЧто именно сломано:')
        for hint in hints:
            print(f'  • {hint}')

    if reachable == 0:
        print('\nНи один чат недоступен — оповещения не дойдут никуда.')
        print('Как починить (одна минута):')
        print(f'  1. Убедиться, что {bot_name} состоит в чате менеджеров; если нет — добавить.')
        print('  2. Написать в этом чате «/chatid» — бот ответит номером чата.')
        print('  3. Вставить номер в секрет TELEGRAM_MANAGER_CHAT_IDS')
        print('     (Settings → Secrets and variables → Actions).')
        print('  4. Запустить эту проверку снова.')
        return 1

    if reachable < len(entries):
        print('\nЧасть чатов недоступна. Оповещения дойдут, но не всем:')
        print('уберите лишние записи из TELEGRAM_MANAGER_CHAT_IDS, чтобы проверка свежести не падала.')

    return 0


if __name__ == '__main__':
    sys.exit(main())
