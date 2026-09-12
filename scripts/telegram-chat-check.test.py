"""Проверка разбора чатов — без обращения к Telegram.

Разбор решает, что Дарья прочитает в журнале, поэтому ветки проверяются
на подставных ответах: ошибка в тексте стоит потерянного дня.
"""

import importlib.util
import io
import os
import sys
import unittest.mock
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    'chat_check', Path(__file__).with_name('telegram-chat-check.py')
)
chat_check = importlib.util.module_from_spec(spec)
spec.loader.exec_module(chat_check)

BOT = {'ok': True, 'result': {'username': 'testbot', 'first_name': 'Проверка'}}
DENIED = {'ok': False, 'description': 'Bad Request: chat not found'}


def run(env, answers):
    """Прогнать разбор, подставив ответы Telegram по (метод, chat_id)."""
    def fake_call(_token, method, **params):
        if method == 'getMe':
            return BOT
        return answers.get(params.get('chat_id'), DENIED)

    out = io.StringIO()
    with unittest.mock.patch.object(chat_check, 'call', fake_call), \
            unittest.mock.patch.dict(os.environ, env, clear=True), \
            unittest.mock.patch.object(sys, 'stdout', out):
        code = chat_check.main()
    return code, out.getvalue()


def check(name, condition):
    if not condition:
        print(f'ПРОВАЛ: {name}')
        sys.exit(1)
    print(f'  ✓ {name}')


base = {'TELEGRAM_BOT_TOKEN': 'x'}

# 1. Рабочий чат — проверка зелёная.
code, log = run(
    {**base, 'TELEGRAM_MANAGER_CHAT_IDS': '-1001111'},
    {'-1001111': {'ok': True, 'result': {'title': 'Менеджеры', 'type': 'supergroup'}}},
)
check('рабочий чат: код 0', code == 0)
check('рабочий чат: название видно', '«Менеджеры»' in log)
check('рабочий чат: id в журнал не попал', '-1001111' not in log)

# 2. Группа выросла в супергруппу — причина названа прямо.
code, log = run(
    {**base, 'TELEGRAM_MANAGER_CHAT_IDS': '-1111'},
    {'-1001111': {'ok': True, 'result': {'title': 'Менеджеры', 'type': 'supergroup'}}},
)
check('повышение до супергруппы: код 1', code == 1)
check('повышение до супергруппы: причина названа', 'повысили до супергруппы' in log)
check('повышение до супергруппы: новый id не напечатан',
      log.count('-1001111') == 1 and '::add-mask::-1001111' in log)

# 3. Мусор вместо id.
code, log = run({**base, 'TELEGRAM_MANAGER_CHAT_IDS': 'https://t.me/chat'}, {})
check('мусор в секрете: код 1', code == 1)
check('мусор в секрете: сказано, что это не id', 'НЕ ПОХОЖЕ НА ID' in log)

# 4. Верный по виду id, но бота в чате нет.
code, log = run({**base, 'TELEGRAM_MANAGER_CHAT_IDS': '-1002222'}, {})
check('бот не в чате: код 1', code == 1)
check('бот не в чате: назван логин бота', '@testbot' in log)

# 5. Личный чат без «Start».
code, log = run({**base, 'TELEGRAM_MANAGER_CHAT_IDS': '555'}, {})
check('личный чат: подсказка про Start', 'Start' in log)

# 6. Часть чатов жива — проверка зелёная, но предупреждает.
code, log = run(
    {**base, 'TELEGRAM_MANAGER_CHAT_IDS': '-1001111,-1002222'},
    {'-1001111': {'ok': True, 'result': {'title': 'Менеджеры', 'type': 'supergroup'}}},
)
check('часть чатов жива: код 0', code == 0)
check('часть чатов жива: есть предупреждение', 'дойдут, но не всем' in log)

print('Разбор чатов: все проверки пройдены')
