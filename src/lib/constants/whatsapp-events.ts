export interface WhatsAppEvent {
  id: string;
  label: string;
  description: string;
}

export interface WhatsAppEventCategory {
  id: string;
  label: string;
  events: WhatsAppEvent[];
}

export const WHATSAPP_EVENT_CATEGORIES: WhatsAppEventCategory[] = [
  {
    id: "messages",
    label: "Mensagens",
    events: [
      { id: "messages.text", label: "Texto", description: "Mensagem de texto recebida" },
      { id: "messages.image", label: "Imagem", description: "Mensagem com imagem recebida" },
      { id: "messages.audio", label: "Audio", description: "Mensagem de audio recebida" },
      { id: "messages.video", label: "Video", description: "Mensagem de video recebida" },
      { id: "messages.document", label: "Documento", description: "Mensagem com documento recebida" },
      { id: "messages.sticker", label: "Sticker", description: "Mensagem com figurinha recebida" },
      { id: "messages.location", label: "Localizacao", description: "Mensagem com localizacao recebida" },
      { id: "messages.contacts", label: "Contatos", description: "Mensagem com contatos recebida" },
      { id: "messages.reaction", label: "Reacao", description: "Reacao a mensagem recebida" },
      { id: "messages.interactive", label: "Interativo", description: "Resposta de mensagem interativa recebida" },
      { id: "messages.button", label: "Botao", description: "Resposta de botao recebida" },
      { id: "messages.order", label: "Pedido", description: "Pedido recebido via catalogo" },
      { id: "messages.referral", label: "Referral", description: "Mensagem via anuncio click-to-WhatsApp" },
      { id: "messages.system", label: "Sistema", description: "Mensagem de sistema (grupo, numero alterado)" },
      { id: "messages.request_welcome", label: "Boas-vindas", description: "Solicitacao de mensagem de boas-vindas" },
      { id: "messages.nfm_reply", label: "NFM Reply", description: "Resposta de formulario nativo (Flows)" },
      { id: "messages.unknown", label: "Desconhecido", description: "Tipo de mensagem nao mapeado" },
    ],
  },
  {
    id: "statuses",
    label: "Status de Entrega",
    events: [
      { id: "statuses.sent", label: "Enviado", description: "Mensagem enviada ao servidor WhatsApp" },
      { id: "statuses.delivered", label: "Entregue", description: "Mensagem entregue ao destinatario" },
      { id: "statuses.read", label: "Lido", description: "Mensagem lida pelo destinatario" },
      { id: "statuses.failed", label: "Falhou", description: "Falha no envio da mensagem" },
    ],
  },
  {
    id: "calls",
    label: "Chamadas",
    events: [
      { id: "calls.inbound", label: "Recebida", description: "Chamada de voz recebida" },
      { id: "calls.outbound", label: "Realizada", description: "Chamada de voz realizada" },
    ],
  },
  {
    id: "account",
    label: "Conta",
    events: [
      { id: "account_update", label: "Atualizacao de conta", description: "Conta WhatsApp Business atualizada" },
      { id: "account_alerts", label: "Alertas de conta", description: "Alertas sobre a conta (limites, restricoes)" },
      { id: "account_review_update", label: "Revisao de conta", description: "Status de revisao da conta atualizado" },
      { id: "phone_number_name_update", label: "Nome do numero", description: "Nome de exibicao do numero atualizado" },
      { id: "phone_number_quality_update", label: "Qualidade do numero", description: "Classificacao de qualidade do numero atualizada" },
    ],
  },
  {
    id: "templates",
    label: "Templates",
    events: [
      { id: "message_template_status_update", label: "Status do template", description: "Status de aprovacao do template alterado" },
      { id: "message_template_quality_update", label: "Qualidade do template", description: "Qualidade do template atualizada" },
      { id: "message_template_components_update", label: "Componentes do template", description: "Componentes do template atualizados" },
      { id: "template_category_update", label: "Categoria do template", description: "Categoria do template reclassificada" },
    ],
  },
  {
    id: "business",
    label: "Negocio",
    events: [
      { id: "business_capability_update", label: "Capacidades", description: "Capacidades do negocio atualizadas" },
    ],
  },
  {
    id: "security",
    label: "Seguranca",
    events: [
      { id: "security", label: "Evento de seguranca", description: "Evento de seguranca (ex: codigo de verificacao)" },
    ],
  },
  {
    id: "flows",
    label: "Flows",
    events: [
      { id: "flows.flow_status_change", label: "Mudanca de status", description: "Status do Flow alterado" },
      { id: "flows.client_error_rate", label: "Taxa de erro cliente", description: "Taxa de erro do lado do cliente elevada" },
      { id: "flows.endpoint_error_rate", label: "Taxa de erro endpoint", description: "Taxa de erro do endpoint elevada" },
      { id: "flows.endpoint_latency", label: "Latencia endpoint", description: "Latencia do endpoint elevada" },
      { id: "flows.endpoint_availability", label: "Disponibilidade endpoint", description: "Disponibilidade do endpoint alterada" },
      { id: "flows.flow_version_freeze_warning", label: "Aviso de congelamento", description: "Versao do Flow sera congelada em breve" },
    ],
  },
  {
    id: "smb",
    label: "SMB",
    events: [
      { id: "smb_message_echoes", label: "Echo de mensagens", description: "Eco de mensagens enviadas por SMB" },
    ],
  },
];

/** Lista flat de todos os IDs de eventos validos */
export const ALL_EVENT_IDS = WHATSAPP_EVENT_CATEGORIES.flatMap((cat) =>
  cat.events.map((e) => e.id)
);

/** Total de eventos disponiveis */
export const TOTAL_EVENTS = ALL_EVENT_IDS.length; // 41
