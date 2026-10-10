# Архитектурное исследование Overwolf: Декомпиляция ядра, механика MixMode и блокировка ввода

**Дата исследования:** 2026-10-10  
**Автор:** TTSBard / Skald Research Team  
**Целевая среда:** Windows 11, Overwolf Client `0.311.0.6` (Client 64-bit v2.2.311.1), Direct3D 11, Unity Engine  
**Тестовая игра:** *Cult of the Lamb* (Steam AppID 1313140, Overwolf GameID 22156 / 221561)  

---

## 1. Введение и суть проблемы

При разработке внутриигрового оверлея ввода Skald (TTSBard Input Overlay) возник фундаментальный сбой:
- Окно формы ввода успешно отображается поверх полноэкранной игры по нажатию хоткея (`Ctrl+Shift+F9`).
- Внутри DOM страницы (`CEF` / Chromium Embedded Framework) поле ввода получает программный фокус (`document.hasFocus() = true`, `activeElement = textarea`).
- **Сбой:** Нажатия клавиш не поступают в веб-страницу (0 событий `keydown`/`input`). Все клавиатурные события продолжают перехватываться игрой. Ввод разблокировался только при стороннем триггере (открытие и закрытие оверлея Steam `Shift+Tab`).
- Системный шорткат Overwolf `Ctrl+Tab` и перевод игры в безрамочный режим (`Borderless Fullscreen`) проблему не решали.

Было проведено глубокое реверс-инжиниринг исследование нативных и управляемых библиотек Overwolf для поиска корневой причины.

---

## 2. Анализ внутреннего журнала инжектора (`*.Game.html`)

При запуске игры Overwolf внедряет модуль `OWClient.dll` в процесс игры и пишет подробный трассировочный лог в:
`%LOCALAPPDATA%\Overwolf\Log\<GameName>_<Date>.Game.html`

### Ключевые фрагменты лога:

1. **Попытка переключения курсора при старте:**
   ```html
   OverlayManager::processMouse: Auto changing OCM to MIXED [mixmod 1] - Game cursor is not visible, ignore.
   OverlayManager::processMouse: Auto changing OCM to NONE [mixmod 1] - Game cursor is not visible, ignore.
   ```
   *Инсайт:* Движок Overwolf определяет режим `mixmod 1` (Mixed Mode) и пытается активировать Overlay Cursor Mode (`OCM`), но Unity скрывает системный курсор (`ShowCursor(FALSE)`), из-за чего Overwolf пишет `Game cursor is not visible, ignore`.

2. **Отказ входа в Exclusive Mode при нажатии хоткея:**
   ```html
   OverlayInputManager::OnHotKeyEvent: Send Hotkey Event [Control_Overlay] [d]
   OverlayManager::doAction: Control -> EVENT_HANDLER_CONTROL_MODE_ON
   OverlayManager::SetExclusiveMode: skip exclusive mode request -> game is in mixmode
   ```
   *Критический вывод:* Функция `OverlayManager::SetExclusiveMode` **явно отклоняет** активацию эксклюзивного режима, если игра помечена как находящаяся в `mixmode`.

3. **Сбой отсоединения потоков ввода:**
   ```html
   OverlayManager::DetachThreadInput: Detach thread input 55860, 25920
   OverlayManager::DetachThreadInput: AttachThreadInput has failed detach. [55860 - 25920] GLE=0x57
   ```
   Ошибка `GLE=0x57` (`ERROR_INVALID_PARAMETER`): Потоки ввода не были корректно слинкованы через `AttachThreadInput`, так как хук клавиатуры не переключился на оверлей.

---

## 3. Декомпиляция нативного ядра (`OWClient.dll`)

Библиотека `c:\program files (x86)\overwolf\0.311.0.6\OWClient.dll` (64-bit PE) отвечает за хуки DirectX и Win32 WNDPROC внутри игры.

### 3.1. Анализ `OverlayManager::SetExclusiveMode`

