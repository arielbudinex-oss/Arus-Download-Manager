(function () {
  'use strict';

  var STATIC_PAYLOAD = '00020101021126610016ID.CO.SHOPEE.WWW01189360091800239476710208239476710303UMI51440014ID.CO.QRIS.WWW0215ID10266189866770303UMI5204581753033605802ID5905Xinet6009SUKOHARJO61055755862070703A016304B3A0';
  var MERCHANT = {
    name: 'XINET - SOFTWARE',
    nmid: 'ID1026618986677',
    terminal: 'A01'
  };
  var MIN = 1000;
  var MAX = 50000000;

  function crc16(text) {
    var crc = 0xffff;
    for (var i = 0; i < text.length; i += 1) {
      crc ^= text.charCodeAt(i) << 8;
      for (var bit = 0; bit < 8; bit += 1) {
        crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
      }
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
  }

  function parseTlv(payload) {
    var tags = [];
    var index = 0;
    while (index < payload.length) {
      var tag = payload.slice(index, index + 2);
      var length = parseInt(payload.slice(index + 2, index + 4), 10);
      if (!/^\d{2}$/.test(tag) || Number.isNaN(length)) {
        throw new Error('Payload QRIS tidak valid');
      }
      tags.push({ tag: tag, value: payload.slice(index + 4, index + 4 + length) });
      index += 4 + length;
    }
    return tags;
  }

  function buildDynamic(amount) {
    var value = Math.round(Number(amount));
    if (!Number.isFinite(value) || value < MIN || value > MAX) {
      throw new RangeError('Nominal di luar batas');
    }
    var body = STATIC_PAYLOAD.replace(/6304[0-9A-F]{4}$/i, '');
    var tags = parseTlv(body).filter(function (entry) { return entry.tag !== '54'; });
    var amountEntry = { tag: '54', value: String(value) };
    var insertAt = tags.findIndex(function (entry) { return Number(entry.tag) > 54; });
    if (insertAt === -1) tags.push(amountEntry);
    else tags.splice(insertAt, 0, amountEntry);
    var rebuilt = tags.map(function (entry) {
      return entry.tag + String(entry.value.length).padStart(2, '0') + entry.value;
    }).join('') + '6304';
    return rebuilt + crc16(rebuilt);
  }

  function svgFor(amount) {
    if (typeof qrcode !== 'function') {
      throw new Error('Pustaka QR belum dimuat');
    }
    var payload = buildDynamic(amount);
    var qr = qrcode(0, 'M');
    qr.addData(payload);
    qr.make();
    return qr.createSvgTag({
      cellSize: 8,
      margin: 0,
      scalable: true,
      alt: 'QRIS ' + MERCHANT.name + ' nominal Rp ' + new Intl.NumberFormat('id-ID').format(amount)
    });
  }

  function render(container, amount) {
    if (!container) return null;
    var svg = svgFor(amount);
    container.innerHTML = svg;
    return container.querySelector('svg');
  }

  window.ArusQris = {
    merchant: MERCHANT,
    min: MIN,
    max: MAX,
    staticPayload: STATIC_PAYLOAD,
    buildDynamic: buildDynamic,
    render: render,
    svgFor: svgFor,
    crc16: crc16
  };
})();
