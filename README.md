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
  - `scripts/package-app.ps1` — автоматическая сборка релизного архива (`dist/QuickType-0.2.3.zip`).
  - `scripts/patch-overwolf-gamelist.js` — утилита исправления `GamesList.xml` для игр без видимого курсора.
  - `scripts/gen-icon.ps1` — скрипт генерации PNG-иконки приложения.
- `dist/` — собранные релизные пакеты `.zip` (в `.gitignore`).

## Быстрый старт

### 1. Установка из релиза (ZIP)
1. Скачайте `QuickType-0.2.3.zip` со страницы [Releases](https://github.com/alksef/QuickType/releases) и распакуйте архив.
2. В клиенте Overwolf откройте режим разработчика: `Настройки` -> `О программе` (About) -> кликните 10 раз по номеру версии (или войдите в аккаунт с правами разработчика).
3. Перейдите в `Пакетирование` (Packages) / `Development Options` -> нажмите **Load unpacked extension**.
4. Выберите распакованную папку `quicktype-overlay`.
5. Приложение запустится и появится в доке Overwolf.

### 2. Сборка из исходников
Запустите PowerShell скрипт в корне репозитория:
```powershell
.\scripts\package-app.ps1
```
Готовый дистрибутив будет собран в `dist/QuickType-0.2.3.zip`.
