import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  createOrganizationAction: vi.fn(),
  requestPasswordResetAction: vi.fn(),
  signUpAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("@/lib/organizations/actions", () => ({
  createOrganizationAction: actions.createOrganizationAction,
  switchOrganizationAction: vi.fn(),
}));
vi.mock("@/lib/auth/actions", () => ({
  requestPasswordResetAction: actions.requestPasswordResetAction,
  signUpAction: actions.signUpAction,
}));

import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { RegisterForm } from "@/components/auth/register-form";
import { OnboardingForm } from "@/components/onboarding/onboarding-form";

beforeEach(() => {
  vi.clearAllMocks();
});

async function fillOnboarding(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Naziv firme ili radnje"), "Klima Servis Marko");
  await user.selectOptions(screen.getByLabelText("Vrsta delatnosti"), "hvac_service");
  await user.type(screen.getByLabelText("Telefon"), "064 123 4567");
  await user.type(screen.getByLabelText("E-mail firme"), "info@klima.rs");
}

describe("OnboardingForm", () => {
  it("defaults to Serbia, RSD and Europe/Belgrade", () => {
    render(<OnboardingForm />);
    expect(screen.getByLabelText("Država")).toHaveValue("RS");
    expect(screen.getByLabelText("Valuta")).toHaveValue("RSD");
    expect(screen.getByLabelText("Vremenska zona")).toHaveValue("Europe/Belgrade");
  });

  it("[14] shows errors for missing required fields and doesn't submit", async () => {
    const user = userEvent.setup();
    render(<OnboardingForm />);
    await user.click(screen.getByRole("button", { name: "Sačuvaj i nastavi" }));

    expect(await screen.findAllByText("Ovo polje je obavezno.")).toHaveLength(3);
    expect(screen.getByText("Izaberite jednu od ponuđenih opcija.")).toBeInTheDocument();
    expect(screen.getByLabelText("Naziv firme ili radnje")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(actions.createOrganizationAction).not.toHaveBeenCalled();
  });

  it("[16] a double submit sends exactly one request", async () => {
    let release: (value: unknown) => void = () => {};
    actions.createOrganizationAction.mockImplementation(
      () => new Promise((resolve) => (release = resolve)),
    );
    const user = userEvent.setup();
    render(<OnboardingForm />);
    await fillOnboarding(user);

    const button = screen.getByRole("button", { name: "Sačuvaj i nastavi" });
    await user.dblClick(button);
    await user.click(button);

    await waitFor(() =>
      expect(actions.createOrganizationAction).toHaveBeenCalledTimes(1),
    );
    expect(screen.getByRole("button", { name: /Čuvamo firmu/ })).toBeDisabled();

    await act(async () => release({ ok: false, message: "Greška" }));
  });

  it("[16] retries reuse the same idempotency key", async () => {
    actions.createOrganizationAction.mockResolvedValue({
      ok: false,
      message: "Firmu nije bilo moguće sačuvati. Proverite podatke i pokušajte ponovo.",
    });
    const user = userEvent.setup();
    render(<OnboardingForm />);
    await fillOnboarding(user);

    await user.click(screen.getByRole("button", { name: "Sačuvaj i nastavi" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("pokušajte ponovo");
    await user.click(screen.getByRole("button", { name: "Sačuvaj i nastavi" }));

    await waitFor(() =>
      expect(actions.createOrganizationAction).toHaveBeenCalledTimes(2),
    );
    const [first, second] = actions.createOrganizationAction.mock.calls.map(
      ([input]) => input,
    );
    expect(first.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(second.idempotencyKey).toBe(first.idempotencyKey);
    expect(first).not.toHaveProperty("ownerId");
  });
});

describe("ForgotPasswordForm", () => {
  it("[6] shows the neutral confirmation message", async () => {
    actions.requestPasswordResetAction.mockResolvedValue({
      ok: true,
      message:
        "Ako postoji nalog sa ovom adresom, poslali smo uputstvo za promenu lozinke.",
    });
    const user = userEvent.setup();
    render(<ForgotPasswordForm />);
    await user.type(screen.getByLabelText("E-mail"), "bilo.ko@primer.rs");
    await user.click(screen.getByRole("button", { name: "Pošalji uputstvo" }));

    expect(
      await screen.findByText(
        "Ako postoji nalog sa ovom adresom, poslali smo uputstvo za promenu lozinke.",
      ),
    ).toBeInTheDocument();
  });
});

describe("RegisterForm", () => {
  it("[1]-[5] validates in the browser with the shared schema before calling the server", async () => {
    const user = userEvent.setup();
    render(<RegisterForm />);
    await user.type(screen.getByLabelText("E-mail"), "nije-email");
    await user.type(screen.getByLabelText("Lozinka"), "kratka");
    await user.type(screen.getByLabelText("Potvrda lozinke"), "drugacija");
    await user.click(screen.getByRole("button", { name: "Napravi nalog" }));

    expect(
      await screen.findByText("Unesite ispravnu e-mail adresu."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Lozinka mora imati najmanje 10 karaktera."),
    ).toBeInTheDocument();
    expect(screen.getByText("Lozinke se ne poklapaju.")).toBeInTheDocument();
    expect(
      screen.getByText("Morate prihvatiti uslove korišćenja i politiku privatnosti."),
    ).toBeInTheDocument();
    expect(actions.signUpAction).not.toHaveBeenCalled();
  });

  it("[1] submits a valid form once and shows the check-email message", async () => {
    actions.signUpAction.mockResolvedValue({ ok: true, message: "Proverite e-mail." });
    const user = userEvent.setup();
    render(<RegisterForm />);
    await user.type(screen.getByLabelText("Ime i prezime"), "Marko Marković");
    await user.type(screen.getByLabelText("E-mail"), "marko@primer.rs");
    await user.type(screen.getByLabelText("Lozinka"), "dugacka-lozinka");
    await user.type(screen.getByLabelText("Potvrda lozinke"), "dugacka-lozinka");
    await user.click(screen.getByLabelText(/Prihvatam uslove/));
    await user.click(screen.getByRole("button", { name: "Napravi nalog" }));

    expect(await screen.findByText("Proverite e-mail.")).toBeInTheDocument();
    expect(actions.signUpAction).toHaveBeenCalledTimes(1);
    expect(actions.signUpAction).toHaveBeenCalledWith(
      expect.objectContaining({ email: "marko@primer.rs", acceptTerms: true }),
    );
  });
});
