# Makefile — orquestra os comandos documentados no AGENTS.md
# Monorepo sem package.json na raiz: cada pacote instala suas próprias deps.

API := packages/api
WEB := packages/web
E2E := e2e

.DEFAULT_GOAL := help
.PHONY: help setup dev test lint build install db-up migrate seed clean e2e e2e-setup

help: ## Lista os alvos disponíveis
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'

setup: install db-up migrate seed ## Instala deps + sobe Postgres + migra + popula o banco
	@echo "Setup concluído. Rode 'make dev'."

install: ## Instala dependências de todos os pacotes
	cd $(API) && npm install
	cd $(WEB) && npm install

db-up: ## Sobe o Postgres via docker compose (aguarda healthcheck)
	docker compose up -d --wait

migrate: ## Aplica as migrations e regenera o Prisma Client
	cd $(API) && npm run migrate:deploy && npm run db:generate

seed: ## Popula o banco com dados de desenvolvimento
	cd $(API) && npm run db:seed

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

clean: ## Para o Postgres e remove o volume de dados
	docker compose down -v
