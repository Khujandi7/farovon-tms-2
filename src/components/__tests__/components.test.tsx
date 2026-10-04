import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/trainings" }));
vi.mock("@/app/(auth)/actions", () => ({ signIn: vi.fn(), signOut: vi.fn() }));

import { EmptyState, ForbiddenState, NoRoleState } from "@/components/common/states";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { YearFilter } from "@/components/dashboard/year-filter";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { initials } from "@/components/layout/user-menu";
import { LoginForm } from "@/app/(auth)/login/login-form";
import { navItemsForRole } from "@/lib/navigation";

describe("состояния", () => {
  it("пустое состояние и отказ в доступе", () => {
    render(<EmptyState title="Обучений пока нет" description="Записи появятся после импорта." />);
    expect(screen.getByText("Обучений пока нет")).toBeInTheDocument();
    render(<ForbiddenState />);
    expect(screen.getByText("Нет доступа к разделу")).toBeInTheDocument();
    render(<NoRoleState />);
    expect(screen.getByText("Учётная запись не активирована")).toBeInTheDocument();
  });
});

describe("KpiCard", () => {
  it("ограниченная карточка не показывает чисел", () => {
    render(<KpiCard card={{ id: "actual", label: "Фактические расходы", value: "Нет доступа", hint: "Финансовые данные недоступны для вашей роли", state: "restricted", financial: true }} />);
    const card = screen.getByTestId("kpi-actual");
    expect(card).toHaveAttribute("data-state", "restricted");
    expect(card).toHaveTextContent("Нет доступа");
    expect(card.textContent).not.toMatch(/\d/);
    expect(screen.getByLabelText("Ограничено ролью")).toBeInTheDocument();
  });
});

describe("SidebarNav", () => {
  it("HR не видит бюджет; активный раздел отмечен", () => {
    render(<SidebarNav sections={navItemsForRole("HR").map((i) => i.id)} />);
    expect(screen.queryByRole("link", { name: /Бюджет/ })).toBeNull();
    expect(screen.getByRole("link", { name: /Обучения/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /Качество данных/ })).toBeInTheDocument();
  });
});

describe("YearFilter", () => {
  it("выбранный год отмечен, ссылки ведут на ?year=", () => {
    render(<YearFilter years={[2026, 2025]} selected={2025} />);
    expect(screen.getByRole("link", { name: "2025" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "2026" })).toHaveAttribute("href", "/dashboard?year=2026");
  });
});

describe("LoginForm", () => {
  it("только вход: email, пароль, кнопка; без регистрации", () => {
    render(<LoginForm next="/budget" />);
    expect(screen.getByLabelText("Email")).toHaveAttribute("type", "email");
    expect(screen.getByLabelText("Пароль")).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: "Войти" })).toBeInTheDocument();
    expect(screen.queryByText(/регистр/i)).toBeNull();
    expect(document.querySelector('input[name="next"]')).toHaveValue("/budget");
  });
});

describe("initials", () => {
  it("две буквы из ФИО", () => {
    expect(initials("Тестов Тест")).toBe("ТТ");
    expect(initials("")).toBe("?");
  });
});
