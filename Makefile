.PHONY: generate validate check

generate:
	cd video/schema && $(MAKE) generate

validate:
	cd video/schema && $(MAKE) validate

check:
	cd video/schema && $(MAKE) check
