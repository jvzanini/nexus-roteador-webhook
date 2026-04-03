# Nexus Roteador Webhook

Plataforma de roteamento inteligente de webhooks da Meta (WhatsApp Business API).

## Stack

- Deploy via Docker Stack (Portainer)
- Produção direta na VPS

## Setup

```bash
# Clone o repositório
git clone https://github.com/jvzanini/nexus-roteador-webhook.git

# Configure as variáveis de ambiente
cp .env.example .env

# Suba os serviços
docker stack deploy -c docker-compose.yml nexus
```

## Licença

Projeto privado.
