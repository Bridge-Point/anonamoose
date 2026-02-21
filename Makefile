.PHONY: help build up down restart logs clean

help:
	@echo "Anonamoose - LLM Anonymization Proxy"
	@echo ""
	@echo "Available commands:"
	@echo "  make build    - Build all Docker images"
	@echo "  make up       - Start all services (daemon)"
	@echo "  make start    - Start all services (foreground)"
	@echo "  make down     - Stop all services"
	@echo "  make restart - Restart all services"
	@echo "  make logs     - View logs"
	@echo "  make clean    - Remove all containers and volumes"
	@echo ""
	@echo "Services:"
	@echo "  http://localhost:3100 - Proxy API"
	@echo "  http://localhost:3101 - Management API"  
	@echo "  http://localhost:3102 - Stats Dashboard"

build:
	docker-compose -f docker/docker-compose.yml build

up:
	docker-compose -f docker/docker-compose.yml up -d
	@echo ""
	@echo "Anonamoose is running!"
	@echo "  Proxy:      http://localhost:3100"
	@echo "  Management: http://localhost:3101"
	@echo "  Dashboard:  http://localhost:3102"
	@echo ""
	@echo "Don't forget to set STATS_TOKEN in .env file!"

start:
	docker-compose -f docker/docker-compose.yml up

down:
	docker-compose -f docker/docker-compose.yml down

restart:
	docker-compose -f docker/docker-compose.yml restart

logs:
	docker-compose -f docker/docker-compose.yml logs -f

clean:
	docker-compose -f docker/docker-compose.yml down -v
