document.addEventListener('DOMContentLoaded', function () {
  var inputField = document.getElementById('inputText');
  var statusBadge = document.getElementById('hudStatus');
  var hudDrag = document.getElementById('hudDrag');

  var config = loadOverlayConfig();
  var windowActivatedTime = 0;
  var focusTimers = [];

  function setStatus(text, type) {
    statusBadge.textContent = text;
    statusBadge.className = 'hud-status ' + (type || '');
  }

  function focusField() {
    if (!inputField) return;
    inputField.focus();
    try {
      var len = inputField.value.length;
      inputField.setSelectionRange(len, len);
    } catch (_) {}
  }

  function requestAggressiveFocus() {
    focusTimers.forEach(clearTimeout);
    focusTimers = [0, 20, 50, 100, 200, 400].map(function (delay) {
      return setTimeout(function () {
        focusField();
      }, delay);
    });
  }

  function onWindowActivated() {
    windowActivatedTime = Date.now();
    // Очищаем поле при открытии
    inputField.value = '';
    requestAggressiveFocus();

    // Защита от утечки символа хоткея (например, "\"):
    // Если символ нажатого хоткея всё же попал в поле в первые 150 мс — удаляем его
    setTimeout(function () {
      if (Date.now() - windowActivatedTime < 300) {
        if (inputField.value.length === 1) {
          inputField.value = '';
        }
      }
    }, 80);
  }

  // Захват фокуса при открытии
  if (typeof overwolf !== 'undefined') {
    overwolf.windows.onMessageReceived.addListener(function (message) {
      if (message.id === 'focus_input_field') {
        onWindowActivated();
      } else if (message.id === 'config_updated') {
        config = loadOverlayConfig();
      } else if (message.id === 'rest_result') {
        if (message.content && message.content.ok) {
          setStatus('Отправлено', 'success');
        } else {
          setStatus('Ошибка', 'error');
        }
        setTimeout(function () {
          setStatus('Готов', '');
        }, 3000);
      }
    });

    if (hudDrag) {
      hudDrag.addEventListener('mousedown', function () {
        overwolf.windows.getCurrentWindow(function (res) {
          if (res.success) {
            overwolf.windows.dragMove(res.window.id);
          }
        });
      });
    }
  }

  // Дублирование фокуса при системных событиях окна
  window.addEventListener('focus', function () {
    onWindowActivated();
  });
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) {
      onWindowActivated();
    }
  });

  // Первичная активация фокуса
  onWindowActivated();

  // Блокируем попадание символа хоткея в первые 120 мс после активации окна
  inputField.addEventListener('beforeinput', function (event) {
    if (Date.now() - windowActivatedTime < 120) {
      event.preventDefault();
    }
  });

  inputField.addEventListener('input', function () {
    if (Date.now() - windowActivatedTime < 120) {
      inputField.value = '';
    }
  });

  // Обработка клавиатуры
  inputField.addEventListener('keydown', function (event) {
    // В первые 120 мс блокируем символ хоткея от попадания в поле
    if (Date.now() - windowActivatedTime < 120) {
      if (event.key !== 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
    }

    // 1. Обработка ESCAPE — отмена и мгновенное скрытие
    if (event.key === 'Escape' || event.code === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setStatus('Отмена', '');
      hideOverlay();
      return;
    }

    // 2. Обработка ENTER — подтверждение и отправка
    if (event.key === 'Enter' || event.code === 'Enter') {
      if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey || 
          event.isComposing || event.keyCode === 229 || event.repeat) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      var text = inputField.value.trim();
      if (!text) {
        hideOverlay();
        return;
      }

      setStatus('Отправка...', 'sending');

      // Передаем текст в фоновый контроллер для выполнения REST запроса
      if (typeof overwolf !== 'undefined') {
        overwolf.windows.sendMessage('background', 'submit_text', { text: text }, function () {});
      } else {
        executeRestRequest(config, text)
          .then(function (res) {
            setStatus(res.ok ? 'Успех ' + res.status : 'Ошибка ' + res.status, res.ok ? 'success' : 'error');
          })
          .catch(function (err) {
            setStatus('Сбой: ' + err.message, 'error');
          });
      }

      if (config.clearOnSubmit !== false) {
        inputField.value = '';
      }

      if (config.closeOnSubmit !== false) {
        hideOverlay();
      }
    }
  });

  function hideOverlay() {
    if (typeof overwolf !== 'undefined') {
      overwolf.windows.sendMessage('background', 'hide_overlay', {}, function () {});
    }
  }
});
