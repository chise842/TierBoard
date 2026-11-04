(function (TB) {
  "use strict";

  var MAX_BYTES = 12 * 1024 * 1024;
  var MAX_EDGE = 360;

  function fail(message) {
    var error = new Error(message);
    error.name = "ImageReadError";
    return error;
  }

  function isRaster(file) {
    if (/^image\/(png|jpe?g|gif|webp|bmp|avif)$/i.test(file.type)) return true;
    return /\.(png|jpe?g|gif|webp|bmp|avif)$/i.test(file.name || "");
  }

  function encodeImage(canvas, file) {
    var preferPng = /png|webp|gif|avif|bmp/i.test(file.type) || /\.(png|webp|gif|avif|bmp)$/i.test(file.name || "");
    var png = canvas.toDataURL("image/png");
    if (preferPng && png.length <= 450000) return png;
    var target = canvas;
    if (preferPng) {
      target = document.createElement("canvas");
      target.width = canvas.width;
      target.height = canvas.height;
      var ctx = target.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, target.width, target.height);
      ctx.drawImage(canvas, 0, 0);
    }
    return target.toDataURL("image/jpeg", 0.86);
  }

  function readFile(file) {
    if (!file || !isRaster(file)) return Promise.reject(fail("画像ファイルを選んでください。"));
    if (file.size > MAX_BYTES) return Promise.reject(fail("画像が大きすぎます（12MB以下）。"));
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var image = new Image();
      image.onload = function () {
        if (!image.width || !image.height) {
          URL.revokeObjectURL(url);
          reject(fail("この画像は読み込めませんでした。"));
          return;
        }
        var scale = Math.min(1, MAX_EDGE / Math.max(image.width, image.height));
        var width = Math.max(1, Math.round(image.width * scale));
        var height = Math.max(1, Math.round(image.height * scale));
        var canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        var ctx = canvas.getContext("2d");
        ctx.drawImage(image, 0, 0, width, height);
        URL.revokeObjectURL(url);
        resolve(encodeImage(canvas, file));
      };
      image.onerror = function () {
        URL.revokeObjectURL(url);
        reject(fail("この画像は読み込めませんでした。"));
      };
      image.src = url;
    });
  }

  TB.images = { fromFile: readFile };
})(window.TierBoard = window.TierBoard || {});