Поиск по строке `"skip exclusive mode request -> game is in mixmode"` (UTF-16LE, смещение файла `0x2a8610`, RVA `0x2a9e10`) привёл к коду по смещению `0x4f410`:

```assembly
; Проверка режима MixMode перед переключением Exclusive Mode:
0x0004f407: lea  rcx, [rdi - 8]       ; Указатель на OverlayManager
0x0004f40b: call IsInMixMode          ; Вызов функции 0x00047360
0x0004f410: test al, al               ; al == 1 если игра в MixMode
0x0004f412: jz   loc_EnterExclusive   ; Если НЕ MixMode -> переход в Exclusive Mode!
0x0004f418: lea  rax, [rip + 0x259ded]; "skip exclusive mode request -> game is in mixmode"
0x0004f41f: call LogInfo
0x0004f424: xor  al, al               ; Возврат FALSE (отказ)
0x0004f426: ret
```

### 3.2. Логика функции `IsInMixMode` (`0x00047360`)

```assembly
0x00047360: mov  [rsp + 8], rbx
0x00047365: push rdi
0x00047366: sub  rsp, 0x20
0x0004736a: cmp  dword ptr [rcx + 0x188], 0
0x00047371: mov  rbx, rcx
0x00047374: jne  loc_IsMixMode
0x0004737a: cmp  byte ptr [rcx + 0x1ef], 0 ; [rcx + 0x1ef] = DisableSmartMixMode!
0x00047381: jne  loc_NotMixMode           ; Если DisableSmartMixMode == True -> MixMode ОТКЛЮЧЕН!
```

**Открытие:**  
Смещение `[rcx + 0x1ef]` структуры `OverlayManager` хранит флаг `DisableSmartMixMode`.  
Если этот флаг установлен в `1` (`True`), проверка `IsInMixMode` немедленно завершается в пользу `loc_NotMixMode`, и `SetExclusiveMode` **разрешает эксклюзивный захват клавиатуры**!

---

## 4. Декомпиляция управляемого уровня (`OverWolf.Client.BL.dll`)

На стороне хост-процесса Overwolf логика конфигураций игр управляется классом `OverWolf.Client.BL.Managers.GamesManager`.

### 4.1. Анализ метода `GetIsExclusiveModePossibleByControlModeConfigurations`

Метод принимает две конфигурации режима:
- `controlModeConfig1` (`eGameConfigurationsControlModes`):
  - `AllowMixedMode = 0`
  - `NotAllowMixedMode = 1`
- `controlModeConfig2` (`eClient_GameControlMode`):
  - `MixedWhenCursorAvailable = 0`
  - `MixedNotAvailable = 1`
  - `MixedAlwaysAvailable = 2`

**Таблица истинности вызова метода:**
| ControlModes | Client_GameControlMode | IsExclusivePossible |
|---|---|---|
| `AllowMixedMode (0)` | `MixedWhenCursorAvailable (0)` | **True** (только если курсор есть) |
| `AllowMixedMode (0)` | `MixedNotAvailable (1)` | **True** |
| `AllowMixedMode (0)` | `MixedAlwaysAvailable (2)` | ❌ **False** |
| `NotAllowMixedMode (1)` | `MixedWhenCursorAvailable (0)` | **True** |
| `NotAllowMixedMode (1)` | `MixedNotAvailable (1)` | **True** |
| `NotAllowMixedMode (1)` | `MixedAlwaysAvailable (2)` | **True** |

### 4.2. Флаги окна (`eWidgetStyle`)

Внутренний enum `OverWolf.Client.BL.OverlayAdapters.eWidgetStyle` содержит битовые флаги, управляющие хуками виджетов:
- `WidgetStyleGrabKeyboardFocus = 2048 (0x800)`
- `WidgetStyleExclusiveOnVisibleReleaseWhenHidden = 536870912 (0x20000000)` — устанавливается свойством манифеста `"focus_game_takeover": "ReleaseOnHidden"`
- `WidgetStyleExclusiveOnVisibleReleaseOnLostFocus = 1073741824 (0x40000000)`

