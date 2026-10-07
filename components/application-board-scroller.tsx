"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

type ScrollState = {
  currentIndex: number;
  maxScroll: number;
  scrollLeft: number;
};

const initialScrollState: ScrollState = { currentIndex: 0, maxScroll: 0, scrollLeft: 0 };

export function ApplicationBoardScroller({ children, labels }: { children: ReactNode; labels: string[] }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [scrollState, setScrollState] = useState(initialScrollState);

  const syncScrollState = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const board = viewport.querySelector<HTMLElement>(".application-board");
    const columns = board ? [...board.querySelectorAll<HTMLElement>(".application-column")] : [];
    const maxScroll = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    let currentIndex = columns.reduce((closestIndex, column, index) => (
      Math.abs(column.offsetLeft - viewport.scrollLeft) < Math.abs(columns[closestIndex].offsetLeft - viewport.scrollLeft)
        ? index
        : closestIndex
    ), 0);
    if (viewport.scrollLeft <= 1) currentIndex = 0;
    if (maxScroll > 0 && viewport.scrollLeft >= maxScroll - 1) currentIndex = Math.max(0, columns.length - 1);
    setScrollState({ currentIndex, maxScroll, scrollLeft: Math.min(viewport.scrollLeft, maxScroll) });
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const board = viewport.querySelector<HTMLElement>(".application-board");
    syncScrollState();
    viewport.addEventListener("scroll", syncScrollState, { passive: true });
    window.addEventListener("resize", syncScrollState);
    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(syncScrollState);
    resizeObserver?.observe(viewport);
    if (board) resizeObserver?.observe(board);
    return () => {
      viewport.removeEventListener("scroll", syncScrollState);
      window.removeEventListener("resize", syncScrollState);
      resizeObserver?.disconnect();
    };
  }, [syncScrollState]);

  function scrollToColumn(index: number) {
    const viewport = viewportRef.current;
    const board = viewport?.querySelector<HTMLElement>(".application-board");
    const columns = board ? [...board.querySelectorAll<HTMLElement>(".application-column")] : [];
    const target = columns[Math.max(0, Math.min(index, columns.length - 1))];
    if (!viewport || !target) return;
    viewport.scrollTo({ left: target.offsetLeft, behavior: "smooth" });
  }

  function setScrollPosition(value: number) {
    viewportRef.current?.scrollTo({ left: value, behavior: "auto" });
  }

  const canScrollLeft = scrollState.scrollLeft > 1;
  const canScrollRight = scrollState.scrollLeft < scrollState.maxScroll - 1;
  const currentLabel = labels[scrollState.currentIndex] ?? labels[0] ?? "申请阶段";

  return (
    <div className="application-board-scroller">
      <div className="application-board-nav" role="group" aria-label="申请阶段横向导航">
        <p className="application-board-nav__status">
          <span>当前阶段</span>
          <strong>{currentLabel} · {scrollState.currentIndex + 1}/{labels.length}</strong>
        </p>
        <button
          aria-label="查看左侧申请阶段"
          className="application-scroll-button"
          disabled={!canScrollLeft}
          onClick={() => scrollToColumn(scrollState.currentIndex - 1)}
          type="button"
        >
          <ChevronLeft aria-hidden="true" size={19} />
        </button>
        <label className="application-scroll-range-label">
          <span className="sr-only">横向移动申请看板</span>
          <input
            aria-label="横向移动申请看板"
            className="application-scroll-range"
            disabled={scrollState.maxScroll === 0}
            max={Math.max(1, scrollState.maxScroll)}
            min="0"
            onChange={(event) => setScrollPosition(Number(event.target.value))}
            step="1"
            type="range"
            value={scrollState.scrollLeft}
          />
        </label>
        <button
          aria-label="查看右侧申请阶段"
          className="application-scroll-button"
          disabled={!canScrollRight}
          onClick={() => scrollToColumn(scrollState.currentIndex + 1)}
          type="button"
        >
          <ChevronRight aria-hidden="true" size={19} />
        </button>
      </div>
      <div
        aria-label="申请阶段看板，可横向滚动"
        className="application-board-viewport"
        ref={viewportRef}
        role="region"
        tabIndex={0}
      >
        {children}
      </div>
    </div>
  );
}
