# Makefile — orquestra os comandos documentados no AGENTS.md
# Monorepo sem package.json na raiz: cada pacote instala suas próprias deps.

API := packages/api
WEB := packages/web
E2E := e2e

.DEFAULT_GOAL := help
.PHONY: help setup dev test lint build install env db-up migrate seed capas screenshots clean e2e e2e-setup keycloak-export perf-seed perf-smoke perf obs-up obs-down obs-logs obs-status obs-dashboards obs-clean

help: ## Lista os alvos disponíveis
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'

setup: env install db-up migrate seed ## Cria .env + instala deps + sobe Postgres + migra + popula o banco
	@echo "Setup concluído. Rode 'make dev'."

env: ## Cria os .env de api e web a partir do .env.example (se ainda não existirem)
	# Dois arquivos, não um: o Vite lê o .env do próprio pacote, então as
	# variáveis VITE_KEYCLOAK_* nunca chegariam à SPA se ficassem só na API.
	@for pkg in $(API) $(WEB); do \
		if [ ! -f $$pkg/.env ]; then \
			cp .env.example $$pkg/.env; \
			echo "Criado $$pkg/.env a partir do .env.example."; \
		else \
			echo "$$pkg/.env já existe — mantido."; \
		fi; \
	done

install: ## Instala dependências de todos os pacotes
	cd $(API) && npm install
	cd $(WEB) && npm install

db-up: ## Sobe Postgres, capas e Keycloak via docker compose (aguarda healthcheck)
	docker compose up -d --wait

keycloak-export: ## Exporta o realm do container para keycloak/realm-biblioteca.json
	# Único jeito de preservar mudança feita no admin console: o estado vive no
	# volume, e `down -v` o leva junto. Ver keycloak/README.md.
	docker exec biblioteca-keycloak /opt/keycloak/bin/kc.sh export \
		--realm biblioteca --file /tmp/realm-biblioteca.json
	docker cp biblioteca-keycloak:/tmp/realm-biblioteca.json keycloak/realm-biblioteca.json
	@echo "Exportado. Revise o diff antes de commitar — o export traz ids e timestamps."

migrate: ## Aplica as migrations e regenera o Prisma Client
	cd $(API) && npm run migrate:deploy && npm run db:generate

seed: ## Popula o banco com dados de desenvolvimento
	cd $(API) && npm run db:seed

capas: ## Baixa as capas ainda ausentes em assets/capas/ (requer banco populado)
	# Ingestão única e manual: as imagens são versionadas no repositório, então
	# isto só é necessário ao acrescentar Livro novo. Depois rode `make seed`
	# para o banco apontar para os arquivos novos, e commite os .jpg.
	# Fontes e critérios de recusa: ADR-0008.
	cd $(API) && npm run capas:baixar

dev: ## API (porta 3000) + Web (porta 5173) em watch
	@$(MAKE) -j2 dev-api dev-web

.PHONY: dev-api dev-web
dev-api:
	cd $(API) && npm run dev
dev-web:
	cd $(WEB) && npm run dev

test: ## Vitest — todos os testes unitários e de integração
	cd $(API) && npm run test

lint: ## ESLint + TypeScript typecheck
	cd $(API) && npm run lint && npm run typecheck
	cd $(WEB) && npm run lint

build: ## Build de produção (API + Web)
	cd $(API) && npm run build
	cd $(WEB) && npm run build

e2e-setup: ## Instala deps do e2e + baixa o Chromium (primeira vez)
	cd $(E2E) && npm install && npm run install:browsers

e2e: db-up ## Testes end-to-end (Playwright) — sobe API+Web, migra e popula automaticamente
	cd $(E2E) && npm test

screenshots: db-up ## Recaptura as telas do produto em assets/images/ (usadas no README)
	cd $(E2E) && SHOTS=1 npx playwright test screenshots.spec.ts

perf-seed: ## Popula ~250k livros para os testes de performance (use -- --reset p/ recriar)
	cd $(API) && npm run db:seed:perf

perf-smoke: ## Sanidade K6 — bate em todos os endpoints uma vez (API precisa estar no ar)
	k6 run perf/smoke.js

perf: ## Testes de performance K6 — todos os cenários (requer 'make dev' + 'make perf-seed')
	@rc=0; for f in perf/scenarios/*.js; do \
		echo "▶ $$f"; k6 run "$$f" || rc=1; \
	done; \
	[ $$rc -eq 0 ] && echo "✅ Todos os thresholds passaram." || echo "❌ Algum threshold foi violado (ver acima)."; \
	exit $$rc

# ---------------------------------------------------------------------------
# Observabilidade — stack no perfil `obs` do docker-compose.yml
# Ver docs/observabilidade.md
# ---------------------------------------------------------------------------

obs-up: ## Sobe a stack de observabilidade e provisiona o input do Graylog
	docker compose --profile obs up -d --wait
	./observabilidade/graylog/provisionar-input.sh

obs-down: ## Para a stack de observabilidade (PRESERVA os dados)
	docker compose --profile obs down

obs-status: ## Verifica se cada peça do pipeline está recebendo e exportando
	./observabilidade/verificar.sh

obs-logs: ## Segue os logs do OTel Collector
	docker compose --profile obs logs -f otel-collector

obs-dashboards: ## Captura os screenshots dos dashboards do Grafana
	# Config próprio: o playwright.config.ts principal roda seed no globalSetup,
	# que apagaria justamente os dados exibidos nos dashboards.
	cd $(E2E) && OBS=1 npx playwright test --config=playwright.dashboards.config.ts

obs-clean: ## Para a stack de observabilidade e APAGA os dados (métricas, traces, logs)
	docker compose --profile obs down -v

clean: ## Para o Postgres e remove APENAS o volume do banco
	# Sem `down -v`: isso removeria também os volumes do Prometheus e do Graylog,
	# ou seja, "limpar o banco" apagaria o histórico de observabilidade.
	docker compose rm -sfv postgres
	docker volume rm -f biblioteca-com-bobshell_biblioteca-pgdata
