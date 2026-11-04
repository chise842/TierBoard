(function (TB) {
  "use strict";

  function h(tag, props) {
    var el = document.createElement(tag);
    var children = Array.prototype.slice.call(arguments, 2);
    if (props) {
      Object.keys(props).forEach(function (key) {
        var value = props[key];
        if (value == null || value === false) return;
        if (key === "class") el.className = value;
        else if (key === "style" && typeof value === "object") Object.assign(el.style, value);
        else el.setAttribute(key, value === true ? "" : String(value));
      });
    }
    children.flat().forEach(function (child) {
      if (child == null || child === false) return;
      el.append(child instanceof Node ? child : document.createTextNode(String(child)));
    });
    return el;
  }

  function grip() {
    var span = h("span", { class: "tier-grip", title: "ドラッグで移動", "aria-hidden": "true" });
    span.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><circle cx="4" cy="2.5" r="1.15"/><circle cx="10" cy="2.5" r="1.15"/><circle cx="4" cy="7" r="1.15"/><circle cx="10" cy="7" r="1.15"/><circle cx="4" cy="11.5" r="1.15"/><circle cx="10" cy="11.5" r="1.15"/></svg>';
    return span;
  }

  function itemEl(item, selectedId) {
    var children = [];
    if (item.image) {
      children.push(h("img", { src: item.image, alt: item.label ? "" : "画像", draggable: "false" }));
    }
    if (item.label) children.push(h("span", { class: "item-label" }, item.label));
    var className = "item" + (item.image ? " has-image" : "") + (item.id === selectedId ? " is-selected" : "");
    return h("article", {
      class: className,
      "data-id": item.id,
      tabindex: "0",
      "aria-selected": item.id === selectedId ? "true" : "false"
    }, children);
  }

  function tierEl(tier) {
    return h("section", { class: "tier", "data-tier-id": tier.id },
      h("div", {
        class: "tier-label",
        style: { background: tier.color, color: TB.palette.inkFor(tier.color) }
      },
        grip(),
        h("input", {
          class: "tier-name",
          type: "text",
          value: tier.label,
          maxlength: "12",
          "aria-label": "ティア名",
          autocomplete: "off",
          spellcheck: "false",
          style: { fontSize: TB.palette.labelFontSize(tier.label) }
        })
      ),
      h("div", { class: "tier-items", "data-drop-tier": tier.id }),
      h("button", {
        type: "button",
        class: "tier-more",
        "data-action": "tier-menu",
        "aria-label": (tier.label || "ティア") + "の操作",
        "aria-haspopup": "menu"
      }, "⋯")
    );
  }

  function formatTime(value) {
    try {
      return new Intl.DateTimeFormat("ja-JP", {
        timeZone: "Asia/Tokyo",
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      }).format(value);
    } catch (error) {
      return "";
    }
  }

  TB.render = function render(board, selectedId) {
    var tierList = document.getElementById("tier-list");
    var pool = document.getElementById("pool-items");
    if (!board.tiers.length) {
      tierList.replaceChildren(h("p", { class: "empty" }, "ティアがありません。下のボタンから追加できます。"));
    } else {
      tierList.replaceChildren.apply(tierList, board.tiers.map(function (tier) {
        var row = tierEl(tier);
        var zone = row.querySelector("[data-drop-tier]");
        board.items.filter(function (item) { return item.tierId === tier.id; }).forEach(function (item) {
          zone.append(itemEl(item, selectedId));
        });
        return row;
      }));
    }

    var poolItems = board.items.filter(function (item) { return !item.tierId; });
    var ranked = board.items.length - poolItems.length;
    pool.replaceChildren();
    if (!poolItems.length && !ranked) {
      pool.append(
        h("p", { class: "empty" }, "項目がありません。名前を入力して追加し、上のティアへドラッグしてください。"),
        h("button", { type: "button", class: "btn btn-ghost", "data-action": "samples" }, "サンプルを入れる")
      );
    } else if (!poolItems.length) {
      pool.append(h("p", { class: "empty" }, "未分類の項目はありません。"));
    } else {
      poolItems.forEach(function (item) { pool.append(itemEl(item, selectedId)); });
    }

    var title = document.getElementById("board-title");
    if (document.activeElement !== title && title.value !== board.title) title.value = board.title;
    document.title = TB.store.displayTitle(board) + " · TierBoard";
    document.getElementById("btn-unrank").hidden = ranked === 0;
  };

  TB.renderBoards = function renderBoards(container, boards, activeId) {
    container.replaceChildren.apply(container, boards
      .slice()
      .sort(function (a, b) { return b.updatedAt - a.updatedAt; })
      .map(function (board) {
        var active = board.id === activeId;
        var meta = "項目 " + board.items.length + " · " + formatTime(board.updatedAt) + (active ? " · 編集中" : "");
        return h("div", { class: "board-row" + (active ? " is-active" : "") },
          h("button", { type: "button", class: "board-open", "data-action": "open-board", "data-id": board.id },
            h("span", { class: "board-open-title" }, TB.store.displayTitle(board)),
            h("span", { class: "board-open-meta" }, meta)
          ),
          h("button", { type: "button", class: "btn btn-ghost", "data-action": "duplicate-board", "data-id": board.id }, "複製"),
          h("button", { type: "button", class: "btn btn-ghost danger-text", "data-action": "delete-board", "data-id": board.id }, "削除")
        );
      }));
  };
})(window.TierBoard = window.TierBoard || {});
