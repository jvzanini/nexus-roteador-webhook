export interface WhatsAppEvent {
  id: string;
  label: string;
  description: string;
}

export interface WhatsAppEventCategory {
  id: string;
  label: string;
  description: string;
  icon: string;
  events: WhatsAppEvent[];
}

export const WHATSAPP_EVENT_CATEGORIES: WhatsAppEventCategory[] = [
  {
    id: "messages",
    label: "Mensagens",
    description: "Mensagens recebidas pelo WhatsApp (texto, midia, interacoes)",
    icon: "MessageSquare",
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
    description: "Confirmacoes de envio, entrega e leitura",
    icon: "CheckCheck",
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
    description: "Chamadas de voz recebidas e realizadas",
    icon: "Phone",
    events: [
      { id: "calls.inbound", label: "Recebida", description: "Chamada de voz recebida" },
      { id: "calls.outbound", label: "Realizada", description: "Chamada de voz realizada" },
    ],
  },
  {
    id: "account",
    label: "Conta",
    description: "Atualizacoes de status, revisao e qualidade da conta",
    icon: "UserCog",
    events: [
      { id: "account_update", label: "Atualizacao de conta", description: "Conta WhatsApp Business atualizada" },
      { id: "account_alerts", label: "Alertas de conta", description: "Alertas sobre a conta (limites, restricoes)" },
      { id: "account_review_update", label: "Revisao de conta", description: "Status de revisao da conta atualizado" },
      { id: "account_settings_update", label: "Configuracoes de conta", description: "Configuracoes da conta WhatsApp Business atualizadas" },
      { id: "phone_number_name_update", label: "Nome do numero", description: "Nome de exibicao do numero atualizado" },
      { id: "phone_number_quality_update", label: "Qualidade do numero", description: "Classificacao de qualidade do numero atualizada" },
    ],
  },
  {
    id: "templates",
    label: "Templates",
    description: "Status e qualidade dos templates de mensagem",
    icon: "FileText",
    events: [
      { id: "message_template_status_update", label: "Status do template", description: "Status de aprovacao do template alterado" },
      { id: "message_template_quality_update", label: "Qualidade do template", description: "Qualidade do template atualizada" },
      { id: "message_template_components_update", label: "Componentes do template", description: "Componentes do template atualizados" },
      { id: "template_category_update", label: "Categoria do template", description: "Categoria do template reclassificada" },
      { id: "template_correct_category_detection", label: "Deteccao de categoria correta", description: "Deteccao automatica de categoria correta para o template" },
    ],
  },
  {
    id: "business",
    label: "Negocio",
    description: "Atualizacoes de capacidade e limites do negocio",
    icon: "Briefcase",
    events: [
      { id: "business_capability_update", label: "Capacidades", description: "Capacidades do negocio atualizadas" },
      { id: "business_status_update", label: "Status do negocio", description: "Status da conta de negocio atualizado" },
    ],
  },
  {
    id: "groups",
    label: "Grupos",
    description: "Eventos de grupos do WhatsApp (lifecycle, participantes, config)",
    icon: "Users",
    events: [
      { id: "group_lifecycle_update", label: "Ciclo de vida do grupo", description: "Grupo criado, arquivado ou excluido" },
      { id: "group_participants_update", label: "Participantes do grupo", description: "Participantes adicionados ou removidos do grupo" },
      { id: "group_settings_update", label: "Configuracoes do grupo", description: "Configuracoes do grupo alteradas" },
      { id: "group_status_update", label: "Status do grupo", description: "Status do grupo atualizado" },
    ],
  },
  {
    id: "payments",
    label: "Pagamentos",
    description: "Configuracoes de pagamento",
    icon: "CreditCard",
    events: [
      { id: "payment_configuration_update", label: "Configuracao de pagamento", description: "Configuracoes de pagamento atualizadas" },
    ],
  },
  {
    id: "flows",
    label: "Flows",
    description: "Eventos de WhatsApp Flows (formularios interativos)",
    icon: "GitBranch",
    events: [
      { id: "flows", label: "Flows", description: "Eventos relacionados a WhatsApp Flows (status, erros, latencia, disponibilidade)" },
    ],
  },
  {
    id: "messaging",
    label: "Mensageria",
    description: "Handovers e ecos de mensagens entre apps",
    icon: "MessageCircle",
    events: [
      { id: "message_echoes", label: "Echo de mensagens", description: "Eco de mensagens enviadas pelo proprio numero" },
      { id: "messaging_handovers", label: "Handover de mensageria", description: "Transferencia de controle de conversa entre apps" },
      { id: "standby", label: "Standby", description: "App em modo standby aguardando controle da conversa" },
    ],
  },
  {
    id: "history",
    label: "Historico",
    description: "Eventos de historico de conversas",
    icon: "History",
    events: [
      { id: "history", label: "Historico", description: "Dados historicos de mensagens e conversas" },
    ],
  },
  {
    id: "tracking",
    label: "Rastreamento",
    description: "Eventos de rastreamento e analytics",
    icon: "BarChart3",
    events: [
      { id: "tracking_events", label: "Eventos de rastreamento", description: "Eventos de rastreamento de acoes e interacoes" },
      { id: "automatic_events", label: "Eventos automaticos", description: "Eventos gerados automaticamente pela plataforma" },
    ],
  },
  {
    id: "preferences",
    label: "Preferencias",
    description: "Preferencias do usuario",
    icon: "Settings",
    events: [
      { id: "user_preferences", label: "Preferencias do usuario", description: "Preferencias de comunicacao do usuario atualizadas" },
    ],
  },
  {
    id: "partner",
    label: "Parceiro",
    description: "Solucoes de parceiros Meta",
    icon: "Handshake",
    events: [
      { id: "partner_solutions", label: "Solucoes de parceiro", description: "Eventos relacionados a solucoes e integracoes de parceiros" },
    ],
  },
  {
    id: "security",
    label: "Seguranca",
    description: "Alertas de seguranca da conta",
    icon: "ShieldAlert",
    events: [
      { id: "security", label: "Evento de seguranca", description: "Evento de seguranca (ex: codigo de verificacao)" },
    ],
  },
  {
    id: "smb",
    label: "SMB",
    description: "Mensagens enviadas pelo app nativo do WhatsApp Business",
    icon: "Store",
    events: [
      { id: "smb_message_echoes", label: "Echo de mensagens SMB", description: "Eco de mensagens enviadas por SMB" },
      { id: "smb_app_state_sync", label: "Sincronizacao de estado SMB", description: "Sincronizacao de estado do app SMB" },
    ],
  },
];

/** Lista flat de todos os IDs de eventos validos */
export const ALL_EVENT_IDS = WHATSAPP_EVENT_CATEGORIES.flatMap((cat) =>
  cat.events.map((e) => e.id)
);

/** Total de eventos disponiveis */
export const TOTAL_EVENTS = ALL_EVENT_IDS.length; // 53
