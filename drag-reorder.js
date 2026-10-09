// Drag to reorder (style rollout B, David 2026-10-09). A grip handle moves an item within its list with the mouse, a
// finger or a pen (pointer events: HTML5 drag and drop does not fire on touch) or with the arrow keys on the focused
// grip. It replaces the admin's Move up / Move down pairs. moveItem and dropIndex are pure and tested in node
// (test/drag-reorder.test.js); attach is browser only.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.IolantheDragReorder = api;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const EDGE_PX = 48;
  const SCROLL_STEP_PX = 14;

  // A copy of list with the entry at from moved to to (the entries between shift by one); list is not changed.
  function moveItem(list, from, to) {
    const copy = list.slice();
    if (from === to || from < 0 || to < 0 || from >= copy.length || to >= copy.length) {
      return copy;
    }
    const [entry] = copy.splice(from, 1);
    copy.splice(to, 0, entry);
    return copy;
  }

  // Where a dragged item lands. slots are the items' { top, height } at drag start, in the same coordinates as
  // centerY (the dragged item's centre now); the item passes every other item whose middle its centre has reached
  // (reached, not crossed: a drag is clamped to the list, which leaves the centre exactly on the last item's middle).
  function dropIndex(slots, from, centerY) {
    let index = from;
    for (let i = from + 1; i < slots.length && centerY >= slots[i].top + slots[i].height / 2; i += 1) {
      index = i;
    }
    for (let i = from - 1; i >= 0 && centerY <= slots[i].top + slots[i].height / 2; i -= 1) {
      index = i;
    }
    return index;
  }

  function scrollParentOf(element) {
    for (let node = element.parentElement; node && node !== document.body; node = node.parentElement) {
      const overflowY = getComputedStyle(node).overflowY;
      if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight) {
        return node;
      }
    }
    return document.scrollingElement || document.documentElement;
  }

  function scrollBounds(scroller) {
    if (scroller === document.scrollingElement || scroller === document.documentElement) {
      return { top: 0, bottom: window.innerHeight };
    }
    return scroller.getBoundingClientRect();
  }

  // options: items() → the reorderable elements in order; handleSelector → the grip inside an item; onMove(from, to)
  // → applies the move (may return a promise; it normally re-renders); afterMove(to) → optional, e.g. refocus the grip.
  // Attaching again to the same container only swaps the options, so a list can re-render and re-attach freely.
  function attach(container, options) {
    if (container._dragReorder) {
      container._dragReorder.options = options;
      return;
    }
    const state = { options, drag: null };
    container._dragReorder = state;

    const runMove = async (from, to) => {
      await state.options.onMove(from, to);
      if (state.options.afterMove) {
        state.options.afterMove(to);
      }
    };

    const layout = () => {
      const drag = state.drag;
      const { list, from, slots, scroller } = drag;
      const first = slots[0];
      const last = slots[slots.length - 1];
      const own = slots[from];
      const rawDy = drag.lastY - drag.startY + (scroller.scrollTop - drag.startScroll);
      const dy = Math.min(Math.max(rawDy, first.top - own.top), last.top + last.height - own.top - own.height);
      drag.to = dropIndex(slots, from, own.top + own.height / 2 + dy);
      list.forEach((item, i) => {
        let shift = 0;
        if (i === from) {
          shift = dy;
        } else if (from < drag.to && i > from && i <= drag.to) {
          shift = -drag.step;
        } else if (from > drag.to && i < from && i >= drag.to) {
          shift = drag.step;
        }
        item.style.transform = shift ? `translateY(${shift}px)` : "";
      });
    };

    const tick = () => {
      const drag = state.drag;
      if (!drag) {
        return;
      }
      const bounds = scrollBounds(drag.scroller);
      if (drag.lastY < bounds.top + EDGE_PX) {
        drag.scroller.scrollTop -= SCROLL_STEP_PX;
      } else if (drag.lastY > bounds.bottom - EDGE_PX) {
        drag.scroller.scrollTop += SCROLL_STEP_PX;
      }
      layout();
      drag.raf = requestAnimationFrame(tick);
    };

    const finish = commit => {
      const drag = state.drag;
      if (!drag) {
        return;
      }
      state.drag = null;
      cancelAnimationFrame(drag.raf);
      if (drag.handle.hasPointerCapture && drag.handle.hasPointerCapture(drag.pointerId)) {
        drag.handle.releasePointerCapture(drag.pointerId);
      }
      drag.list.forEach(item => {
        item.style.transform = "";
      });
      drag.list[drag.from].classList.remove("is-dragging");
      container.classList.remove("is-reordering");
      document.body.classList.remove("is-drag-reordering");
      if (!commit || drag.to === drag.from) {
        return;
      }
      // Show the new order at once; onMove re-renders from the data
      const moved = drag.list[drag.from];
      const target = drag.list[drag.to];
      target.parentNode.insertBefore(moved, drag.to > drag.from ? target.nextSibling : target);
      runMove(drag.from, drag.to);
    };

    container.addEventListener("pointerdown", event => {
      const handle = event.target.closest(state.options.handleSelector);
      if (!handle || !container.contains(handle) || event.button > 0 || state.drag) {
        return;
      }
      const list = state.options.items();
      const from = list.findIndex(item => item.contains(handle));
      if (from < 0 || list.length < 2) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const scroller = scrollParentOf(container);
      const startScroll = scroller.scrollTop;
      const slots = list.map(item => {
        const rect = item.getBoundingClientRect();
        return { top: rect.top + startScroll, height: rect.height };
      });
      const neighbour = slots[from + 1] ? from + 1 : from - 1;
      const gap = Math.abs(slots[neighbour].top - slots[from].top) - (neighbour > from ? slots[from].height : slots[neighbour].height);
      state.drag = {
        pointerId: event.pointerId,
        handle,
        list,
        from,
        to: from,
        slots,
        scroller,
        startScroll,
        startY: event.clientY,
        lastY: event.clientY,
        step: slots[from].height + Math.max(gap, 0),
        raf: 0
      };
      handle.setPointerCapture(event.pointerId);
      list[from].classList.add("is-dragging");
      container.classList.add("is-reordering");
      document.body.classList.add("is-drag-reordering");
      tick();
    });

    container.addEventListener("pointermove", event => {
      if (state.drag && event.pointerId === state.drag.pointerId) {
        state.drag.lastY = event.clientY;
      }
    });
    container.addEventListener("pointerup", event => {
      if (state.drag && event.pointerId === state.drag.pointerId) {
        // The last move and the release can land in one frame: place the item from the release point
        state.drag.lastY = event.clientY;
        layout();
        finish(true);
      }
    });
    container.addEventListener("pointercancel", () => finish(false));

    // A grip never opens the row it sits in
    container.addEventListener("click", event => {
      if (event.target.closest(state.options.handleSelector)) {
        event.stopPropagation();
        event.preventDefault();
      }
    }, true);

    container.addEventListener("keydown", event => {
      const handle = event.target.closest(state.options.handleSelector);
      if (!handle || state.drag || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) {
        return;
      }
      const list = state.options.items();
      const from = list.findIndex(item => item.contains(handle));
      const to = from + (event.key === "ArrowUp" ? -1 : 1);
      event.preventDefault();
      event.stopPropagation();
      if (from >= 0 && to >= 0 && to < list.length) {
        runMove(from, to);
      }
    });
  }

  return { moveItem, dropIndex, attach };
});
