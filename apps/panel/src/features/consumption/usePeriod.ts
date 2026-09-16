import { useMemo, useState } from "react";

export type PeriodPreset = "today" | "7d" | "30d" | "custom";

export interface ResolvedPeriod {
  preset: PeriodPreset;
  from: string;
  to: string;
  setPreset: (preset: PeriodPreset) => void;
  setCustom: (range: { from: string; to: string }) => void;
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function daysAgo(days: number): Date {
  const start = startOfToday();
  start.setDate(start.getDate() - days);
  return start;
}

/** Resolve o preset selecionado num intervalo `from`/`to` em ISO 8601. */
export function usePeriod(initial: PeriodPreset = "7d"): ResolvedPeriod {
  const [preset, setPreset] = useState<PeriodPreset>(initial);
  const [custom, setCustom] = useState<{ from: string; to: string }>(() => ({
    from: daysAgo(7).toISOString().slice(0, 10),
    to: startOfToday().toISOString().slice(0, 10),
  }));

  const { from, to } = useMemo(() => {
    const now = new Date();
    if (preset === "today") {
      return { from: startOfToday().toISOString(), to: now.toISOString() };
    }
    if (preset === "7d") {
      return { from: daysAgo(7).toISOString(), to: now.toISOString() };
    }
    if (preset === "30d") {
      return { from: daysAgo(30).toISOString(), to: now.toISOString() };
    }
    return {
      from: new Date(`${custom.from}T00:00:00.000Z`).toISOString(),
      to: new Date(`${custom.to}T23:59:59.999Z`).toISOString(),
    };
  }, [preset, custom]);

  return { preset, from, to, setPreset, setCustom };
}
