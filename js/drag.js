(function (TB) {
  "use strict";

  var drag = null;
  var hooks = {
    onClickItem: function () {},
    onDropItem: function () {},
    onDropTier: function () {},
    onGestureStart: function () {}
  };

  function clearMarkers() {
    document.querySelectorAll(".drop-marker, .tier-marker").forEach(function (el) { el.remove(); });
    document.querySelectorAll(".is-over").forEach(function (el) { el.classList.remove("is-over"); });
  }

  function removeGhost() {
    var ghost = document.querySelector(".drag-ghost");
    if (ghost) ghost.remove();
  }

  function clearDrag() {
    if (!drag) return;
    if (drag.loop) cancelAnimationFrame(drag.loop);
    if (drag.el) drag.el.classList.remove("is-dragging-source");
    document.body.classList.remove("is-dragging");
    clearMarkers();
    removeGhost();
    drag = null;
  }

  function itemInsertIndex(zone, x, y) {
    var items = Array.prototype.filter.call(zone.querySelectorAll(".item"), function (el) {
      return !el.classList.contains("is-dragging-source") && !el.classList.contains("drag-ghost");
    });
    for (var i = 0; i < items.length; i += 1) {
      var rect = items[i].getBoundingClientRect();
      var midY = rect.top + rect.height / 2;
      var midX = rect.left + rect.width / 2;
      if (y < midY || (y < rect.bottom && x < midX)) return i;
    }
    return items.length;
  }

  function placeItemMarker(zone, index) {
    var marker = document.createElement("div");
    marker.className = "drop-marker";
    var items = Array.prototype.filter.call(zone.querySelectorAll(".item"), function (el) {
      return !el.classList.contains("is-dragging-source") && !el.classList.contains("drag-ghost");
    });
    if (!items.length) zone.prepend(marker);
    else if (index >= items.length) zone.append(marker);
    else zone.insertBefore(marker, items[index]);
  }

  function tierInsertIndex(y) {
    var rows = Array.prototype.filter.call(document.querySelectorAll("#tier-list .tier"), function (el) {
      return !el.classList.contains("is-dragging-source");
    });
    for (var i = 0; i < rows.length; i += 1) {
      var rect = rows[i].getBoundingClientRect();
      if (y < rect.top + rect.height / 2) return i;
    }
    return rows.length;
  }

  function placeTierMarker(index) {
    var list = document.getElementById("tier-list");
    var rows = Array.prototype.filter.call(list.querySelectorAll(".tier"), function (el) {
      return !el.classList.contains("is-dragging-source");
    });
    var marker = document.createElement("div");
    marker.className = "tier-marker";
    if (index >= rows.length) list.append(marker);
    else list.insertBefore(marker, rows[index]);
  }

  function findZone(x, y) {
    var elements = document.elementsFromPoint(x, y);
    for (var i = 0; i < elements.length; i += 1) {
      var el = elements[i];
      if (!(el instanceof Element)) continue;
      if (el.closest(".drag-ghost")) continue;
      var zone = el.closest("[data-drop-tier], [data-drop-pool]");
      if (zone) return zone;
      var tier = el.closest(".tier");
      if (tier && !tier.classList.contains("is-dragging-source")) {
        return tier.querySelector("[data-drop-tier]");
      }
    }
    return null;
  }

  function updateTarget(x, y) {
    if (!drag || !drag.active) return;
    clearMarkers();
    if (drag.kind === "tier") {
      drag.index = tierInsertIndex(y);
      placeTierMarker(drag.index);
      return;
    }
    var zone = findZone(x, y);
    drag.zone = zone;
    if (!zone) return;
    zone.classList.add("is-over");
    drag.index = itemInsertIndex(zone, x, y);
    placeItemMarker(zone, drag.index);
  }

  function activate(event) {
    drag.active = true;
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    drag.el.classList.add("is-dragging-source");
    document.body.classList.add("is-dragging");
    if (drag.kind === "item") {
      var rect = drag.rect;
      var ghost = drag.el.cloneNode(true);
      ghost.classList.remove("is-dragging-source", "is-selected");
      ghost.classList.add("drag-ghost");
      ghost.removeAttribute("data-id");
      ghost.removeAttribute("tabindex");
      ghost.style.width = rect.width + "px";
      ghost.style.left = event.clientX - drag.offsetX + "px";
      ghost.style.top = event.clientY - drag.offsetY + "px";
      document.body.append(ghost);
    }
    var step = function () {
      if (!drag || !drag.active) return;
      var edge = 64;
      if (drag.lastY < edge) window.scrollBy(0, -12);
      else if (drag.lastY > window.innerHeight - edge) window.scrollBy(0, 12);
      updateTarget(drag.lastX, drag.lastY);
      drag.loop = requestAnimationFrame(step);
    };
    drag.loop = requestAnimationFrame(step);
    updateTarget(event.clientX, event.clientY);
  }

  function onPointerDown(event) {
    if (event.button !== 0 || drag) return;
    if (document.querySelector("dialog[open]")) return;
    if (event.target.closest("input, textarea, button, a, select, label, #tier-menu")) return;
    var item = event.target.closest(".item");
    if (item && item.dataset.id) {
      var rect = item.getBoundingClientRect();
      item.setPointerCapture(event.pointerId);
      drag = {
        kind: "item",
        id: item.dataset.id,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
        rect: rect,
        el: item,
        active: false,
        zone: null,
        index: 0
      };
      hooks.onGestureStart();
      return;
    }
    var grip = event.target.closest(".tier-grip");
    if (!grip) return;
    var tier = grip.closest(".tier");
    if (!tier || !tier.dataset.tierId) return;
    grip.setPointerCapture(event.pointerId);
    drag = {
      kind: "tier",
      id: tier.dataset.tierId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      el: tier,
      active: false,
      index: 0
    };
    hooks.onGestureStart();
  }

  function onPointerMove(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    var distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
    if (!drag.active) {
      if (distance < 6) return;
      activate(event);
    }
    event.preventDefault();
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    if (drag.kind === "item") {
      var ghost = document.querySelector(".drag-ghost");
      if (ghost) {
        ghost.style.left = event.clientX - drag.offsetX + "px";
        ghost.style.top = event.clientY - drag.offsetY + "px";
      }
    }
    updateTarget(event.clientX, event.clientY);
  }

  function finish(event) {
    if (!drag || (event && event.pointerId !== drag.pointerId)) return;
    var current = drag;
    var id = current.id;
    var active = current.active;
    var kind = current.kind;
    var zone = current.zone;
    var index = current.index || 0;
    clearDrag();
    if (!active) {
      if (kind === "item") hooks.onClickItem(id);
      return;
    }
    if (kind === "tier") hooks.onDropTier(id, index);
    else if (zone) {
      var tierId = zone.hasAttribute("data-drop-pool") ? null : zone.getAttribute("data-drop-tier");
      hooks.onDropItem(id, tierId, index);
    }
  }

  TB.drag = {
    init: function (nextHooks) {
      hooks = Object.assign(hooks, nextHooks || {});
      document.addEventListener("pointerdown", onPointerDown, true);
      document.addEventListener("pointermove", onPointerMove, { passive: false });
      document.addEventListener("pointerup", finish);
      document.addEventListener("pointercancel", finish);
      window.addEventListener("blur", function () {
        if (drag && drag.active) clearDrag();
        else clearDrag();
      });
    },
    isActive: function () { return !!(drag && drag.active); },
    cancel: function () { clearDrag(); }
  };
})(window.TierBoard = window.TierBoard || {});
