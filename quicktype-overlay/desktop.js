document.addEventListener('DOMContentLoaded', function () {
  // Элементы формы
  var apiUrlInput = document.getElementById('apiUrl');
  var httpMethodSelect = document.getElementById('httpMethod');
  var headersTextarea = document.getElementById('headers');
  var payloadTemplateTextarea = document.getElementById('payloadTemplate');
  var overlayWidthInput = document.getElementById('overlayWidth');
  var overlayHeightInput = document.getElementById('overlayHeight');
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

  // Управление окном Overwolf (если присутствуют кастомные кнопки)
  var btnMinimize = document.getElementById('btn-minimize');
  var btnClose = document.getElementById('btn-close');

  if (typeof overwolf !== 'undefined') {
    if (btnMinimize) {
      btnMinimize.addEventListener('click', function () {
        overwolf.windows.getCurrentWindow(function (res) {
          if (res.success) overwolf.windows.minimize(res.window.id);
        });
      });
    }

    if (btnClose) {
      btnClose.addEventListener('click', function () {
        overwolf.windows.getCurrentWindow(function (res) {
          if (res.success) overwolf.windows.close(res.window.id);
        });
      });
    }
  }

  // Загружаем текущий конфиг
  var currentConfig = loadOverlayConfig();
  populateForm(currentConfig);

  function populateForm(cfg) {
    apiUrlInput.value = cfg.apiUrl || '';
    httpMethodSelect.value = (cfg.httpMethod || 'POST').toUpperCase();
    headersTextarea.value = cfg.headers || '';
    payloadTemplateTextarea.value = cfg.payloadTemplate || '';
    overlayWidthInput.value = cfg.overlayWidth || 640;
    overlayHeightInput.value = cfg.overlayHeight || 180;
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
      overlayWidth: parseInt(overlayWidthInput.value, 10) || 640,
      overlayHeight: parseInt(overlayHeightInput.value, 10) || 180,
      closeOnSubmit: closeOnSubmitCheckbox.checked,
      clearOnSubmit: clearOnSubmitCheckbox.checked,
      closeOnEscape: closeOnEscapeCheckbox.checked
    };
  }

  // Пресеты размеров
  document.querySelectorAll('.chip-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      overlayWidthInput.value = btn.getAttribute('data-w');
      overlayHeightInput.value = btn.getAttribute('data-h');
    });
  });

  // Сохранение настроек
  document.getElementById('btn-save').addEventListener('click', function () {
    var cfg = readForm();

    if (cfg.headers) {
      try {
        JSON.parse(cfg.headers);
      } catch (e) {
        showStatus('Ошибка в JSON заголовков: ' + e.message, false);
        return;
      }
    }

    var success = saveOverlayConfig(cfg);
    if (success) {
      showStatus('Сохранено!', true);
      if (typeof overwolf !== 'undefined') {
        overwolf.windows.sendMessage('background', 'config_updated', cfg, function () {});
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


});
