import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import RootError from "@/app/error";
import { MEMBERSHIPS_UNAVAILABLE_DIGEST } from "@/lib/auth/errors";

// What the client receives in production: message stripped, digest kept.
function serverError(
  digest: string,
  message = "PLACEHOLDER-RAW relation public.memberships",
) {
  return Object.assign(new Error(message), { digest });
}

describe("root error boundary", () => {
  it("[4] shows the safe temporary message when memberships can't be loaded", () => {
    render(
      <RootError error={serverError(MEMBERSHIPS_UNAVAILABLE_DIGEST)} retry={vi.fn()} />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Trenutno ne možemo da učitamo podatke vaše firme. Pokušajte ponovo za nekoliko trenutaka.",
    );
  });

  it("[5] 'Pokušaj ponovo' re-runs the request", async () => {
    const retry = vi.fn();
    render(
      <RootError error={serverError(MEMBERSHIPS_UNAVAILABLE_DIGEST)} retry={retry} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Pokušaj ponovo" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("[6] never renders the raw error message or digest", () => {
    const { container } = render(
      <RootError error={serverError(MEMBERSHIPS_UNAVAILABLE_DIGEST)} retry={vi.fn()} />,
    );
    expect(container.textContent).not.toMatch(
      /PLACEHOLDER-RAW|memberships|MEMBERSHIPS_UNAVAILABLE/,
    );
  });

  it("other errors get the generic message", () => {
    render(<RootError error={serverError("12345")} retry={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Došlo je do greške");
    expect(screen.getByRole("alert")).not.toHaveTextContent("podatke vaše firme");
  });
});
