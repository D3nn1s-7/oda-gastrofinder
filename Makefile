#
# Gastrofinder – ODAS App
# (C) Ondics, 2026
#

# aktuelles Dir ist docker-compose project name
mkfile_path := $(abspath $(lastword $(MAKEFILE_LIST)))
current_dir := $(notdir $(patsubst %/,%,$(dir $(mkfile_path))))

DC_BIN = docker compose
DC_FILES = -f docker-compose.yml
ifeq ($(STANDALONE),true)
DC_FILES := ${DC_FILES} -f docker-compose.standalone.yml
endif

DC_PROJECT = ${current_dir}
DC = ${DC_BIN} ${DC_FILES}

# für Backups...
#DATE := $(shell date '+%Y%m%d-%H%M%S')
DATE := $(shell date '+%Y%m%d')

# help-systematik
# build muss phony sein (forcierter build), weil es
# als verzeichnis existiert und sonst nie gebaut werden w�rde
.PHONY: help up down down-volumes logs build bash ps config zip test check-app

help:
	@echo "# Gastrofinder – ODAS App"
	@echo "# Ondics, 2026"
	@echo "# dir = ${current_dir}"
	@echo Befehle: make ...
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "\033[36m%-30s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

.DEFAULT_GOAL := help

# allgemeine Befehle
up: ## App starten (Standalone mit STANDALONE=true)
	${DC} up -d --build --remove-orphans

down: ## App stoppen (Standalone mit STANDALONE=true)
	${DC} down

down-volumes: ## Container stopen, Volumes löschen
	${DC} down --volumes

logs: ## Show logs of all containers (stop with ctrl-c)
	${DC} logs -f -t --tail=100

build:  ## Build all containers
	${DC} build

bash: ## Bash in frontend-container
	${DC} exec oda-app sh

ps: ## what's up?
	${DC} ps

config: ## show docker-compose config 
	${DC} config

zip: ## Frisches Lieferpaket inkl. sechs Screenshots und LICENSE erstellen
	@set -eu; \
		tmpdir=$$(mktemp -d .odas-zip.XXXXXX); \
		trap 'rm -rf "$$tmpdir"' EXIT HUP INT TERM; \
		zip -qr "$$tmpdir/${current_dir}.zip" app assets app-package.json CHANGELOG.md LICENSE \
			-x '*/.DS_Store' '*/__pycache__/*' '*/__MACOSX/*'; \
		mv "$$tmpdir/${current_dir}.zip" "${current_dir}.zip"; \
		echo "${current_dir}.zip frisch erstellt"

test: ## Runtime, Metadaten und ZIP-Rezeptur prüfen (Node.js, Python 3, zip)
	node --check app/app.js
	node --check app/app-base.js
	node --test tests/*.test.cjs
	python3 -m unittest discover -s tests -p 'test_places.py'
	@for file in app-package.json odas-config/config.json assets/schema.json; do \
		python3 -m json.tool "$$file" >/dev/null || exit 1; \
	done
	python3 tools/test-package.py

check-app: ## App prüfen mit Skript aus ODAS-Tools
	echo "App prüfen"
	./../odas-tools/app-check.sh