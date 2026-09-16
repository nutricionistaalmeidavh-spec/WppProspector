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
import { CampaignDetailRoute, CampaignsRoute, ImportsRoute } from "@/features/campaigns/CampaignRoutes";
import { InboxRoute } from "@/features/inbox/InboxRoute";
import { CampaignAnalyticsRoute, ConversionsRoute, FunnelRoute } from "@/features/analytics/AnalyticsRoutes";
import { SettingsRoute } from "@/features/settings/SettingsRoute";

function ProtectedLayout() {
  const { status } = useSession();
  const location = useLocation();

  if (status === "checking") return <FullScreenLoader />;
  if (status === "anonymous") {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
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

      { path: "crm/pipeline", element: <PipelineRoute /> },
      { path: "crm/opportunities", element: <OpportunitiesRoute /> },
      { path: "crm/opportunities/:id", element: <OpportunityDetailRoute /> },
      { path: "crm/leads", element: <LeadsRoute /> },
      { path: "crm/companies", element: <CompaniesRoute /> },

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

      { path: "settings", element: <SettingsRoute /> },

      { path: "conversations", element: <Navigate to="/conversations/inbox" replace /> },
      { path: "leads", element: <Navigate to="/crm/leads" replace /> },
      { path: "consumption", element: <Navigate to="/analytics/costs" replace /> },
      { path: "*", element: <NotFoundRoute /> },
    ],
  },
];

export const router = createBrowserRouter(appRoutes, { basename: "/admin" });
