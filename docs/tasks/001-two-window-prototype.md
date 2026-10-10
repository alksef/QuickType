---
id: TASK-001
status: completed
created: 2026-10-10
updated: 2026-10-10
related_roadmap: ["ROADMAP-001"]
---

# TASK-001: Реализация двухоконного прототипа QuickType

## Описание

Разработать архитектуру и компоненты двухоконного приложения **QuickType** для Overwolf:
1. `desktop.html` — главное окно настроек (Endpoint URL, HTTP Method, JSON Template, Headers, геометрия оверлея, кнопка тестирования запроса, сохранение в `localStorage`).
2. `overlay.html` — внутриигровой эксклюзивный оверлей ввода:
   - Автофокус при появлении;
   - Нажатие `Enter` отправляет текст через бэкграунд и закрывает оверлей;
   - Нажатие `Escape` отменяет ввод и закрывает оверлей;
   - Динамический размер окна в соответствии с настройками.
3. `background.html` — координатор:
   - Регистрация и перехват хоткея `toggle_input_form`;
   - Управление окнами (`restore`, `bringToFront`, `requestOverlayFocus`, `minimize`);
   - Выполнение асинхронных HTTP-запросов к настроенному REST API;
   - Обновление размеров окна оверлея через `overwolf.windows.changeSize`.
4. Обновление `manifest.json` и скрипта сборки `scripts/package-app.ps1` (`QuickType-0.2.3.zip`).
5. Инициализация Git-репозитория и создание базового `.gitignore`.

## Результат

Прототип полностью реализован и протестирован:
- Рабочая двухоконная модель в директории `quicktype-overlay/`.
- Корректная сборка архива `dist/QuickType-0.2.3.zip`.
- Подтверждена обработка `Escape` и `Enter`.
