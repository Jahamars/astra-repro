## Как это работает

GitLab CI получает пуш, генерирует дочерний пайплайн по `packages.txt`. Каждый пакет проверяется в отдельном поде:

1. Из apt-репозитория берётся задекларированный хеш (`hash_declared`) и скачивается `.deb` — считается `hash_download`. Если они расходятся, зеркало подменено.
2. Пакет собирается из исходников, считается `hash_rebuilt`.
3. Все три хеша и лог сборки отправляются в API. Сервис определяет статус и сохраняет в БД.

Три хеша на пакет:

- `hash_declared` — SHA256 из индекса репозитория (Packages)
- `hash_download` — SHA256 скачанного `.deb` (проверка зеркала)
- `hash_rebuilt` — SHA256 пакета собранного из исходника (проверка воспроизводимости)

## Структура 
```
main.py              точка входа, FastAPI app + lifespan
config.py            настройки через pydantic-settings / .env
database.py          asyncpg connection pool, get_conn dependency
models/schemas.py    все pydantic-схемы
routers/
  packages.py        /packages — регистрация пакетов и версий
  runs.py            /runs — управление жизненным циклом проверок
  stats.py           /stats, /mirror, /snapshots — агрегаты и инфраструктура
services/
  comparer.py        бизнес-логика: классификация диффов, определение статуса
bd/main.sql          схема БД (полный DDL, без миграций)
ci/
  .gitlab-ci.yml     generate + verify пайплайн
  packages.txt       список пакетов для проверки
```

## Запуск

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# создать БД и применить схему
createdb reprochek
psql reprochek < bd/main.sql

cp .env.example .env  # поправить DATABASE_URL если нужно
uvicorn main:app --reload
```

Swagger доступен на `http://localhost:8000/docs`.

## Конфигурация (.env)

```
DATABASE_URL=postgresql://postgres@localhost/reprochek
DEBUG=true
APP_VERSION=1.0.0
```

## API

### Packages

`POST /packages/versions` — upsert пакета и версии. Принимает `name` (binary), `source_name`, `version`, `arch`, `hash_declared`, `hash_download`. Возвращает запись с `mirror_ok` (generated column: `hash_declared == hash_download`).

`GET /packages` — список последних версий с их статусом. Параметры: `search`, `status`, `limit`, `offset`.

`GET /packages/{name}` — все версии пакета с последним run.

`GET /packages/{name}/history` — полная история runs по пакету.

### Runs

`POST /runs` — создать новый run для версии пакета. Если уже есть активный run (PENDING/BUILDING) — вернёт 409 с его id.

`GET /runs/pending` — взять следующий PENDING run из очереди (`FOR UPDATE SKIP LOCKED`, безопасно при параллельных воркерах).

`PUT /runs/{id}/start` — перевести run из PENDING → BUILDING.

`POST /runs/{id}/result` — отправить результат сборки (`hash_rebuilt`, `build_log`, `failure_reason`). Сервис сам определит статус и запишет в БД.

`POST /runs/{id}/diffs` — отправить список диффов (после diffoscope). Каждый дифф классифицируется по `file_path` и `section_name`, статус run обновляется на `NOT_REPRODUCIBLE` или `NOT_REPRODUCIBLE_CRITICAL`.

`GET /runs/{id}` — полная информация о run включая диффы.

### Stats

`GET /stats` — общие счётчики и распределение по статусам.

`GET /stats/issues` — критические и умеренные диффы. Параметры: `severity` (CRITICAL | MODERATE), `limit`.

`GET /stats/snapshots` — агрегаты по git-снапшотам (сколько verified/failed/pending на каждый коммит).

`GET /stats/mirror` — сводка по целостности зеркала: сколько версий ok / tampered / ещё не проверено.

`GET /mirror/syncs` — история синков зеркала.

`POST /mirror/syncs` — записать результат синка.

`POST /snapshots` — зарегистрировать снапшот `packages.txt` на конкретный git-коммит (идемпотентно).

`GET /snapshots/{id}/runs` — все runs привязанные к снапшоту.

## Статусы verification run

| Статус | Когда |
|---|---|
| PENDING | run создан, ждёт воркера |
| BUILDING | воркер взял задачу |
| VERIFIED | `hash_declared == hash_rebuilt` |
| NOT_REPRODUCIBLE | хеши не совпали, нет критических диффов |
| NOT_REPRODUCIBLE_CRITICAL | хеши не совпали, есть диффы в `.text`/`.data`/скриптах |
| UNVERIFIABLE | сборка не запускалась, `hash_rebuilt` отсутствует |
| BUILD_FAILED | сборка упала с ошибкой |


`services/comparer.py::classify_diff` определяет причину и серьёзность diff по `section_name` и `file_path`:

- `.text`, `.rodata`, `.data`, `.plt`, `.got` → CODE_SECTION / CRITICAL
- `preinst`, `postinst`, `prerm`, `postrm` → SCRIPT / CRITICAL
- `.data.rel.ro`, `.dynamic`, `.init`, `.fini` → DATA_SECTION / MODERATE
- `.debug*`, `.strtab`, `.dynstr` и т.д. → NOISE


Для добавления пакета достаточно вписать имя в `packages.txt` и запушить.

## Зависимости

```
fastapi, uvicorn[standard]   — HTTP-сервер
asyncpg                      — async PostgreSQL драйвер
pydantic, pydantic-settings  — валидация и конфиг
httpx                        — HTTP-клиент (для тестов)
PostgreSQL >= 13 
```

