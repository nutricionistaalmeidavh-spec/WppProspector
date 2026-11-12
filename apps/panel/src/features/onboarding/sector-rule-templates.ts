/** Modelos iniciais conservadores. Só viram respostas automáticas após simulação e aceite. */
export interface SectorRuleProfile {
  name: string;
  segment: string;
  openingHours: string;
  paymentMethods: string;
}
export interface SectorRuleDraft {
  name: string;
  match: "contains";
  trigger: string;
  eventType: "message.received";
  action: "reply" | "handoff";
  response: string;
  enabled: boolean;
  priority: number;
  options: [];
}

const examples: Record<string, { trigger: string; response: string; name: string }> = {
  "Clínica de Estética": {
    trigger: "agendar", name: "Agendamento com avaliação",
    response: "Para agendar o procedimento, nossa equipe vai verificar a disponibilidade e orientar sobre a avaliação profissional necessária. A confirmação depende do atendimento humano.",
  },
  "Salão de Beleza e Barbearia": {
    trigger: "agendar", name: "Agendamento no salão",
    response: "Vamos verificar o serviço, o profissional e os horários disponíveis. Nossa equipe confirmará seu agendamento.",
  },
  "Clínica Odontológica": {
    trigger: "consulta", name: "Consulta odontológica",
    response: "Nossa equipe pode orientar sobre consultas e avaliação com dentista. Questões clínicas serão encaminhadas ao profissional responsável.",
  },
  "Consultório e Clínica de Saúde": {
    trigger: "consulta", name: "Consultas e especialidades",
    response: "Nossa equipe pode verificar consultas e disponibilidade. Orientações clínicas devem ser tratadas com o profissional habilitado.",
  },
  "Academia e Personal Trainer": {
    trigger: "plano", name: "Informações sobre planos",
    response: "Podemos verificar modalidades, planos e horários disponíveis com nossa equipe, sem prometer resultados físicos.",
  },
  "Imobiliária": {
    trigger: "imóvel", name: "Disponibilidade de imóveis",
    response: "Nossa equipe vai verificar as opções, a disponibilidade e os valores atualizados dos imóveis antes de enviar uma proposta.",
  },
  "Oficina Mecânica": {
    trigger: "orçamento", name: "Orçamento técnico",
    response: "Para preparar um orçamento, nossa equipe precisa conferir as informações do veículo e avaliar o serviço. Nenhum reparo será iniciado sem sua autorização.",
  },
  "Restaurante e Delivery": {
    trigger: "pedido", name: "Consulta de pedidos",
    response: "Vamos conferir os itens, o preço atualizado e a disponibilidade antes de confirmar o seu pedido com a equipe.",
  },
  "Loja de Roupas": {
    trigger: "tamanho", name: "Consulta de tamanhos",
    response: "Nossa equipe vai conferir os tamanhos e o estoque real para ajudar você na escolha.",
  },
  "Escola e Cursos": {
    trigger: "matrícula", name: "Informações sobre matrícula",
    response: "Nossa equipe pode verificar cursos, requisitos, vagas e condições de matrícula atualizadas.",
  },
  "Pet Shop e Clínica Veterinária": {
    trigger: "agendar", name: "Atendimento pet",
    response: "Nossa equipe vai verificar serviços e agenda. Dúvidas clínicas serão encaminhadas ao profissional veterinário.",
  },
  "Seguradora e Corretora de Seguros": {
    trigger: "cotação", name: "Cotação de seguro",
    response: "Nossa equipe vai avaliar a solicitação e apresentar uma cotação válida. As condições dependem da seguradora e da apólice.",
  },
  "Construção e engenharia": {
    trigger: "orçamento", name: "Orçamento de engenharia",
    response: "Nossa equipe precisa conhecer o escopo e avaliar a necessidade de visita técnica antes de informar preço e prazo.",
  },
  "Saúde e bem-estar": {
    trigger: "consulta", name: "Atendimento de saúde",
    response: "Nossa equipe pode orientar sobre serviços e horários. Questões clínicas serão encaminhadas ao profissional responsável.",
  },
  "Comércio": {
    trigger: "produto", name: "Disponibilidade de produtos",
    response: "Nossa equipe vai consultar o catálogo e a disponibilidade real antes de confirmar qualquer produto ou preço.",
  },
  "Serviços": {
    trigger: "orçamento", name: "Orçamento de serviços",
    response: "Nossa equipe vai avaliar sua necessidade e confirmar o valor e os prazos do serviço antes de apresentar a proposta.",
  },
};
export function buildSectorRules(profile: SectorRuleProfile): SectorRuleDraft[] {
  const segment = profile.segment.trim();
  const example = examples[segment] ?? {
    trigger: "orçamento", name: "Primeiro orçamento",
    response: "Nossa equipe vai analisar sua necessidade antes de confirmar valores, horários ou disponibilidade.",
  };
  const create = (name:string,trigger:string,response:string,priority:number,action:"reply"|"handoff"="handoff"):SectorRuleDraft => ({
    name, match:"contains", trigger, eventType:"message.received", action,
    response, enabled:true, priority, options:[],
  });
  const hours = profile.openingHours.trim();
  return [
    create(example.name,example.trigger,example.response,30),
    create("Valores e condições", "preço",
      "Nossa equipe vai confirmar os preços e condições comerciais vigentes antes de informar qualquer valor.",20),
    create("Horários de atendimento", "horário",
      hours ? "O horário de atendimento informado pela empresa é: "+hours.slice(0,500)+". A disponibilidade deve ser confirmada pela equipe." :
        "Nossa equipe vai confirmar os horários disponíveis antes de agendar qualquer atendimento.",10),
  ];
}