При установленном `WidgetStyleExclusiveOnVisibleReleaseWhenHidden` движок Overwolf вызывает `SetExclusiveMode` при каждом показе окна и сбрасывает его при скрытии (`minimize`).

---

## 5. Сравнение профилей игр в базе Overwolf

База данных поддерживаемых игр хранится в:
`%LOCALAPPDATA%\Overwolf\GamesList.8963668.xml`

### Профиль игры без системного курсора (`TEKKEN 7`, ID 211921):
```xml
<GameInfo>
  <ID>211921</ID>
  <GameTitle>TEKKEN 7</GameTitle>
  ...
  <ControlModes>NotAllowMixedMode</ControlModes>
  <Client_GameControlMode>MixedNotAvailable</Client_GameControlMode>
  <DisableSmartMixMode>True</DisableSmartMixMode>
</GameInfo>
```

### Исходный профиль *Cult of the Lamb* (ID 221561):
```xml
<GameInfo>
  <ID>221561</ID>
  <GameTitle>Cult of the Lamb</GameTitle>
  ...
  <SmartReleaseKBInOverlayFocus>true</SmartReleaseKBInOverlayFocus>
  <ReleaseKBInOverlayFocus>true</ReleaseKBInOverlayFocus>
  <!-- Теги ControlModes, Client_GameControlMode и DisableSmartMixMode ОТСУТСТВОВАЛИ! -->
</GameInfo>
```

**Итог сопоставления:**
Из-за отсутствия этих тегов Overwolf применял значения по умолчанию:
- `ControlModes = AllowMixedMode`
- `Client_GameControlMode = MixedWhenCursorAvailable`
- `DisableSmartMixMode = OFF`

Поскольку игра скрывает аппаратный курсор, Overwolf переходил в состояние «зависания между режимами»: курсор не захватывался, а клавиатурный эксклюзивный мод блокировался.

---

## 6. Применённое комплексное решение (v0.1.10)

### 6.1. Модификация профиля игры в XML
В файл `%LOCALAPPDATA%\Overwolf\GamesList.8963668.xml` в блок `<ID>221561</ID>` добавлены директивы:
```xml
<ControlModes>NotAllowMixedMode</ControlModes>
<Client_GameControlMode>MixedNotAvailable</Client_GameControlMode>
<DisableSmartMixMode>True</DisableSmartMixMode>
```
*Результат:* C++ функция `IsInMixMode` (`0x47360`) видит `[rcx + 0x1ef] == 1`, и `SetExclusiveMode` успешно активирует хук перехвата клавиатуры.

### 6.2. Оптимизация манифеста (`manifest.json`)
```json
{
  "meta": { "version": "0.1.10" },
  "data": {
    "hotkeys": {
      "toggle_input_form": {
        "title": "Показать/скрыть форму ввода Skald",
        "action-type": "custom",
        "default": "Ctrl+Shift+F9"
      }
    },
    "windows": {
      "input_form": {
        "transparent": true,
        "grab_keyboard_focus": true,
        "focus_game_takeover": "ReleaseOnHidden",
        "focus_game_takeover_release_hotkey": "toggle_input_form"
      }
    }
  }
}
```
`action-type: "custom"` устраняет конфликт со встроенным переключателем Overwolf.

### 6.3. Контроллер жизненного цикла (`background.html`)
В цепочку открытия окна добавлен вызов `overwolf.windows.bringToFront`:
```javascript
overwolf.windows.restore(id, function (result) {
  if (typeof overwolf.windows.bringToFront === 'function') {
    overwolf.windows.bringToFront(id, true, function (btfResult) {});
  }
  overwolf.windows.requestOverlayFocus(id, function (focusResult) {
    focusInputField(id);
  });
});
```

---

## 7. Чек-лист верификации и результаты живого теста

