import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChoreCard } from "../src/features/chores/ChoreCard";
import { ChoreList } from "../src/features/chores/ChoreList";

describe("chore components", () => {
  it("renders a chore card and toggles completion", async () => {
    const onToggle = vi.fn();
    render(
      <ChoreCard
        id="chore-1"
        title="Take out trash"
        points={2}
        assignedPersonName="Kiddo"
        completed={false}
        onToggle={onToggle}
      />
    );

    expect(screen.getByText("Take out trash")).toBeInTheDocument();
    expect(screen.getByText("Kiddo")).toBeInTheDocument();
    expect(screen.getByText("2 pts")).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole("button", { name: "Mark complete" }));
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it("renders chore lists and passes the selected chore to the toggle handler", async () => {
    const onToggle = vi.fn();
    render(
      <ChoreList
        chores={[
          {
            id: "chore-1",
            title: "Feed dog",
            points: 1,
            assignedPersonName: null,
            completed: true
          }
        ]}
        onToggle={onToggle}
      />
    );

    expect(screen.getByText("Today's chores")).toBeInTheDocument();
    expect(screen.getByText("Unassigned")).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole("button", { name: "Completed" }));
    expect(onToggle).toHaveBeenCalledWith(
      expect.objectContaining({ id: "chore-1", title: "Feed dog" }),
      false
    );
  });
});
