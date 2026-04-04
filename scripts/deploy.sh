#!/bin/bash
# ===========================================
# Deploy do Nexus Roteador Webhook via Portainer API
# Uso: ./scripts/deploy.sh [create|update|redeploy]
# ===========================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Carregar variáveis de produção
if [ ! -f "$PROJECT_DIR/.env.production" ]; then
  echo "Erro: .env.production não encontrado"
  exit 1
fi

source "$PROJECT_DIR/.env.production"

# Validar variáveis necessárias
if [ -z "$PORTAINER_URL" ] || [ -z "$PORTAINER_TOKEN" ]; then
  echo "Erro: PORTAINER_URL e PORTAINER_TOKEN devem estar definidos no .env.production"
  exit 1
fi

STACK_NAME="nexus-roteador-webhook"
ENDPOINT_ID="${PORTAINER_ENDPOINT_ID:-1}"
STACK_FILE="$PROJECT_DIR/docker-compose.production.yml"
API="$PORTAINER_URL/api"
AUTH_HEADER="X-API-Key: $PORTAINER_TOKEN"

# Ler conteúdo da stack
STACK_CONTENT=$(cat "$STACK_FILE")

# Buscar ID da stack se existir
get_stack_id() {
  curl -s -k -H "$AUTH_HEADER" "$API/stacks" | \
    python3 -c "import sys,json; stacks=json.load(sys.stdin); matches=[s['Id'] for s in stacks if s['Name']=='$STACK_NAME']; print(matches[0] if matches else '')" 2>/dev/null
}

# Criar stack nova
create_stack() {
  echo "Criando stack '$STACK_NAME'..."

  RESPONSE=$(curl -s -k -w "\n%{http_code}" \
    -H "$AUTH_HEADER" \
    -H "Content-Type: application/json" \
    -X POST "$API/stacks/create/swarm/string?endpointId=$ENDPOINT_ID" \
    -d "$(python3 -c "
import json, sys
stack_content = open('$STACK_FILE').read()
payload = {
    'name': '$STACK_NAME',
    'stackFileContent': stack_content,
    'swarmID': '$(get_swarm_id)'
}
print(json.dumps(payload))
")")

  HTTP_CODE=$(echo "$RESPONSE" | tail -1)
  BODY=$(echo "$RESPONSE" | head -n -1)

  if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ]; then
    STACK_ID=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['Id'])" 2>/dev/null)
    echo "Stack criada com sucesso! ID: $STACK_ID"
  else
    echo "Erro ao criar stack (HTTP $HTTP_CODE):"
    echo "$BODY" | python3 -m json.tool 2>/dev/null || echo "$BODY"
    exit 1
  fi
}

# Atualizar stack existente
update_stack() {
  STACK_ID=$(get_stack_id)

  if [ -z "$STACK_ID" ]; then
    echo "Stack '$STACK_NAME' não encontrada. Use 'create' primeiro."
    exit 1
  fi

  echo "Atualizando stack '$STACK_NAME' (ID: $STACK_ID)..."

  RESPONSE=$(curl -s -k -w "\n%{http_code}" \
    -H "$AUTH_HEADER" \
    -H "Content-Type: application/json" \
    -X PUT "$API/stacks/$STACK_ID?endpointId=$ENDPOINT_ID" \
    -d "$(python3 -c "
import json
stack_content = open('$STACK_FILE').read()
payload = {
    'stackFileContent': stack_content,
    'prune': True,
    'pullImage': True
}
print(json.dumps(payload))
")")

  HTTP_CODE=$(echo "$RESPONSE" | tail -1)
  BODY=$(echo "$RESPONSE" | head -n -1)

  if [ "$HTTP_CODE" = "200" ]; then
    echo "Stack atualizada com sucesso!"
  else
    echo "Erro ao atualizar stack (HTTP $HTTP_CODE):"
    echo "$BODY" | python3 -m json.tool 2>/dev/null || echo "$BODY"
    exit 1
  fi
}

# Redeploy (pull imagem nova + restart)
redeploy_stack() {
  STACK_ID=$(get_stack_id)

  if [ -z "$STACK_ID" ]; then
    echo "Stack '$STACK_NAME' não encontrada. Use 'create' primeiro."
    exit 1
  fi

  echo "Redeployando stack '$STACK_NAME' (ID: $STACK_ID)..."
  echo "Isso vai puxar a imagem mais recente e reiniciar os serviços."

  update_stack
}

# Obter Swarm ID
get_swarm_id() {
  curl -s -k -H "$AUTH_HEADER" "$API/endpoints/$ENDPOINT_ID/docker/swarm" | \
    python3 -c "import sys,json; print(json.load(sys.stdin)['ID'])" 2>/dev/null
}

# Status da stack
status_stack() {
  STACK_ID=$(get_stack_id)

  if [ -z "$STACK_ID" ]; then
    echo "Stack '$STACK_NAME' não encontrada."
    exit 1
  fi

  echo "Status da stack '$STACK_NAME' (ID: $STACK_ID):"
  echo ""

  curl -s -k -H "$AUTH_HEADER" "$API/stacks/$STACK_ID" | \
    python3 -c "
import sys, json
s = json.load(sys.stdin)
print(f\"  Nome: {s['Name']}\")
print(f\"  Status: {'Ativa' if s['Status'] == 1 else 'Inativa'}\")
print(f\"  Tipo: {'Swarm' if s['Type'] == 1 else 'Compose'}\")
print(f\"  Criada: {s.get('CreationDate', 'N/A')}\")
print(f\"  Atualizada: {s.get('UpdateDate', 'N/A')}\")
" 2>/dev/null
}

# Menu
case "${1:-}" in
  create)
    create_stack
    ;;
  update)
    update_stack
    ;;
  redeploy)
    redeploy_stack
    ;;
  status)
    status_stack
    ;;
  *)
    echo "Uso: $0 {create|update|redeploy|status}"
    echo ""
    echo "  create   - Cria a stack no Portainer (primeira vez)"
    echo "  update   - Atualiza a stack (variáveis, configuração)"
    echo "  redeploy - Pull imagem nova + restart dos serviços"
    echo "  status   - Mostra status da stack"
    exit 1
    ;;
esac
