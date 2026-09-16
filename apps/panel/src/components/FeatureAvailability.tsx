import type { ReactNode } from "react";
import { IntegrationPendingState } from "@/components/SectionState";

export function FeatureAvailability({
  feature,
  supported,
  preview = false,
  children,
}: {
  feature: string;
  supported: boolean;
  preview?: boolean;
  children: ReactNode;
}) {
  if (!supported && !preview) return <IntegrationPendingState feature={feature} />;
  return <>{children}</>;
}
