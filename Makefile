# Makefile — orquestra os comandos documentados no AGENTS.md
# Monorepo sem package.json na raiz: cada pacote instala suas próprias deps.

API := packages/api
WEB := packages/web
E2E := e2e
E2E_API := e2e-api-rest

.DEFAULT_GOAL := help
.PHONY: help setup dev test lint build install env certs theme-build db-up migrate seed capas screenshots clean e2e e2e-setup e2e-api e2e-api-setup keycloak-export perf-seed perf-smoke perf obs-up obs-down obs-logs obs-status obs-dashboards obs-clean

help: ## Lista os alvos disponíveis
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'

setup: env install db-up migrate seed ## Cria .env + instala deps + sobe Postgres + migra + popula o banco
	@echo "Setup concluído. Rode 'make dev'."

env: ## Cria os .env (raiz + api + web) a partir do .env.example (se ainda não existirem)
	# Três arquivos: o Vite lê o .env do próprio pacote (VITE_KEYCLOAK_*), e o
	# docker compose interpola KC_BOOTSTRAP_ADMIN_*/KEYCLOAK_DB_* do .env da
	# RAIZ — é de lá que vêm as credenciais do Keycloak (Fase 2).
	@if [ ! -f .env ]; then \
		cp .env.example .env; \
		echo "Criado .env (raiz) a partir do .env.example."; \
	else \
		echo ".env (raiz) já existe — mantido."; \
	fi
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

certs: ## Gera CA local + certificado https://localhost:8443 do Keycloak (primeira vez)
	# Fase 2: sslRequired: all no realm. Importe keycloak/certs/ca.crt no
	# navegador/SO para o login funcionar fora dos testes E2E.
	@./scripts/gerar-certificados.sh

theme-build: ## Regenera o JAR do tema de login (packages/theme — requer Node e Maven)
	cd packages/theme && npm install && npm run build-keycloak-theme && \
	cp dist_keycloak/keycloak-theme-for-kc-all-other-versions.jar jar/biblioteca-login.jar && \
	echo "✅ JAR atualizado em packages/theme/jar/biblioteca-login.jar (versionar como as capas)."

db-up: certs ## Sobe Postgres, capas e Keycloak via docker compose (aguarda healthcheck)
	docker compose up -d --wait

keycloak-export: ## Exporta o realm do container para keycloak/realm-biblioteca.json
	# Único jeito de preservar mudança feita no admin console: o estado vive no
	# Postgres do keycloak-db, e `down -v` o leva junto. Ver keycloak/README.md.
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

e2e-api-setup: ## Instala as deps do e2e-api-rest (sem baixar navegador)
	cd $(E2E_API) && npm install

e2e-api: db-up ## Testes E2E do contrato HTTP da API (sem navegador) — migra e popula automaticamente
	cd $(E2E_API) && npm test

screenshots: db-up ## Recaptura as telas do produto em assets/images/ (usadas no README)
	cd $(E2E) && SHOTS=1 npx playwright test screenshots.spec.ts

perf-seed: ## Popula ~250k livros para os testes de performance (use -- --reset p/ recriar)
	cd $(API) && npm run db:seed:perf

# K6 fala https com o Keycloak (:8443) usando a CA local de `make certs` —
# sem âncora no trust store do k6, pulamos a verificação (só localhost).
K6_TLS := K6_INSECURE_SKIP_TLS_VERIFY=true

perf-smoke: ## Sanidade K6 — bate em todos os endpoints uma vez (API precisa estar no ar)
	$(K6_TLS) k6 run perf/smoke.js

perf: ## Testes de performance K6 — todos os cenários (requer 'make dev' + 'make perf-seed')
	@rc=0; for f in perf/scenarios/*.js; do \
		echo "▶ $$f"; $(K6_TLS) k6 run "$$f" || rc=1; \
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
