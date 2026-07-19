import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RewardBalance } from "../src/features/chores/RewardBalance";

describe("RewardBalance", () => {
  it("renders each reward balance with point totals", () => {
    render(
      <RewardBalance
        balances={[
          { personId: "person-1", displayName: "Parent", color: "#336699", balance: 4 },
          { personId: "person-2", displayName: "Kiddo", color: "#993366", balance: 11 }
        ]}
      />
    );

    expect(screen.getByRole("heading", { name: "Reward balances" })).toBeInTheDocument();
    expect(screen.getByText("Parent")).toBeInTheDocument();
    expect(screen.getByText("4 pts")).toBeInTheDocument();
    expect(screen.getByText("Kiddo")).toBeInTheDocument();
    expect(screen.getByText("11 pts")).toBeInTheDocument();
    expect(screen.getByText("Parent").closest("li")).toHaveStyle({
      backgroundColor: "#d8e2ec"
    });
  });

  it("keeps the section available when there are no balances yet", () => {
    render(<RewardBalance balances={[]} />);

    expect(screen.getByRole("heading", { name: "Reward balances" })).toBeInTheDocument();
    expect(screen.getByRole("list")).toBeEmptyDOMElement();
  });
});
