(function (TB) {
  "use strict";

  var FONT = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Noto Sans CJK JP", "Yu Gothic", "WenQuanYi Micro Hei", "Droid Sans Fallback", sans-serif';
  var DISPLAY = '"Iowan Old Style", Palatino, "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif CJK JP", Georgia, "WenQuanYi Micro Hei", serif';

  function fileBase(title) {
    var name = (title || "").trim() || "tierboard";
    return name.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 80);
  }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  function roundRect(ctx, x, y, w, h, r) {
    var radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function wrapText(ctx, text, maxWidth, maxLines) {
    var chars = Array.from(text || "");
    var lines = [];
    var current = "";
    var index = 0;
    while (index < chars.length && lines.length < maxLines) {
      var next = current + chars[index];
      if (current && ctx.measureText(next).width > maxWidth) {
        lines.push(current);
        current = "";
        continue;
      }
      current = next;
      index += 1;
    }
    if (current && lines.length < maxLines) lines.push(current);
    if (index < chars.length && lines.length) {
      var last = lines[lines.length - 1];
      while (last && ctx.measureText(last + "…").width > maxWidth) last = Array.from(last).slice(0, -1).join("");
      lines[lines.length - 1] = (last || "") + "…";
    }
    return lines.length ? lines : [""];
  }

  function loadImage(src) {
    return new Promise(function (resolve) {
      var image = new Image();
      image.onload = function () { resolve(image); };
      image.onerror = function () { resolve(null); };
      image.src = src;
    });
  }

  function itemBox(ctx, item) {
    if (item.image) return { w: 104, h: item.label ? 132 : 104 };
    ctx.font = "700 18px " + FONT;
    var lines = wrapText(ctx, item.label, 136, 3);
    var widest = lines.reduce(function (max, line) { return Math.max(max, ctx.measureText(line).width); }, 0);
    return {
      w: Math.max(88, Math.min(168, Math.ceil(widest) + 28)),
      h: Math.max(84, lines.length * 24 + 24),
      lines: lines
    };
  }

  function flowItems(ctx, items, maxWidth) {
    var gap = 10;
    var x = 0;
    var y = 0;
    var rowH = 0;
    var placed = items.map(function (item) {
      var box = itemBox(ctx, item);
      if (x > 0 && x + box.w > maxWidth) {
        x = 0;
        y += rowH + gap;
        rowH = 0;
      }
      var entry = { item: item, x: x, y: y, w: box.w, h: box.h, lines: box.lines || null };
      x += box.w + gap;
      rowH = Math.max(rowH, box.h);
      return entry;
    });
    return { placed: placed, height: placed.length ? y + rowH : 0 };
  }

  function downloadJson(board) {
    TB.store.flush();
    var payload = {
      version: 1,
      board: {
        title: board.title,
        tiers: board.tiers.map(function (tier) {
          return { id: tier.id, label: tier.label, color: tier.color };
        }),
        items: board.items.map(function (item) {
          return { id: item.id, tierId: item.tierId, label: item.label, image: item.image };
        })
      }
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    downloadBlob(blob, fileBase(TB.store.displayTitle(board)) + ".json");
  }

  function parseImport(text) {
    var data = JSON.parse(String(text).replace(/^\uFEFF/, ""));
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.boards)) return data.boards;
    if (data && data.board) return [data.board];
    if (data && (Array.isArray(data.tiers) || Array.isArray(data.items))) return [data];
    throw new Error("format");
  }

  async function downloadPng(board) {
    TB.store.flush();
    var images = new Map();
    await Promise.all(board.items.filter(function (item) { return item.image; }).map(async function (item) {
      images.set(item.id, await loadImage(item.image));
    }));

    var measure = document.createElement("canvas").getContext("2d");
    var width = 1280;
    var pad = 40;
    var labelW = 168;
    var innerW = width - pad * 2 - labelW - 28;
    var title = TB.store.displayTitle(board);
    measure.font = "700 42px " + DISPLAY;
    var titleLines = wrapText(measure, title, width - pad * 2, 2);
    var titleH = titleLines.length * 50;
    var sections = [];
    var y = pad + titleH + 18;

    board.tiers.forEach(function (tier) {
      var items = board.items.filter(function (item) { return item.tierId === tier.id; });
      var flow = flowItems(measure, items, innerW);
      var height = Math.max(108, flow.height + 24);
      sections.push({ type: "tier", tier: tier, flow: flow, y: y, height: height });
      y += height + 10;
    });

    var poolItems = board.items.filter(function (item) { return !item.tierId; });
    if (poolItems.length) {
      y += 18;
      var poolFlow = flowItems(measure, poolItems, width - pad * 2 - 24);
      var poolH = poolFlow.height + 58;
      sections.push({ type: "pool", flow: poolFlow, y: y, height: poolH });
      y += poolH;
    }
    y += 42;

    var scale = y * 2 > 16384 ? Math.max(1, Math.floor(16384 / y)) : 2;
    var canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(y * scale);
    var ctx = canvas.getContext("2d");
    ctx.scale(scale, scale);
    ctx.fillStyle = "#f4eee4";
    ctx.fillRect(0, 0, width, y);
    ctx.fillStyle = "#1c1917";
    ctx.textBaseline = "top";
    ctx.font = "700 42px " + DISPLAY;
    titleLines.forEach(function (line, index) {
      ctx.fillText(line, pad, pad + index * 50);
    });

    sections.forEach(function (section) {
      if (section.type === "pool") {
        ctx.fillStyle = "#6f675e";
        ctx.font = "800 18px " + FONT;
        ctx.fillText("未分類", pad, section.y);
        drawItems(ctx, section.flow, pad + 12, section.y + 36, images);
        return;
      }
      var rowX = pad;
      var rowY = section.y;
      var rowW = width - pad * 2;
      ctx.save();
      roundRect(ctx, rowX, rowY, rowW, section.height, 14);
      ctx.clip();
      ctx.fillStyle = "#fffdfb";
      ctx.fillRect(rowX, rowY, rowW, section.height);
      ctx.fillStyle = section.tier.color;
      ctx.fillRect(rowX, rowY, labelW, section.height);
      ctx.fillStyle = TB.palette.inkFor(section.tier.color);
      var labelSize = Array.from(section.tier.label || "").length <= 1 ? 52 : Array.from(section.tier.label || "").length === 2 ? 36 : 22;
      ctx.font = "800 " + labelSize + "px " + FONT;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      var labelLines = wrapText(ctx, section.tier.label || " ", labelW - 20, 3);
      var labelBlock = labelLines.length * (labelSize + 4);
      labelLines.forEach(function (line, index) {
        ctx.fillText(line, rowX + labelW / 2, rowY + section.height / 2 - labelBlock / 2 + index * (labelSize + 4) + labelSize / 2);
      });
      ctx.restore();
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.strokeStyle = "#eadfce";
      ctx.lineWidth = 2;
      roundRect(ctx, rowX, rowY, rowW, section.height, 14);
      ctx.stroke();
      drawItems(ctx, section.flow, rowX + labelW + 14, rowY + 12, images);
    });

    ctx.fillStyle = "#8a8176";
    ctx.font = "700 14px " + FONT;
    ctx.textAlign = "right";
    ctx.fillText("TierBoard", width - pad, y - 28);

    var blob = await new Promise(function (resolve) { canvas.toBlob(resolve, "image/png"); });
    if (!blob) throw new Error("png");
    downloadBlob(blob, fileBase(title) + ".png");
  }

  function drawItems(ctx, flow, originX, originY, images) {
    flow.placed.forEach(function (entry) {
      var x = originX + entry.x;
      var y = originY + entry.y;
      ctx.save();
      roundRect(ctx, x, y, entry.w, entry.h, 10);
      ctx.clip();
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x, y, entry.w, entry.h);
      var image = entry.item.image ? images.get(entry.item.id) : null;
      if (image) {
        var imageH = entry.item.label ? 88 : entry.h;
        ctx.drawImage(image, x, y, entry.w, imageH);
      }
      if (entry.item.label) {
        ctx.fillStyle = "#1c1917";
        ctx.font = "700 " + (entry.item.image ? 13 : 18) + "px " + FONT;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        var lines = entry.lines || wrapText(ctx, entry.item.label, entry.w - 16, entry.item.image ? 2 : 3);
        var lineH = entry.item.image ? 16 : 24;
        var blockH = lines.length * lineH;
        var top = entry.item.image ? y + 88 + (entry.h - 88) / 2 : y + entry.h / 2;
        lines.forEach(function (line, index) {
          ctx.fillText(line, x + entry.w / 2, top - blockH / 2 + index * lineH + lineH / 2);
        });
      }
      ctx.restore();
      ctx.strokeStyle = "rgba(28, 25, 23, 0.12)";
      ctx.lineWidth = 1;
      roundRect(ctx, x, y, entry.w, entry.h, 10);
      ctx.stroke();
    });
  }

  TB.exporter = {
    downloadJson: downloadJson,
    downloadPng: downloadPng,
    parseImport: parseImport
  };
})(window.TierBoard = window.TierBoard || {});
