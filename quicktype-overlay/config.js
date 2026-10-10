/**
 * Конфигурация и утилиты универсального REST Overlay — QuickType
 */
var CONFIG_KEY = 'quicktype_overlay_config';

var DEFAULT_CONFIG = {
  apiUrl: 'http://127.0.0.1:10101/v1/speech',
  httpMethod: 'POST',
  headers: JSON.stringify({
    'Content-Type': 'application/json'
  }, null, 2),
  payloadTemplate: JSON.stringify({
    text: '{text}'
  }, null, 2),
  overlayWidth: 640,
  overlayHeight: 180,
  closeOnSubmit: true,
  clearOnSubmit: true,
  closeOnEscape: true
};

function loadOverlayConfig() {
  try {
    var raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return Object.assign({}, DEFAULT_CONFIG);
    var parsed = JSON.parse(raw);
    return Object.assign({}, DEFAULT_CONFIG, parsed);
  } catch (e) {
    console.error('Ошибка загрузки конфига:', e);
    return Object.assign({}, DEFAULT_CONFIG);
  }
}

function saveOverlayConfig(config) {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    return true;
  } catch (e) {
    console.error('Ошибка сохранения конфига:', e);
    return false;
  }
}

function isLoopbackAddress(targetUrl) {
  try {
    var u = new URL(targetUrl);
    return u.hostname === '127.0.0.1' || u.hostname === 'localhost' || u.hostname === '::1';
  } catch (_) {
    return targetUrl.includes('127.0.0.1') || targetUrl.includes('localhost');
  }
}

/**
 * Подготовка и отправка HTTP-запроса на основе конфигурации и введенного текста
 */
async function executeRestRequest(config, inputText) {
  var url = (config.apiUrl || '').trim();
  if (!url) {
    throw new Error('URL эндпоинта не задан');
  }

  var method = (config.httpMethod || 'POST').toUpperCase();
  var parsedHeaders = {};

  if (config.headers) {
    try {
      parsedHeaders = JSON.parse(config.headers);
    } catch (e) {
      throw new Error('Некорректный JSON в заголовках (Headers): ' + e.message);
    }
  }

  var bodyString = '';
  if (method === 'GET') {
    // Для GET подставляем {text} в URL, либо добавляем ?text=... если плейсхолдера нет
    if (url.includes('{text}')) {
      url = url.replace(/\{text\}/g, encodeURIComponent(inputText));
    } else {
      var delimiter = url.includes('?') ? '&' : '?';
      url = url + delimiter + 'text=' + encodeURIComponent(inputText);
    }
  } else {
    // Для POST, PUT, PATCH подставляем в тело
    var template = config.payloadTemplate || '{"text": "{text}"}';
    
    // Безопасная подстановка: экранируем спецсимволы в строке перед подстановкой в JSON
    var escapedText = JSON.stringify(inputText).slice(1, -1);
    bodyString = template.replace(/\{text\}/g, escapedText);

    // Проверяем валидность JSON, если Content-Type это application/json
    var contentType = parsedHeaders['Content-Type'] || parsedHeaders['content-type'] || '';
    if (contentType.includes('application/json')) {
      try {
        JSON.parse(bodyString);
      } catch (jsonErr) {
        throw new Error('Сформированное тело запроса не является валидным JSON: ' + jsonErr.message);
      }
    }
  }

  var isLoopback = isLoopbackAddress(url);

  // Способ 1: Нативный Overwolf Web API (для localhost/127.0.0.1 обходит ограничения CORS браузера)
  if (typeof overwolf !== 'undefined' && overwolf.web && typeof overwolf.web.sendHttpRequest === 'function' && isLoopback) {
    var headerList = [];
    for (var hKey in parsedHeaders) {
      if (Object.prototype.hasOwnProperty.call(parsedHeaders, hKey)) {
        headerList.push({ key: hKey, value: String(parsedHeaders[hKey]) });
      }
    }

    var owStartTime = performance.now();
    try {
      var owResult = await new Promise(function (resolve) {
        overwolf.web.sendHttpRequest(
          url,
          method,
          headerList,
          method === 'GET' ? '' : (bodyString || ''),
          function (res) {
            resolve(res);
          }
        );
      });

      var owDuration = Math.round(performance.now() - owStartTime);
      if (owResult) {
        var statusCode = typeof owResult.statusCode === 'number' ? owResult.statusCode : 0;
        var isOk = (owResult.success !== false) && statusCode >= 200 && statusCode < 300;
        var resBody = typeof owResult.data === 'string' ? owResult.data : '';
        var errDetail = null;

        if (!isOk) {
          if (statusCode === 0) {
            var portMatch = url.match(/:(\d+)/);
            var portInfo = portMatch ? (' (порт ' + portMatch[1] + ')') : '';
            errDetail = 'Не удалось подключиться к серверу по адресу ' + url + '.\n' +
              'Проверьте, запущен ли Skald / TTSBard' + portInfo + ' и включён ли input-сервер в его настройках.';
          } else {
            errDetail = owResult.error || owResult.reason || owResult.status || ('Сервер вернул ошибку HTTP ' + statusCode);
          }
        }

        return {
          ok: isOk,
          status: statusCode,
          statusText: isOk ? 'OK' : (owResult.status || 'Error'),
          durationMs: owDuration,
          body: resBody,
          error: errDetail,
          source: 'Overwolf Native API'
        };
      }
    } catch (owErr) {
      console.warn('[QuickType] overwolf.web.sendHttpRequest exception, fallback to fetch:', owErr);
    }
  }

  // Способ 2: Стандартный fetch (для внешних URL, вебхуков или тестирования в браузере)
  var options = {
    method: method,
    headers: parsedHeaders
  };
  if (method !== 'GET') {
    options.body = bodyString;
  }

  var startTime = performance.now();
  try {
    var response = await fetch(url, options);
    var duration = Math.round(performance.now() - startTime);

    var responseText = '';
    try {
      responseText = await response.text();
    } catch (_) {}

    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      durationMs: duration,
      body: responseText,
      error: response.ok ? null : ('Сервер вернул HTTP ' + response.status + (response.statusText ? ' ' + response.statusText : '')),
      source: 'Fetch API'
    };
  } catch (err) {
    var failDuration = Math.round(performance.now() - startTime);
    var diagnostic = err.message || 'Ошибка сети';

    var isFetchFail = err.name === 'TypeError' ||
      (err.message && (err.message.toLowerCase().includes('fetch') || err.message.toLowerCase().includes('network')));

    if (isFetchFail) {
      if (isLoopback) {
        diagnostic = 'Сбой запроса к локальному серверу (' + url + ').\n\n' +
          'Возможные причины:\n' +
          '1. Сервер Skald / TTSBard не запущен или порт закрыт.\n' +
          '2. Браузер заблокировал кросс-доменный запрос (CORS). Для локальных вызовов без CORS запустите оверлей через Overwolf с разрешением Web.';
      } else {
        diagnostic = 'Сбой сети или блокировка CORS при запросе к ' + url + '.\n\n' +
          'Сервер недоступен, адрес некорректен или эндпоинт запрещает кросс-доменные запросы от оверлея.';
      }
    }

    return {
      ok: false,
      status: 0,
      statusText: 'Network Error',
      durationMs: failDuration,
      body: '',
      error: diagnostic,
      source: 'Fetch API'
    };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DEFAULT_CONFIG: DEFAULT_CONFIG,
    loadOverlayConfig: loadOverlayConfig,
    saveOverlayConfig: saveOverlayConfig,
    executeRestRequest: executeRestRequest
  };
}
