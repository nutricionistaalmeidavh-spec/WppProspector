import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/api/client";

export type SetupStep = "business" | "crm" | "whatsapp" | "rules" | "review";
export type SetupStatus = "pending" | "completed" | "skipped";
export type TourStatus = "not_started" | "in_progress" | "skipped" | "completed";
export type BusinessProfile = {
  name: string; segment: string; description: string; openingHours: string;
  paymentMethods: string; deliveryPolicy: string; returnPolicy: string;
  additionalInstructions: string; products: Array<{name:string;description:string;price:string}>;
  faq: Array<{question:string;answer:string}>;
};
export interface OnboardingState {
  setup: Record<SetupStep,SetupStatus>;
  ready: boolean;
  profileConfigured: boolean;
  role: "admin" | "manager" | "agent";
  tour: {status:TourStatus;index:number};
  firstOperation: null | {leadPhone:string;opportunityId:string;completedAt:string};
  draft: {leadPhone:string|null;companyId:string|null;opportunityId:string|null};
}
export interface OnboardingAnalytics {
  setup: OnboardingState["setup"];
  ready: boolean;
  profileConfigured: boolean;
  firstOperations: number;
  tours: Record<string,number>;
}
export const onboardingKey = ["onboarding","state"] as const;
export function useOnboardingState(enabled = true) {
  return useQuery({
    queryKey: onboardingKey,
    queryFn: () => apiFetch<OnboardingState>("/onboarding/state"),
    enabled, retry: false, staleTime: 10_000,
  });
}
export function updateSetup(step:SetupStep,status:SetupStatus) {
  return apiFetch("/onboarding/setup",{method:"PUT",body:{step,status}});
}
export function updateTour(index:number,status:TourStatus) {
  return apiFetch("/onboarding/tour",{method:"PUT",body:{index,status}});
}
export function updateFirstOperationProgress(data:{
  leadPhone?:string|null;companyId?:string|null;opportunityId?:string|null;
}) {
  return apiFetch<OnboardingState["draft"]>("/onboarding/first-operation/progress",{method:"PUT",body:data});
}
export function completeFirstOperation(leadPhone:string,opportunityId:string) {
  return apiFetch<NonNullable<OnboardingState["firstOperation"]>>("/onboarding/first-operation",{
    method:"POST",body:{leadPhone,opportunityId},
  });
}
