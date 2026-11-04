(function (TB) {
  "use strict";

  var selectedId = null;
  var menuTierId = null;
  var pendingImage = null;
  var editingId = null;
  var dialogImage = null;
  var toastTimer = 0;
  var storageWarned = false;

  var $ = function (id) { return document.getElementById(id); };

  function toast(message) {
    var el = $("toast");
    el.textContent = message;
    el.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () { el.hidden = true; }, 2600);
  }

  function board() {
    return TB.store.getBoard();
  }

  function closeMenu() {
    $("tier-menu").hidden = true;
    menuTierId = null;
    document.querySelectorAll(".tier-more[aria-expanded='true']").forEach(function (button) {
      button.setAttribute("aria-expanded", "false");
    });
  }

  function render() {
    if (TB.drag.isActive()) return;
    var current = board();
    if (selectedId && !current.items.some(function (item) { return item.id === selectedId; })) selectedId = null;
    TB.render(current, selectedId);
    renderSelection(current);
    document.body.classList.toggle("has-selection", !!selectedId);
  }

  function itemName(item) {
    return item.label || "画像";
  }

  function renderSelection(current) {
    var bar = $("selection-bar");
    var item = current.items.find(function (entry) { return entry.id === selectedId; });
    if (!item) {
      bar.hidden = true;
      return;
    }
    bar.hidden = false;
    var tier = current.tiers.find(function (entry) { return entry.id === item.tierId; });
    $("selection-name").textContent = itemName(item) + " · " + (tier ? tier.label || "（無名）" : "未分類");
    var select = $("selection-target");
    var value = item.tierId || "pool";
    select.replaceChildren.apply(select, current.tiers.map(function (entry) {
      return new Option(entry.label || "（無名）", entry.id);
    }).concat([new Option("未分類", "pool")]));
    select.value = value;
  }

  function applySelection() {
    document.querySelectorAll(".item").forEach(function (el) {
      var on = !!selectedId && el.dataset.id === selectedId;
      el.classList.toggle("is-selected", on);
      el.setAttribute("aria-selected", on ? "true" : "false");
    });
    renderSelection(board());
    document.body.classList.toggle("has-selection", !!selectedId);
  }

  function setSelected(id) {
    var changed = selectedId !== id;
    selectedId = id;
    if (changed) applySelection();
    if (!id) return;
    var el = document.querySelector('.item[data-id="' + CSS.escape(id) + '"]');
    if (el && document.activeElement !== el) el.focus();
  }

  function showPending() {
    var box = $("composer-preview");
    if (!pendingImage) {
      box.hidden = true;
      $("composer-preview-img").removeAttribute("src");
      return;
    }
    $("composer-preview-img").src = pendingImage;
    box.hidden = false;
  }

  function showDialogPreview() {
    var box = $("dialog-preview");
    $("item-remove-image").hidden = !dialogImage;
    if (!dialogImage) {
      box.hidden = true;
      $("dialog-preview-img").removeAttribute("src");
      return;
    }
    $("dialog-preview-img").src = dialogImage;
    box.hidden = false;
  }

  function openEdit(id) {
    var item = board().items.find(function (entry) { return entry.id === id; });
    if (!item) return;
    editingId = id;
    dialogImage = item.image || null;
    $("item-label").value = item.label;
    showDialogPreview();
    if (!$("item-dialog").open) $("item-dialog").showModal();
    $("item-label").focus();
  }

  function askConfirm(options) {
    $("confirm-title").textContent = options.title;
    $("confirm-body").textContent = options.body;
    var ok = $("confirm-ok");
    ok.textContent = options.okLabel;
    ok.className = options.danger === false ? "btn btn-primary" : "btn btn-danger";
    var dialog = $("confirm-dialog");
    dialog.showModal();
    return new Promise(function (resolve) {
      dialog.addEventListener("close", function () {
        resolve(dialog.returnValue === "ok");
      }, { once: true });
    });
  }

  function openBoards() {
    TB.renderBoards($("boards-list"), TB.store.getBoards(), board().id);
    $("boards-dialog").showModal();
  }

  function paintTier(tier) {
    var row = document.querySelector('.tier[data-tier-id="' + CSS.escape(tier.id) + '"] .tier-label');
    if (!row) return;
    row.style.background = tier.color;
    row.style.color = TB.palette.inkFor(tier.color);
  }

  function syncSwatches(color) {
    document.querySelectorAll(".swatch").forEach(function (swatch) {
      swatch.classList.toggle("is-active", swatch.dataset.color === color);
    });
    $("tier-color").value = TB.palette.validColor(color) || "#ff7f7f";
  }

  function openTierMenu(tierId, anchor) {
    menuTierId = tierId;
    var tier = board().tiers.find(function (entry) { return entry.id === tierId; });
    if (!tier) return;
    syncSwatches(tier.color);
    var menu = $("tier-menu");
    menu.hidden = false;
    var rect = anchor.getBoundingClientRect();
    var menuRect = menu.getBoundingClientRect();
    var left = Math.min(rect.right - menuRect.width, window.innerWidth - menuRect.width - 8);
    left = Math.max(8, left);
    var top = rect.bottom + 6;
    if (top + menuRect.height > window.innerHeight - 8) top = Math.max(8, rect.top - menuRect.height - 6);
    menu.style.left = left + "px";
    menu.style.top = top + "px";
    anchor.setAttribute("aria-expanded", "true");
  }

  async function useImageFile(file, assign) {
    try {
      assign(await TB.images.fromFile(file));
    } catch (error) {
      toast(error.message || "画像を読み込めませんでした。");
    }
  }

  function resultToast(result) {
    if (result && result.error) toast(result.error);
    return result;
  }

  function bind() {
    var swatches = $("swatches");
    TB.palette.presets.forEach(function (color) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "swatch";
      button.style.background = color;
      button.dataset.color = color;
      button.setAttribute("aria-label", color);
      swatches.append(button);
    });

    $("board-title").addEventListener("input", function (event) {
      TB.store.setTitle(event.target.value);
      document.title = TB.store.displayTitle(board()) + " · TierBoard";
    });

    document.getElementById("tier-list").addEventListener("input", function (event) {
      if (!event.target.classList.contains("tier-name")) return;
      var row = event.target.closest(".tier");
      if (!row) return;
      TB.store.renameTier(row.dataset.tierId, event.target.value);
      event.target.style.fontSize = TB.palette.labelFontSize(event.target.value);
    });

    document.getElementById("tier-list").addEventListener("focusout", function (event) {
      if (!event.target.classList.contains("tier-name")) return;
      var row = event.target.closest(".tier");
      if (!row) return;
      if (event.target.value.trim()) return;
      event.target.value = "新";
      event.target.style.fontSize = TB.palette.labelFontSize("新");
      TB.store.renameTier(row.dataset.tierId, "新");
    });

    $("btn-add-tier").addEventListener("click", function () {
      var result = resultToast(TB.store.addTier());
      if (!result || result.error) return;
      closeMenu();
      render();
      var input = document.querySelector('.tier[data-tier-id="' + CSS.escape(result.tier.id) + '"] .tier-name');
      if (input) {
        input.focus();
        input.select();
      }
    });

    $("btn-new").addEventListener("click", function () {
      var result = TB.store.newBoard();
      if (result.error) {
        toast(result.error);
        return;
      }
      selectedId = null;
      pendingImage = null;
      showPending();
      closeMenu();
      render();
      $("board-title").focus();
    });

    $("btn-boards").addEventListener("click", openBoards);
    $("boards-close").addEventListener("click", function () { $("boards-dialog").close(); });

    $("btn-unrank").addEventListener("click", async function () {
      var ok = await askConfirm({
        title: "未分類に戻す",
        body: "すべての項目を未分類へ戻します。項目自体は削除しません。",
        okLabel: "戻す",
        danger: false
      });
      if (!ok) return;
      TB.store.unrankAll();
      closeMenu();
      render();
    });

    $("composer").addEventListener("submit", function (event) {
      event.preventDefault();
      var label = $("composer-label").value.trim();
      if (!label && !pendingImage) {
        toast("名前か画像を指定してください。");
        return;
      }
      var result = resultToast(TB.store.addItem({ label: label, image: pendingImage }));
      if (!result || result.error) return;
      $("composer-label").value = "";
      pendingImage = null;
      showPending();
      render();
      $("composer-label").focus();
    });

    $("btn-pick-image").addEventListener("click", function () { $("composer-file").click(); });
    $("composer-file").addEventListener("change", function (event) {
      var file = event.target.files && event.target.files[0];
      event.target.value = "";
      if (!file) return;
      useImageFile(file, function (dataUrl) {
        pendingImage = dataUrl;
        showPending();
      });
    });
    $("composer-clear-image").addEventListener("click", function () {
      pendingImage = null;
      showPending();
    });

    $("selection-target").addEventListener("change", function (event) {
      if (!selectedId) return;
      var tierId = event.target.value === "pool" ? null : event.target.value;
      var current = board();
      var index = current.items.filter(function (item) {
        return item.id !== selectedId && (tierId ? item.tierId === tierId : !item.tierId);
      }).length;
      resultToast(TB.store.moveItem(selectedId, tierId, index));
      render();
    });
    $("selection-edit").addEventListener("click", function () { if (selectedId) openEdit(selectedId); });
    $("selection-delete").addEventListener("click", function () {
      if (!selectedId) return;
      resultToast(TB.store.deleteItem(selectedId));
      selectedId = null;
      render();
    });
    $("selection-clear").addEventListener("click", function () { setSelected(null); });

    $("item-form").addEventListener("submit", function (event) {
      event.preventDefault();
      var result = TB.store.updateItem(editingId, {
        label: $("item-label").value.trim(),
        image: dialogImage
      });
      if (result.error) {
        toast(result.error);
        return;
      }
      $("item-dialog").close();
      render();
    });
    $("item-cancel").addEventListener("click", function () { $("item-dialog").close(); });
    $("item-replace-image").addEventListener("click", function () { $("item-file").click(); });
    $("item-remove-image").addEventListener("click", function () {
      dialogImage = null;
      showDialogPreview();
    });
    $("item-file").addEventListener("change", function (event) {
      var file = event.target.files && event.target.files[0];
      event.target.value = "";
      if (!file) return;
      useImageFile(file, function (dataUrl) {
        dialogImage = dataUrl;
        showDialogPreview();
      });
    });

    $("tier-color").addEventListener("input", function (event) {
      if (!menuTierId) return;
      var result = TB.store.recolorTier(menuTierId, event.target.value);
      if (result.error) return;
      paintTier(result.tier);
      syncSwatches(result.tier.color);
    });

    document.addEventListener("click", function (event) {
      var swatch = event.target.closest(".swatch");
      if (swatch && menuTierId) {
        var colored = TB.store.recolorTier(menuTierId, swatch.dataset.color);
        if (!colored.error) {
          paintTier(colored.tier);
          syncSwatches(colored.tier.color);
        }
        return;
      }
      var menuAction = event.target.closest("[data-menu]");
      if (menuAction && menuTierId) {
        var tierId = menuTierId;
        var action = menuAction.dataset.menu;
        if (action === "rename") {
          closeMenu();
          var input = document.querySelector('.tier[data-tier-id="' + CSS.escape(tierId) + '"] .tier-name');
          if (input) {
            input.focus();
            input.select();
          }
          return;
        }
        if (action === "up" || action === "down") {
          var tiers = board().tiers;
          var index = tiers.findIndex(function (tier) { return tier.id === tierId; });
          if (index < 0) return;
          TB.store.moveTier(tierId, action === "up" ? index - 1 : index + 1);
          closeMenu();
          render();
          return;
        }
        if (action === "delete") {
          var tier = board().tiers.find(function (entry) { return entry.id === tierId; });
          var count = board().items.filter(function (item) { return item.tierId === tierId; }).length;
          closeMenu();
          var remove = function () {
            resultToast(TB.store.deleteTier(tierId));
            render();
          };
          if (!count) {
            remove();
            return;
          }
          askConfirm({
            title: "ティアを削除",
            body: "「" + ((tier && tier.label) || "このティア") + "」を削除します。中の " + count + " 件は未分類に戻ります。",
            okLabel: "削除"
          }).then(function (ok) { if (ok) remove(); });
        }
        return;
      }

      var control = event.target.closest("[data-action]");
      if (!control || !control.isConnected) return;
      var type = control.dataset.action;
      var id = control.dataset.id;
      if (type === "tier-menu") {
        if (menuTierId === control.closest(".tier").dataset.tierId && !$("tier-menu").hidden) closeMenu();
        else openTierMenu(control.closest(".tier").dataset.tierId, control);
        return;
      }
      if (type === "samples") {
        resultToast(TB.store.addSamples());
        render();
        return;
      }
      if (type === "open-board") {
        resultToast(TB.store.switchBoard(id));
        selectedId = null;
        pendingImage = null;
        showPending();
        closeMenu();
        $("boards-dialog").close();
        render();
        return;
      }
      if (type === "duplicate-board") {
        resultToast(TB.store.duplicateBoard(id));
        selectedId = null;
        closeMenu();
        $("boards-dialog").close();
        render();
        toast("ボードを複製しました。");
        return;
      }
      if (type === "delete-board") {
        var target = TB.store.getBoards().find(function (entry) { return entry.id === id; });
        askConfirm({
          title: "ボードを削除",
          body: "「" + TB.store.displayTitle(target || { title: "" }) + "」を削除します。",
          okLabel: "削除"
        }).then(function (ok) {
          if (!ok) return;
          resultToast(TB.store.deleteBoard(id));
          if (selectedId) selectedId = null;
          pendingImage = null;
          showPending();
          TB.renderBoards($("boards-list"), TB.store.getBoards(), board().id);
          render();
        });
      }
    });

    document.addEventListener("pointerdown", function (event) {
      var menu = $("tier-menu");
      if (!menu.hidden && !menu.contains(event.target) && !event.target.closest("[data-action='tier-menu']")) closeMenu();
      if (TB.drag.isActive()) return;
      if (event.target.closest(".item, button, a, input, textarea, select, label, dialog, #tier-menu, #selection-bar")) return;
      if (selectedId) setSelected(null);
    });

    document.addEventListener("dblclick", function (event) {
      var item = event.target.closest(".item");
      if (item && item.dataset.id) openEdit(item.dataset.id);
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !$("tier-menu").hidden) {
        closeMenu();
        return;
      }
      if (event.key === "Escape" && TB.drag.isActive()) {
        TB.drag.cancel();
        render();
        return;
      }
      var typing = event.target.closest("input, textarea, select");
      if (typing) return;
      if ((event.key === "Delete" || event.key === "Backspace") && selectedId && !document.querySelector("dialog[open]")) {
        event.preventDefault();
        resultToast(TB.store.deleteItem(selectedId));
        selectedId = null;
        render();
        return;
      }
      if (event.key === "Enter") {
        var focused = event.target.closest && event.target.closest(".item");
        if (focused && focused.dataset.id) openEdit(focused.dataset.id);
      }
    });

    document.addEventListener("focusin", function (event) {
      if (TB.drag.isActive()) return;
      var item = event.target.closest && event.target.closest(".item");
      if (item && item.dataset.id) setSelected(item.dataset.id);
    });

    window.addEventListener("scroll", function () {
      if (!$("tier-menu").hidden) closeMenu();
    }, { passive: true });

    document.addEventListener("paste", function (event) {
      if (!event.clipboardData) return;
      var files = event.clipboardData.files;
      var file = null;
      for (var i = 0; i < files.length; i += 1) {
        if (/^image\//.test(files[i].type)) {
          file = files[i];
          break;
        }
      }
      if (!file) return;
      event.preventDefault();
      if ($("item-dialog").open) {
        useImageFile(file, function (dataUrl) {
          dialogImage = dataUrl;
          showDialogPreview();
        });
        return;
      }
      useImageFile(file, function (dataUrl) {
        pendingImage = dataUrl;
        showPending();
        toast("画像を貼り付けました。追加を押してください。");
      });
    });

    $("btn-export-json").addEventListener("click", function () {
      TB.exporter.downloadJson(board());
      toast("JSONを保存しました。");
    });
    $("btn-export-png").addEventListener("click", async function () {
      try {
        await TB.exporter.downloadPng(board());
        toast("画像を保存しました。");
      } catch (error) {
        toast("画像の書き出しに失敗しました。");
      }
    });
    $("btn-import").addEventListener("click", function () { $("import-file").click(); });
    $("import-file").addEventListener("change", function (event) {
      var file = event.target.files && event.target.files[0];
      event.target.value = "";
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var boards = TB.exporter.parseImport(String(reader.result || ""));
          var result = TB.store.importBoards(boards);
          if (result.error) {
            toast(result.error);
            return;
          }
          selectedId = null;
          pendingImage = null;
          showPending();
          closeMenu();
          render();
          toast(result.count + "件のボードを読み込みました。");
        } catch (error) {
          toast("JSONを読み込めませんでした。");
        }
      };
      reader.onerror = function () { toast("ファイルを読み込めませんでした。"); };
      reader.readAsText(file);
    });

    window.addEventListener("tierboard:storage-error", function () {
      if (storageWarned) return;
      storageWarned = true;
      toast("保存容量が不足しています。画像を減らすか、ボードを削除してください。");
    });

    TB.drag.init({
      onGestureStart: closeMenu,
      onClickItem: function (id) { setSelected(id); },
      onDropItem: function (id, tierId, index) {
        resultToast(TB.store.moveItem(id, tierId, index));
        selectedId = id;
        render();
      },
      onDropTier: function (id, index) {
        resultToast(TB.store.moveTier(id, index));
        render();
      }
    });
  }

  try {
    bind();
    render();
  } catch (error) {
    console.error(error);
  }
})(window.TierBoard = window.TierBoard || {});
