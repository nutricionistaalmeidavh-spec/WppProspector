import type { LucideIcon } from "lucide-react";
import {
  Bot,
  Building2,
  CircleDollarSign,
  FileUp,
  Inbox,
  KanbanSquare,
  LayoutDashboard,
  Megaphone,
  MessageSquareWarning,
  Settings,
  Target,
  UserRoundSearch,
} from "lucide-react";
import type { CrmModules } from "@/features/crm/runtime";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export function getNavigationGroups(crm: CrmModules): NavGroup[] {
  const enabled = <T extends NavItem>(condition: boolean, item: T): T | null =>
    condition ? item : null;
  const compact = (items: Array<NavItem | null>): NavItem[] => items.filter(Boolean) as NavItem[];

  return [
    {
      label: "",
      items: [{ to: "/overview", label: "Visão geral", icon: LayoutDashboard }],
    },
    {
      label: "CRM",
      items: compact([
        enabled(crm.opportunities, { to: "/crm/pipeline", label: "Pipeline", icon: KanbanSquare }),
        { to: "/conversations/inbox", label: "Conversas", icon: Inbox },
        enabled(crm.opportunities, { to: "/crm/opportunities", label: "Oportunidades", icon: Target }),
        { to: "/crm/leads", label: "Leads", icon: UserRoundSearch },
        enabled(crm.companies, { to: "/crm/companies", label: "Empresas", icon: Building2 }),
      ]),
    },
    {
      label: "Prospecção",
      items: compact([
        enabled(crm.campaigns, { to: "/prospecting/campaigns", label: "Campanhas", icon: Megaphone }),
        { to: "/prospecting/imports", label: "Importações", icon: FileUp },
      ]),
    },
    {
      label: "Atendimento",
      items: [{ to: "/conversations/handoff", label: "Aguardando humano", icon: MessageSquareWarning }],
    },
    {
      label: "Analytics",
      items: [{ to: "/analytics/costs", label: "Custos", icon: CircleDollarSign }],
    },
    {
      label: "",
      items: [{ to: "/settings", label: "Configurações", icon: Settings }],
    },
  ].filter((group) => group.items.length > 0);
}

export const PRODUCT_MARK = Bot;
