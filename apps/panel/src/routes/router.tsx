import {
  createBrowserRouter,
  Navigate,
  Outlet,
  useLocation,
  type RouteObject,
} from "react-router-dom";
import { useSession } from "@/auth/session";
import { AppShell } from "@/components/AppShell";
import { FullScreenLoader } from "@/components/FullScreenLoader";
import { LoginRoute } from "@/routes/LoginRoute";
import { NotFoundRoute } from "@/routes/NotFoundRoute";
import { ConversationsRoute } from "@/features/conversations/ConversationsRoute";
import { ConversationDetailRoute } from "@/features/conversations/ConversationDetailRoute";
import { ConsumptionRoute } from "@/features/consumption/ConsumptionRoute";
import { LeadsRoute } from "@/features/leads/LeadsRoute";
import { OverviewRoute } from "@/features/overview/OverviewRoute";
import { CompaniesRoute, OpportunityDetailRoute, OpportunitiesRoute, PipelineRoute } from "@/features/crm/CrmRoutes";
import { CommercialRoute } from "@/features/crm/CommercialRoute";
import { TeamRoute } from "@/features/crm/TeamRoute";
import { CampaignDetailRoute, CampaignsRoute, ImportsRoute } from "@/features/campaigns/CampaignRoutes";
import { InboxRoute } from "@/features/inbox/InboxRoute";
import { CampaignAnalyticsRoute, ConversionsRoute, FunnelRoute } from "@/features/analytics/AnalyticsRoutes";
import { SettingsRoute } from "@/features/settings/SettingsRoute";
import { WhatsAppRoute } from "@/features/settings/WhatsAppRoute";
import { BusinessAiSettingsRoute } from "@/features/settings/BusinessAiSettingsRoute";
import { AutomationRoute } from "@/features/automations/AutomationRoute";
import { OnboardingRoute } from "@/features/onboarding/OnboardingRoute";
import { FirstOperationRoute } from "@/features/onboarding/FirstOperationRoute";
import { OnboardingAnalyticsRoute } from "@/features/onboarding/OnboardingAnalyticsRoute";
import { useOnboardingState } from "@/features/onboarding/api";

function ProtectedLayout() {
  const { status, role } = useSession();
  const onboarding = useOnboardingState(status==="authenticated" && role==="admin");
  const location = useLocation();

  if (status === "checking") return <FullScreenLoader />;
  if (status === "anonymous") {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  if (role==="admin" && !location.pathname.startsWith("/onboarding") &&
    onboarding.data && !onboarding.data.ready &&
    onboarding.data.setup.review!=="skipped" && !onboarding.data.profileConfigured) {
    return <Navigate to="/onboarding" replace/>;
  }

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

export const appRoutes: RouteObject[] = [
  { path: "/login", element: <LoginRoute /> },
  {
    element: <ProtectedLayout />,
    children: [
      { index: true, element: <Navigate to="/overview" replace /> },
      { path: "overview", element: <OverviewRoute /> },
      { path: "onboarding", element: <OnboardingRoute /> },
      { path: "onboarding/first-operation", element: <FirstOperationRoute /> },
      { path: "settings/onboarding", element: <OnboardingAnalyticsRoute /> },

      { path: "crm/pipeline", element: <PipelineRoute /> },
      { path: "crm/opportunities", element: <OpportunitiesRoute /> },
      { path: "crm/opportunities/:id", element: <OpportunityDetailRoute /> },
      { path: "crm/leads", element: <LeadsRoute /> },
      { path: "crm/companies", element: <CompaniesRoute /> },
      { path: "crm/commercial", element: <CommercialRoute /> },
      { path: "settings/team", element: <TeamRoute /> },

      { path: "prospecting/campaigns", element: <CampaignsRoute /> },
      { path: "prospecting/campaigns/:id", element: <CampaignDetailRoute /> },
      { path: "prospecting/imports", element: <ImportsRoute /> },

      { path: "conversations/inbox", element: <InboxRoute /> },
      { path: "conversations/handoff", element: <InboxRoute awaitingHuman /> },
      { path: "conversations/history", element: <ConversationsRoute /> },
      { path: "conversations/:leadPhone", element: <ConversationDetailRoute /> },

      { path: "analytics/funnel", element: <FunnelRoute /> },
      { path: "analytics/campaigns", element: <CampaignAnalyticsRoute /> },
      { path: "analytics/conversions", element: <ConversionsRoute /> },
      { path: "analytics/costs", element: <ConsumptionRoute /> },

      { path: "automations", element: <AutomationRoute /> },
      { path: "settings", element: <SettingsRoute /> },
      { path: "settings/whatsapp", element: <WhatsAppRoute /> },
      { path: "settings/business-ai", element: <BusinessAiSettingsRoute /> },

      { path: "conversations", element: <Navigate to="/conversations/inbox" replace /> },
      { path: "leads", element: <Navigate to="/crm/leads" replace /> },
      { path: "consumption", element: <Navigate to="/analytics/costs" replace /> },
      { path: "*", element: <NotFoundRoute /> },
    ],
  },
];

export const router = createBrowserRouter(appRoutes, { basename: "/admin" });
