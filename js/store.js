(function (TB) {
  "use strict";

  var STORAGE_KEY = "tierboard.v1";
  var ITEM_LIMIT = 300;
  var TIER_LIMIT = 24;
  var DEFAULT_TIERS = [
    { label: "S", color: "#ff7f7f" },
    { label: "A", color: "#ffbf7f" },
    { label: "B", color: "#ffdf7f" },
    { label: "C", color: "#bfff7f" },
    { label: "D", color: "#7fbfff" }
  ];
  var EXTRA_COLORS = ["#7fffff", "#7f7fff", "#ff7fff", "#e7e7e7", "#3f3f46", "#d4a574"];
  var PRESET_COLORS = DEFAULT_TIERS.map(function (tier) { return tier.color; }).concat(EXTRA_COLORS);
  var LETTERS = ["S", "A", "B", "C", "D", "E", "F", "G", "H"];
  var SAMPLES = ["寿司", "ラーメン", "カレー", "パスタ", "サラダ", "餃子"];

  var persistTimer = 0;
  var state = load();

  function uid() {
    if (window.crypto && typeof crypto.randomUUID === "function") return crypto.randomUUID();
    return "id-" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  function validColor(value) {
    return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : null;
  }

  function defaultTiers() {
    return DEFAULT_TIERS.map(function (tier) {
      return { id: uid(), label: tier.label, color: tier.color };
    });
  }

  function createBoard() {
    return {
      id: uid(),
      title: "",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      tiers: defaultTiers(),
      items: []
    };
  }

  function normalizeStored(raw) {
    if (!raw || typeof raw !== "object") return null;
    var tiers = [];
    var seenTiers = {};
    var sourceTiers = Array.isArray(raw.tiers) ? raw.tiers.slice(0, TIER_LIMIT) : [];
    sourceTiers.forEach(function (tier) {
      if (!tier || typeof tier !== "object") return;
      var id = typeof tier.id === "string" && tier.id ? tier.id : uid();
      if (seenTiers[id]) id = uid();
      seenTiers[id] = true;
      tiers.push({
        id: id,
        label: String(tier.label == null ? "" : tier.label).slice(0, 12),
        color: validColor(tier.color) || "#ff7f7f"
      });
    });
    if (!tiers.length) tiers = defaultTiers();

    var tierIds = {};
    tiers.forEach(function (tier) { tierIds[tier.id] = true; });

    var items = [];
    var seenItems = {};
    var sourceItems = Array.isArray(raw.items) ? raw.items.slice(0, ITEM_LIMIT) : [];
    sourceItems.forEach(function (item) {
      if (!item || typeof item !== "object") return;
      var image = typeof item.image === "string" && item.image.indexOf("data:image/") === 0 ? item.image : null;
      if (image && image.length > 600000) image = null;
      var label = String(item.label == null ? "" : item.label).slice(0, 40);
      if (!label && !image) return;
      var id = typeof item.id === "string" && item.id ? item.id : uid();
      if (seenItems[id]) id = uid();
      seenItems[id] = true;
      var tierId = null;
      if (typeof item.tierId === "string" && tierIds[item.tierId]) tierId = item.tierId;
      else if (Number.isInteger(item.tierIndex) && tiers[item.tierIndex]) tierId = tiers[item.tierIndex].id;
      items.push({ id: id, tierId: tierId, label: label, image: image });
    });

    return {
      id: typeof raw.id === "string" && raw.id ? raw.id : uid(),
      title: String(raw.title == null ? "" : raw.title).slice(0, 60),
      createdAt: Number(raw.createdAt) || Date.now(),
      updatedAt: Number(raw.updatedAt) || Date.now(),
      tiers: tiers,
      items: items
    };
  }

  function fresh() {
    var board = createBoard();
    return { version: 1, activeId: board.id, boards: [board] };
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return fresh();
      var data = JSON.parse(raw);
      if (!data || !Array.isArray(data.boards)) return fresh();
      var boards = [];
      var ids = {};
      data.boards.forEach(function (entry) {
        var board = normalizeStored(entry);
        if (!board) return;
        if (ids[board.id]) board.id = uid();
        ids[board.id] = true;
        boards.push(board);
      });
      if (!boards.length) return fresh();
      var activeId = boards.some(function (board) { return board.id === data.activeId; }) ? data.activeId : boards[0].id;
      return { version: 1, activeId: activeId, boards: boards };
    } catch (error) {
      return fresh();
    }
  }

  function persist() {
    window.clearTimeout(persistTimer);
    persistTimer = 0;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      window.dispatchEvent(new CustomEvent("tierboard:storage-error"));
    }
  }

  function schedulePersist() {
    window.clearTimeout(persistTimer);
    persistTimer = window.setTimeout(persist, 200);
  }

  function touch(board) {
    board.updatedAt = Date.now();
    persist();
  }

  function getBoard() {
    var board = state.boards.find(function (entry) { return entry.id === state.activeId; });
    if (board) return board;
    board = state.boards[0] || createBoard();
    if (!state.boards.length) state.boards.push(board);
    state.activeId = board.id;
    persist();
    return board;
  }

  function groupsOf(board) {
    var map = new Map();
    board.tiers.forEach(function (tier) { map.set(tier.id, []); });
    var pool = [];
    board.items.forEach(function (item) {
      if (item.tierId && map.has(item.tierId)) map.get(item.tierId).push(item);
      else {
        item.tierId = null;
        pool.push(item);
      }
    });
    return { map: map, pool: pool };
  }

  function applyGroups(board, grouped) {
    var items = [];
    board.tiers.forEach(function (tier) {
      items = items.concat(grouped.map.get(tier.id) || []);
    });
    board.items = items.concat(grouped.pool);
  }

  function displayTitle(board) {
    var title = board && board.title ? board.title.trim() : "";
    return title || "無題のティア表";
  }

  function isPristine(board) {
    if (!board || board.title.trim() || board.items.length) return false;
    if (board.tiers.length !== DEFAULT_TIERS.length) return false;
    return board.tiers.every(function (tier, index) {
      return tier.label === DEFAULT_TIERS[index].label && tier.color === DEFAULT_TIERS[index].color;
    });
  }

  function inkFor(hex) {
    var color = validColor(hex) || "#000000";
    var r = parseInt(color.slice(1, 3), 16);
    var g = parseInt(color.slice(3, 5), 16);
    var b = parseInt(color.slice(5, 7), 16);
    var yiq = (r * 299 + g * 587 + b * 114) / 1000;
    return yiq >= 150 ? "#1c1917" : "#fffaf5";
  }

  function labelFontSize(label) {
    var length = Array.from(String(label || "")).length;
    if (length <= 1) return "32px";
    if (length === 2) return "26px";
    if (length <= 4) return "18px";
    return "13px";
  }

  function cloneBoard(raw, title) {
    var board = normalizeStored(raw);
    if (!board) return null;
    var idMap = new Map();
    board.id = uid();
    board.createdAt = Date.now();
    board.updatedAt = Date.now();
    if (typeof title === "string") board.title = title.slice(0, 60);
    board.tiers.forEach(function (tier) {
      var nextId = uid();
      idMap.set(tier.id, nextId);
      tier.id = nextId;
    });
    board.items.forEach(function (item) {
      item.id = uid();
      item.tierId = item.tierId && idMap.has(item.tierId) ? idMap.get(item.tierId) : null;
    });
    return board;
  }

  TB.palette = {
    presets: PRESET_COLORS,
    inkFor: inkFor,
    labelFontSize: labelFontSize,
    validColor: validColor
  };

  TB.store = {
    getBoard: getBoard,
    getBoards: function () { return state.boards.slice(); },
    displayTitle: displayTitle,
    flush: persist,
    setTitle: function (title) {
      var board = getBoard();
      board.title = String(title == null ? "" : title).slice(0, 60);
      board.updatedAt = Date.now();
      schedulePersist();
    },
    renameTier: function (tierId, label) {
      var board = getBoard();
      var tier = board.tiers.find(function (entry) { return entry.id === tierId; });
      if (!tier) return { error: "ティアが見つかりません。" };
      tier.label = String(label == null ? "" : label).slice(0, 12);
      board.updatedAt = Date.now();
      schedulePersist();
      return { tier: tier };
    },
    recolorTier: function (tierId, color) {
      var next = validColor(color);
      if (!next) return { error: "色の形式が正しくありません。" };
      var board = getBoard();
      var tier = board.tiers.find(function (entry) { return entry.id === tierId; });
      if (!tier) return { error: "ティアが見つかりません。" };
      tier.color = next;
      touch(board);
      return { tier: tier };
    },
    addTier: function () {
      var board = getBoard();
      if (board.tiers.length >= TIER_LIMIT) return { error: "ティアは24個までです。" };
      var usedLabels = {};
      var usedColors = {};
      board.tiers.forEach(function (tier) {
        usedLabels[tier.label] = true;
        usedColors[tier.color] = true;
      });
      var label = LETTERS.filter(function (letter) { return !usedLabels[letter]; })[0] || String(board.tiers.length + 1);
      var colors = PRESET_COLORS;
      var color = colors.filter(function (entry) { return !usedColors[entry]; })[0] || colors[board.tiers.length % colors.length];
      var tier = { id: uid(), label: label, color: color };
      board.tiers.push(tier);
      touch(board);
      return { tier: tier };
    },
    deleteTier: function (tierId) {
      var board = getBoard();
      if (!board.tiers.some(function (tier) { return tier.id === tierId; })) {
        return { error: "ティアが見つかりません。" };
      }
      board.items.forEach(function (item) {
        if (item.tierId === tierId) item.tierId = null;
      });
      board.tiers = board.tiers.filter(function (tier) { return tier.id !== tierId; });
      applyGroups(board, groupsOf(board));
      touch(board);
      return {};
    },
    moveTier: function (tierId, index) {
      var board = getBoard();
      var from = board.tiers.findIndex(function (tier) { return tier.id === tierId; });
      if (from < 0) return { error: "ティアが見つかりません。" };
      var tier = board.tiers.splice(from, 1)[0];
      var to = Math.max(0, Math.min(index, board.tiers.length));
      board.tiers.splice(to, 0, tier);
      touch(board);
      return {};
    },
    addItem: function (input) {
      var board = getBoard();
      if (board.items.length >= ITEM_LIMIT) return { error: "項目は300件までです。" };
      var label = String(input.label == null ? "" : input.label).trim().slice(0, 40);
      var image = typeof input.image === "string" && input.image.indexOf("data:image/") === 0 ? input.image : null;
      if (!label && !image) return { error: "名前か画像が必要です。" };
      var item = { id: uid(), tierId: null, label: label, image: image };
      board.items.push(item);
      touch(board);
      return { item: item };
    },
    updateItem: function (itemId, patch) {
      var board = getBoard();
      var item = board.items.find(function (entry) { return entry.id === itemId; });
      if (!item) return { error: "項目が見つかりません。" };
      var label = Object.prototype.hasOwnProperty.call(patch, "label")
        ? String(patch.label == null ? "" : patch.label).trim().slice(0, 40)
        : item.label;
      var image = item.image;
      if (Object.prototype.hasOwnProperty.call(patch, "image")) {
        image = typeof patch.image === "string" && patch.image.indexOf("data:image/") === 0 ? patch.image : null;
      }
      if (!label && !image) return { error: "名前か画像が必要です。" };
      item.label = label;
      item.image = image;
      touch(board);
      return { item: item };
    },
    deleteItem: function (itemId) {
      var board = getBoard();
      var next = board.items.filter(function (item) { return item.id !== itemId; });
      if (next.length === board.items.length) return { error: "項目が見つかりません。" };
      board.items = next;
      touch(board);
      return {};
    },
    moveItem: function (itemId, tierId, index) {
      var board = getBoard();
      var grouped = groupsOf(board);
      var lists = [grouped.pool];
      grouped.map.forEach(function (list) { lists.push(list); });
      var moving = null;
      for (var i = 0; i < lists.length; i += 1) {
        var at = lists[i].findIndex(function (item) { return item.id === itemId; });
        if (at >= 0) {
          moving = lists[i].splice(at, 1)[0];
          break;
        }
      }
      if (!moving) return { error: "項目が見つかりません。" };
      var dest = tierId && grouped.map.has(tierId) ? grouped.map.get(tierId) : grouped.pool;
      moving.tierId = dest === grouped.pool ? null : tierId;
      dest.splice(Math.max(0, Math.min(index, dest.length)), 0, moving);
      applyGroups(board, grouped);
      touch(board);
      return { item: moving };
    },
    unrankAll: function () {
      var board = getBoard();
      board.items.forEach(function (item) { item.tierId = null; });
      touch(board);
    },
    addSamples: function () {
      var board = getBoard();
      if (board.items.length) return { error: "項目があるときはサンプルを入れられません。" };
      SAMPLES.forEach(function (label) {
        board.items.push({ id: uid(), tierId: null, label: label, image: null });
      });
      touch(board);
      return {};
    },
    newBoard: function () {
      var current = getBoard();
      if (isPristine(current)) return { error: "このボードはまだ空です。" };
      var board = createBoard();
      state.boards.unshift(board);
      state.activeId = board.id;
      persist();
      return { board: board };
    },
    switchBoard: function (id) {
      if (!state.boards.some(function (board) { return board.id === id; })) {
        return { error: "ボードが見つかりません。" };
      }
      state.activeId = id;
      persist();
      return {};
    },
    duplicateBoard: function (id) {
      var source = state.boards.find(function (board) { return board.id === id; });
      if (!source) return { error: "ボードが見つかりません。" };
      var copy = cloneBoard(source, (displayTitle(source) + " のコピー").slice(0, 60));
      state.boards.unshift(copy);
      state.activeId = copy.id;
      persist();
      return { board: copy };
    },
    deleteBoard: function (id) {
      var index = state.boards.findIndex(function (board) { return board.id === id; });
      if (index < 0) return { error: "ボードが見つかりません。" };
      state.boards.splice(index, 1);
      if (!state.boards.length) {
        var board = createBoard();
        state.boards.push(board);
        state.activeId = board.id;
      } else if (state.activeId === id) {
        state.activeId = state.boards[Math.min(index, state.boards.length - 1)].id;
      }
      persist();
      return {};
    },
    importBoards: function (list) {
      if (!Array.isArray(list) || !list.length) return { error: "読み込めるデータがありません。" };
      var imported = [];
      list.slice(0, 30).forEach(function (raw) {
        if (!raw || typeof raw !== "object" || (!Array.isArray(raw.tiers) && !Array.isArray(raw.items))) return;
        var board = cloneBoard(raw);
        if (board) imported.push(board);
      });
      if (!imported.length) return { error: "ティア表の形式ではありません。" };
      if (state.boards.length === 1 && isPristine(state.boards[0])) state.boards = imported;
      else state.boards = imported.concat(state.boards);
      state.activeId = imported[0].id;
      persist();
      return { count: imported.length };
    }
  };

  window.addEventListener("beforeunload", persist);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") persist();
  });
})(window.TierBoard = window.TierBoard || {});
