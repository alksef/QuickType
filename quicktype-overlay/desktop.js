document.addEventListener('DOMContentLoaded', function () {
  // Элементы формы
  var apiUrlInput = document.getElementById('apiUrl');
  var httpMethodSelect = document.getElementById('httpMethod');
  var headersTextarea = document.getElementById('headers');
  var payloadTemplateTextarea = document.getElementById('payloadTemplate');
  // Элементы внешнего вида оверлея
  var overlayOpacityInput = document.getElementById('overlayOpacity');
  var opacityValueSpan = document.getElementById('opacityValue');
  var overlayBgColorInput = document.getElementById('overlayBgColor');
  var showHintsCheckbox = document.getElementById('showHints');
  var btnResetBounds = document.getElementById('btn-reset-bounds');

  var closeOnSubmitCheckbox = document.getElementById('closeOnSubmit');
  var clearOnSubmitCheckbox = document.getElementById('clearOnSubmit');
  var closeOnEscapeCheckbox = document.getElementById('closeOnEscape');
  var saveIndicator = document.getElementById('save-indicator');

  // Тестовые элементы
  var testInput = document.getElementById('testInput');
  var btnTestRequest = document.getElementById('btn-test-request');
  var resultBadge = document.getElementById('resultBadge');
  var resultStatusText = document.getElementById('resultStatusText');
  var testResultBox = document.getElementById('testResultBox');
  var resultBoxTitle = document.getElementById('resultBoxTitle');
  var resultBoxMeta = document.getElementById('resultBoxMeta');
  var resultBoxBody = document.getElementById('resultBoxBody');
  var btnCloseResult = document.getElementById('btn-close-result');

  // Загружаем текущий конфиг
  var currentConfig = loadOverlayConfig();
  populateForm(currentConfig);

  function populateForm(cfg) {
    apiUrlInput.value = cfg.apiUrl || '';
    httpMethodSelect.value = (cfg.httpMethod || 'POST').toUpperCase();
    headersTextarea.value = cfg.headers || '';
    payloadTemplateTextarea.value = cfg.payloadTemplate || '';
    
    var opVal = cfg.overlayOpacity != null ? cfg.overlayOpacity : 90;
    overlayOpacityInput.value = opVal;
    if (opacityValueSpan) opacityValueSpan.textContent = opVal + '%';

    overlayBgColorInput.value = cfg.overlayBgColor || '#0e0e12';
    showHintsCheckbox.checked = cfg.showHints !== false;

    closeOnSubmitCheckbox.checked = cfg.closeOnSubmit !== false;
    clearOnSubmitCheckbox.checked = cfg.clearOnSubmit !== false;
    closeOnEscapeCheckbox.checked = cfg.closeOnEscape !== false;
  }

  function readForm() {
    return {
      apiUrl: apiUrlInput.value.trim(),
      httpMethod: httpMethodSelect.value,
      headers: headersTextarea.value.trim(),
      payloadTemplate: payloadTemplateTextarea.value.trim(),
      overlayOpacity: parseInt(overlayOpacityInput.value, 10) || 90,
      overlayBgColor: overlayBgColorInput.value || '#0e0e12',
      showHints: showHintsCheckbox.checked,
      closeOnSubmit: closeOnSubmitCheckbox.checked,
      clearOnSubmit: clearOnSubmitCheckbox.checked,
      closeOnEscape: closeOnEscapeCheckbox.checked
    };
  }

  function emitLiveConfig() {
    var cfg = readForm();
    currentConfig = Object.assign({}, currentConfig, cfg);
    if (typeof overwolf !== 'undefined') {
      overwolf.windows.sendMessage('background', 'preview_config', {
        overlayOpacity: cfg.overlayOpacity, overlayBgColor: cfg.overlayBgColor, showHints: cfg.showHints
      }, function () {});
    }
  }

  // Интерактивное обновление ползунка прозрачности
  overlayOpacityInput.addEventListener('input', function () {
    if (opacityValueSpan) opacityValueSpan.textContent = overlayOpacityInput.value + '%';
    emitLiveConfig();
  });

  // Интерактивное обновление цвета фона
  overlayBgColorInput.addEventListener('input', function () {
    emitLiveConfig();
  });

  // Пресеты тем
  document.querySelectorAll('.theme-chip').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var col = btn.getAttribute('data-color');
      var op = btn.getAttribute('data-opacity');
      if (col) overlayBgColorInput.value = col;
      if (op) {
        overlayOpacityInput.value = op;
        if (opacityValueSpan) opacityValueSpan.textContent = op + '%';
      }
      emitLiveConfig();
    });
  });

  // Тумблер подсказок
  showHintsCheckbox.addEventListener('change', function () {
    emitLiveConfig();
  });

  // Кнопка сброса положения и размера окна
  if (btnResetBounds) {
    btnResetBounds.addEventListener('click', function () {
      currentConfig.overlayBounds = null;
      currentConfig.overlayWidth = 640;
      currentConfig.overlayHeight = 180;
      updateOverlayConfig({ overlayBounds: null, overlayWidth: 640, overlayHeight: 180 });

      if (typeof overwolf !== 'undefined') {
        overwolf.windows.sendMessage('background', 'reset_bounds', {}, function () {});
      }
      showStatus('Положение окна сброшено (640×180 по умолчанию)', true);
    });
  }

  // Сохранение настроек
  document.getElementById('btn-save').addEventListener('click', function () {
    var cfg = readForm();

    if (cfg.headers) {
      try {
        parseRequestHeaders(cfg.headers);
      } catch (e) {
        showStatus('Ошибка в JSON заголовков: ' + e.message, false);
        return;
      }
    }

    currentConfig = Object.assign({}, loadOverlayConfig(), cfg);
    var success = updateOverlayConfig(cfg);
    if (success) {
      showStatus('Сохранено!', true);
      if (typeof overwolf !== 'undefined') {
        overwolf.windows.sendMessage('background', 'config_updated', currentConfig, function () {});
      }
    } else {
      showStatus('Ошибка сохранения', false);
    }
  });

  function showStatus(msg, isSuccess) {
    saveIndicator.textContent = msg;
    saveIndicator.className = 'save-toast ' + (isSuccess ? 'success' : 'error');
    setTimeout(function () {
      saveIndicator.textContent = '';
    }, 4000);
  }

  function formatResponseBody(text) {
    if (!text) return '';
    try {
      var obj = JSON.parse(text);
      return JSON.stringify(obj, null, 2);
    } catch (_) {
      return text;
    }
  }

  // Тест REST-запроса
  async function performTest() {
    if (btnTestRequest.disabled) return;
    var cfg = readForm();
    var text = testInput.value.trim();

    btnTestRequest.disabled = true;
    resultBadge.textContent = 'Отправка...';
    resultBadge.className = 'badge sending';
    resultStatusText.textContent = 'Отправка на ' + (cfg.apiUrl || '...') + '...';
    resultStatusText.className = 'status-detail info';
    if (testResultBox) testResultBox.style.display = 'none';

    try {
      var res = await executeRestRequest(cfg, text);
      btnTestRequest.disabled = false;

      if (res.ok) {
        resultBadge.textContent = 'HTTP ' + res.status;
        resultBadge.className = 'badge success';
        resultStatusText.textContent = 'Запрос успешно выполнен (' + res.durationMs + ' мс)';
        resultStatusText.className = 'status-detail success';

        if (testResultBox) {
          testResultBox.style.display = 'block';
          testResultBox.className = 'test-result-box success';
          resultBoxTitle.textContent = 'Ответ сервера (HTTP ' + res.status + '):';
          resultBoxMeta.textContent = res.durationMs + ' мс';
          resultBoxBody.textContent = res.body ? formatResponseBody(res.body) : '(Запрос успешно принят сервером, тело ответа пустое)';
        }
      } else {
        resultBadge.textContent = res.status ? ('HTTP ' + res.status) : 'Сбой';
        resultBadge.className = 'badge error';
        resultStatusText.textContent = res.status ? ('Ошибка сервера: HTTP ' + res.status) : 'Не удалось связаться с сервером';
        resultStatusText.className = 'status-detail error';

        if (testResultBox) {
          testResultBox.style.display = 'block';
          testResultBox.className = 'test-result-box error';
          resultBoxTitle.textContent = res.status ? ('Ответ сервера (HTTP ' + res.status + '):') : 'Причина сбоя:';
          resultBoxMeta.textContent = res.durationMs ? (res.durationMs + ' мс') : '';

          var detailsText = '';
          if (res.body) {
            detailsText = formatResponseBody(res.body);
          }
          if (res.error) {
            detailsText = detailsText ? (detailsText + '\n\n' + res.error) : res.error;
          }
          resultBoxBody.textContent = detailsText || 'Сервер не вернул деталей ошибки.';
        }
      }
    } catch (err) {
      btnTestRequest.disabled = false;
      resultBadge.textContent = 'Ошибка';
      resultBadge.className = 'badge error';
      resultStatusText.textContent = 'Исключение: ' + err.message;
      resultStatusText.className = 'status-detail error';

      if (testResultBox) {
        testResultBox.style.display = 'block';
        testResultBox.className = 'test-result-box error';
        resultBoxTitle.textContent = 'Ошибка выполнения:';
        resultBoxMeta.textContent = '';
        resultBoxBody.textContent = err.stack || err.message;
      }
    }
  }

  btnTestRequest.addEventListener('click', performTest);

  testInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      performTest();
    }
  });

  if (btnCloseResult) {
    btnCloseResult.addEventListener('click', function () {
      if (testResultBox) testResultBox.style.display = 'none';
      if (resultBadge) {
        resultBadge.textContent = 'Готов к тесту';
        resultBadge.className = 'badge';
      }
      if (resultStatusText) {
        resultStatusText.textContent = '';
        resultStatusText.className = 'status-detail';
      }
    });
  }

  // Управление окном настроек (Minimize / Close / Drag)
  var btnWindowMinimize = document.getElementById('btnWindowMinimize');
  var btnWindowClose = document.getElementById('btnWindowClose');
  var windowTitlebar = document.getElementById('windowTitlebar');

  if (btnWindowMinimize) {
    btnWindowMinimize.addEventListener('click', function () {
      if (typeof overwolf !== 'undefined' && overwolf.windows) {
        overwolf.windows.getCurrentWindow(function (res) {
          if (res && res.success) {
            overwolf.windows.minimize(res.window.id, function () {});
          }
        });
      }
    });
  }

  if (btnWindowClose) {
    btnWindowClose.addEventListener('click', function () {
      if (typeof overwolf !== 'undefined' && overwolf.windows) {
        overwolf.windows.getCurrentWindow(function (res) {
          if (res && res.success) {
            overwolf.windows.close(res.window.id, function () {});
          }
        });
      } else {
        window.close();
      }
    });
  }

  if (windowTitlebar) {
    windowTitlebar.addEventListener('mousedown', function (e) {
      if (e.target && e.target.closest && e.target.closest('.window-control-btn')) return;
      if (e.button !== 0) return;
      if (typeof overwolf !== 'undefined' && overwolf.windows) {
        overwolf.windows.getCurrentWindow(function (res) {
          if (res && res.success) {
            overwolf.windows.dragMove(res.window.id, function () {});
          }
        });
      }
    });
  }
});
