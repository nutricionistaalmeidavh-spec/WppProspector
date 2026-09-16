import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FeatureAvailability } from "./FeatureAvailability";

describe("FeatureAvailability", () => {
  it("bloqueia recurso indisponível sem explicar detalhes de infraestrutura", () => {
    render(
      <FeatureAvailability feature="Pipeline" supported={false}>
        <button>ação falsa</button>
      </FeatureAvailability>,
    );

    expect(screen.getByText("Pipeline indisponível")).toBeInTheDocument();
    expect(screen.queryByText(/backend|capabilit/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ação falsa" })).not.toBeInTheDocument();
  });

  it("permite desenvolvimento local sem expor selo técnico", () => {
    render(
      <FeatureAvailability feature="Pipeline" supported={false} preview>
        <button>abrir pipeline</button>
      </FeatureAvailability>,
    );

    expect(screen.getByRole("button", { name: "abrir pipeline" })).toBeInTheDocument();
    expect(screen.queryByText(/preview|desenvolvimento/i)).not.toBeInTheDocument();
  });
});
