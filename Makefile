.PHONY: dev

dev:
	@trap 'kill 0' EXIT; \
	ngrok start msg-aggregator & \
	npm run dev
