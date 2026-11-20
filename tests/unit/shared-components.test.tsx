import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { LoadingState } from "@/components/shared/loading-state";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";

describe("PageHeader", () => {
  it("renders title, description and the primary action for mobile and desktop", () => {
    render(
      <PageHeader
        title="Poslovi"
        description="Opis"
        primaryAction={<Button>Novi posao</Button>}
      />,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Poslovi" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Opis")).toBeInTheDocument();
    // Rendered twice: inline (desktop) and pinned above the bottom nav (mobile).
    expect(screen.getAllByRole("button", { name: "Novi posao" })).toHaveLength(2);
  });
});

describe("EmptyState", () => {
  it("renders title, description and action", () => {
    render(
      <EmptyState
        title="Prazno"
        description="Nema stavki"
        action={<Button>Dodaj</Button>}
      />,
    );
    expect(screen.getByRole("heading", { name: "Prazno" })).toBeInTheDocument();
    expect(screen.getByText("Nema stavki")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dodaj" })).toBeInTheDocument();
  });
});

describe("LoadingState", () => {
  it("announces loading with the default Serbian label", () => {
    render(<LoadingState />);
    expect(screen.getByRole("status")).toHaveTextContent("Učitavanje…");
  });
});

describe("ErrorState", () => {
  it("shows the alert and calls onRetry", async () => {
    const onRetry = vi.fn();
    render(<ErrorState onRetry={onRetry} />);

    expect(screen.getByRole("alert")).toHaveTextContent("Došlo je do greške");
    await userEvent.click(screen.getByRole("button", { name: "Pokušaj ponovo" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("hides the retry button without onRetry", () => {
    render(<ErrorState />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("ConfirmDialog", () => {
  it("opens from the trigger and confirms", async () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        title="Obrisati klijenta?"
        description="Ova radnja se ne može poništiti."
        confirmLabel="Obriši"
        destructive
        onConfirm={onConfirm}
        trigger={<Button>Obriši klijenta</Button>}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Obriši klijenta" }));
    const dialog = screen.getByRole("alertdialog", { name: "Obrisati klijenta?" });
    expect(dialog).toHaveTextContent("Ova radnja se ne može poništiti.");

    await userEvent.click(screen.getByRole("button", { name: "Obriši" }));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("cancels without confirming", async () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        title="Potvrda"
        onConfirm={onConfirm}
        trigger={<Button>Otvori</Button>}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Otvori" }));
    await userEvent.click(screen.getByRole("button", { name: "Otkaži" }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});
