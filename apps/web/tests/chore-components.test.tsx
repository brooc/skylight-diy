import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ChoreCard } from "../src/features/chores/ChoreCard";
import { ChoreList } from "../src/features/chores/ChoreList";

describe("chore components", () => {
  it("renders a chore card and toggles completion", async () => {
    const selectedStates: boolean[] = [];
    render(
      <ChoreCard
        id="chore-1"
        title="Take out trash"
        points={2}
        assignedPersonName="Kiddo"
        assignedPersonColor="#336699"
        completed={false}
        onToggle={(completed) => selectedStates.push(completed)}
      />
    );

    expect(screen.getByText("Take out trash")).toBeInTheDocument();
    expect(screen.getByText("Kiddo · Every day")).toBeInTheDocument();
    expect(screen.getByText("2 pts")).toBeInTheDocument();
    expect(screen.getByText("Take out trash").closest("article")).toHaveStyle({
      backgroundColor: "#d8e2ec"
    });

    await userEvent.setup().click(screen.getByRole("button", { name: "Mark complete" }));
    expect(selectedStates).toEqual([true]);
  });

  it("renders chore lists and passes the selected chore to the toggle handler", async () => {
    const toggleCalls: Array<{ id: string; title: string; completed: boolean }> = [];
    render(
      <ChoreList
        people={[
          {
            personId: "kid-id",
            displayName: "Kiddo",
            color: "#336699"
          }
        ]}
        showCompleted
        chores={[
          {
            id: "chore-1",
            title: "Feed dog",
            points: 1,
            assignedPersonId: "kid-id",
            assignedPersonName: "Kiddo",
            completed: true
          }
        ]}
        onToggle={(chore, completed) =>
          toggleCalls.push({
            id: chore.id,
            title: chore.title,
            completed
          })
        }
      />
    );

    expect(screen.getByText("Today's tasks")).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Kiddo tasks" })).toBeInTheDocument();
    expect(screen.getByText("1 of 1")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Kiddo task progress" })).toHaveAttribute(
      "aria-valuenow",
      "1"
    );
    expect(screen.getByText("Every day")).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole("button", { name: "Completed" }));
    expect(toggleCalls).toEqual([{ id: "chore-1", title: "Feed dog", completed: false }]);
  });

  it("keeps progress visible while completed tasks are hidden", () => {
    render(
      <ChoreList
        people={[
          {
            personId: "kid-id",
            displayName: "Kiddo",
            color: "#336699"
          },
          {
            personId: "parent-id",
            displayName: "Parent",
            color: "#993366"
          }
        ]}
        showCompleted={false}
        chores={[
          {
            id: "done",
            title: "Feed dog",
            points: 1,
            assignedPersonId: "kid-id",
            assignedPersonName: "Kiddo",
            completed: true
          },
          {
            id: "open",
            title: "Pack bag",
            points: 1,
            assignedPersonId: null,
            assignedPersonName: null,
            completed: false
          }
        ]}
        onToggle={() => undefined}
      />
    );

    expect(screen.queryByText("Feed dog")).not.toBeInTheDocument();
    expect(screen.getByText("All done for today")).toBeInTheDocument();
    expect(screen.getByText("Pack bag")).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Parent tasks" })).toHaveTextContent(
      "No tasks today"
    );
    expect(screen.getByRole("article", { name: "Family tasks" })).toBeInTheDocument();
  });
});
