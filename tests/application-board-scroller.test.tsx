// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApplicationBoardScroller } from "@/components/application-board-scroller";

afterEach(cleanup);

function renderBoard() {
  render(
    <ApplicationBoardScroller labels={["待匹配", "面试", "Offer"]}>
      <div className="application-board">
        <div className="application-column" data-stage="needs_match" />
        <div className="application-column" data-stage="interview" />
        <div className="application-column" data-stage="offer" />
      </div>
    </ApplicationBoardScroller>,
  );

  const viewport = screen.getByRole("region", { name: "申请阶段看板，可横向滚动" });
  const columns = [...viewport.querySelectorAll<HTMLElement>(".application-column")];
  Object.defineProperties(viewport, {
    clientWidth: { configurable: true, value: 300 },
    scrollWidth: { configurable: true, value: 900 },
  });
  columns.forEach((column, index) => Object.defineProperty(column, "offsetLeft", { configurable: true, value: index * 300 }));
  viewport.scrollTo = vi.fn();
  fireEvent(window, new Event("resize"));
  return { columns, viewport };
}

describe("application board horizontal navigation", () => {
  it("provides an always-visible slider and column navigation buttons", () => {
    const { viewport } = renderBoard();

    expect(screen.getByRole("slider", { name: "横向移动申请看板" })).toHaveAttribute("max", "600");
    expect(screen.getByRole("button", { name: "查看左侧申请阶段" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "查看右侧申请阶段" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "查看右侧申请阶段" }));
    expect(viewport.scrollTo).toHaveBeenCalledWith({ behavior: "smooth", left: 300 });
  });

  it("updates the current stage after horizontal movement", () => {
    const { viewport } = renderBoard();

    viewport.scrollLeft = 300;
    fireEvent.scroll(viewport);

    expect(screen.getByText("面试 · 2/3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "查看左侧申请阶段" })).toBeEnabled();
  });

  it("identifies the final stage when a wide viewport reaches its scroll boundary", () => {
    const { viewport } = renderBoard();

    viewport.scrollLeft = 599;
    fireEvent.scroll(viewport);

    expect(screen.getByText("Offer · 3/3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "查看右侧申请阶段" })).toBeDisabled();
  });
});
