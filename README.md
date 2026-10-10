# QuickType (Overwolf)

Универсальный внутриигровой оверлей быстрого ввода для платформы Overwolf с отправкой через REST API / Webhook. Подходит для озвучки TTS (Skald / TTSBard), ботов Twitch, стримерских интеграций, Discord и автоматизации.

## Архитектура: Двухоконная модель (v0.2.3)

Приложение спроектировано по официальным стандартам Overwolf App Store:

1. **Главное окно настроек (`desktop.html`)**:
   - Настройка целевого REST эндпоинта (URL) и метода (`POST`, `GET`, `PUT`).
   - Редактор шаблона тела запроса (JSON payload) с подстановкой `{text}`.
   - Настройка HTTP-заголовков (токены авторизации, `Content-Type`).
   - Настройка геометрии игрового оверлея (ширина и высота с готовыми пресетами).
   - Встроенный интерактивный тест REST-запроса с обходом CORS (`overwolf.web`) для localhost и предпросмотр оверлея.
2. **Игровой оверлей ввода (`overlay.html`)**:
   - Работает поверх полноэкранных игр в эксклюзивном режиме Overwolf (`ReleaseOnHidden`).
   - Автоматический перехват фокуса клавиатуры в поле ввода.
   - **Enter** — отправка текста в REST API и немедленное скрытие (без задержек для игры).
   - **Escape** — отмена ввода и немедленное скрытие.
3. **Фоновый координатор (`background.html`)**:
   - Обработка глобального хоткея (`Ctrl+Shift+F9`).
   - Управление окнами и эксклюзивным фокусом (`requestOverlayFocus`, `bringToFront`).
   - Асинхронное выполнение HTTP-запросов через нативный веб-мост.

## Структура репозитория

- `quicktype-overlay/` — исходный код Overwolf-приложения (манифест `manifest.json`, HTML, JS, CSS, иконка).
- `docs/` — проектная документация:
  - `docs/decisions/` — Архитектурные решения ([ADR 001](./docs/decisions/001-two-window-rest-overlay-architecture.md)).
  - `docs/roadmap/` — Дорожная карта продукта ([ROADMAP-001](./docs/roadmap/active/001-universal-rest-overlay.md)).
  - `docs/tasks/` — Задачи разработки ([TASK-001](./docs/tasks/001-two-window-prototype.md)).
  - `docs/research/` — Технический ресерч ядра Overwolf, MixMode и DirectX-хуков.
- `scripts/` — служебные скрипты и утилиты:
  - `scripts/package-opk.ps1` — автоматическая сборка приложения в `.opk` архив для Overwolf (`dist/QuickType-0.2.3.opk`).
  - `scripts/patch-overwolf-gamelist.js` — утилита исправления `GamesList.xml` для игр без видимого курсора.
  - `scripts/gen-icon.ps1` — скрипт генерации PNG-иконки приложения.
- `dist/` — собранные релизные пакеты `.opk` (в `.gitignore`).

## Быстрый старт

### 1. Загрузка в Overwolf (Unpacked)
1. Откройте клиент Overwolf.
2. Включите режим разработчика: `Настройки` -> `О программе` (About) -> кликните 10 раз по номеру версии или зайдите в аккаунт с правами разработчика.
3. Перейдите в `Пакетирование` (Packages / Development Options) -> **Load unpacked extension**.
4. Выберите папку `quicktype-overlay`.
5. Приложение запустится, и откроется главное окно настроек QuickType.

### 2. Сборка OPK для релиза
Запустите PowerShell скрипт в корне репозитория:
```powershell
.\scripts\package-opk.ps1
```
Готовый пакет будет помещён в `dist/QuickType-0.2.3.opk`.

> **Примечание об установке `.opk`:**
> Пакеты `.opk` предназначены для дистрибуции через Overwolf App Store. Локальные (неподписанные магазином Overwolf) `.opk` файлы при двойном клике отклоняются клиентом Overwolf с сообщением *"This is an unverified version of the app"* из-за отсутствия серверной подписи `_metadata/verified_contents.json`.
> Для локального запуска и разработки используйте **Load unpacked extension** (выбрав папку `quicktype-overlay`). Подписанный пакет становится доступен после прохождения ревью в [Overwolf Developer Console](https://dev.overwolf.com/).