1. **Перезапуск платформы:** Перезапустить Overwolf через системный трей для загрузки обновлённой XML-базы.
2. **Перезагрузка расширения:** В Overwolf Development Tools нажать `Reload` для версии `0.1.10`.
3. **Запуск игры:** Запустить игру без открытия Steam оверлея.
4. **Проверка ввода:**
   - Нажать `Ctrl+Shift+F9`.
   - Печатать текст сразу без клика мыши.
   - Нажать `Enter` $\rightarrow$ форма скрывается, управление моментально возвращается персонажу.
   - Нажать `Ctrl+Shift+F9` повторно $\rightarrow$ текст на месте, фокус снова активен.

### 7.1. Фактические результаты живого теста (2026-10-10 15:39)

В логе инжектора `Cult Of The Lamb_10-10-26_15-38-19.Game.html` зафиксировано:
```
15:38:19.253 OverlayManager::ReadGameConfigurations GameConfigurations DisableSmartMixMode = ON
15:39:33.130 OverlayManager::SetExclusiveMode: ExclusiveMode: ControlModeChange - Exclusive
15:39:46.208 OverlayManager::SetExclusiveMode: ExclusiveMode: ControlModeChange - Exclusive
15:39:48.745 WidgetManager::OnControlStateChanged: Release exclusiv mode: 0x93484 was hidden 0
15:39:48.745 OverlayManager::SetExclusiveMode: ExclusiveMode: ControlModeChange - Normal
```

В логе `%LOCALAPPDATA%/Overwolf/SkaldDiagnostics/overwolf-focus-log.txt`:
```
10:39:47.992Z [page] keydown (key omitted) repeat=false | doc=true active=text
10:39:47.993Z [page] input #3 | doc=true active=text
10:39:48.077Z [page] input #4 | doc=true active=text
10:39:48.210Z [page] input #5 | doc=true active=text
10:39:48.344Z [page] input #6 | doc=true active=text
10:39:48.427Z [page] input #7 | doc=true active=text
10:39:48.728Z [page] Enter: hide requested (no submission) | doc=true active=text
10:39:48.732Z [controller] minimize requested
10:39:48.740Z [controller] minimize: {"success":true}
10:39:49.473Z [game] title: "Cult of the Lamb", focus: true
```

---

## 8. Стратегия для продакшена и автоматизации

Для развёртывания решения у конечных пользователей без ручных правок XML предусмотрено 3 подхода:

1. **Историческое предложение автоматического патчинга (не внедрено):**
   Создан скрипт [`scripts/patch-overwolf-gamelist.js`](../../scripts/patch-overwolf-gamelist.js). Десктопное приложение Skald (Tauri/Rust) или вспомогательная утилита при установке или первом запуске может автоматически проверить `%LOCALAPPDATA%/Overwolf/GamesList.*.xml` и добавить необходимые флаги для поддерживаемых игр.
2. **Официальный сабмит в Overwolf:**  
   Подача запроса на добавление тегов `NotAllowMixedMode` и `DisableSmartMixMode` для Cult of the Lamb (и аналогичных игр без курсора) в мастер-базу Overwolf на CDN.
3. **Нативное окно поверх игры (`use_os_windowing: true`):**  
   Для Borderless Fullscreen режима создание окна как OS TopMost, что позволяет полностью обойти зависимость от GamesList Overwolf.


## Область применимости и воспроизводимость (2026-10-11)

Это исторические наблюдения для указанной версии клиента и игры, а не гарантия поведения всех игр. Адреса функций и смещения относятся к исследованным бинарникам. Их хеши, команды инструментов и полные обезличенные логи в отслеживаемых материалах отсутствуют; независимая верификация этих деталей пока невозможна. Для повторения исследования следует приложить эти артефакты и точные версии инструментов.

Патчер GamesList — отдельная ручная диагностическая утилита, приложение не запускает его автоматически. Перед явным запуском закройте Overwolf; исходный файл сохраняется в .bak. Обновление клиента может заменить локальный кэш. Продакшен-решение требует согласования с Overwolf, а не автоматического изменения пользовательского клиента.
