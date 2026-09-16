import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConnectionStatusBadge } from "./ConnectionStatusBadge";

describe("ConnectionStatusBadge", () => {
  it("renders nothing when show is false", () => {
    render(<ConnectionStatusBadge show={false} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByText(/offline/i)).not.toBeInTheDocument();
  });

  it("renders an offline notice when show is true", () => {
    render(<ConnectionStatusBadge show={true} />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText(/offline/i)).toBeInTheDocument();
  });
});
