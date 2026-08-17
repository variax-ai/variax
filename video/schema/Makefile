.PHONY: generate generate-ts generate-go validate check clean

generate: generate-ts generate-go

generate-ts:
	npx json2ts json/v1.json > src/v1.ts

generate-go:
	go-jsonschema --package schema json/v1.json -o go/v1.go

validate:
	npx ajv-cli@5 validate -s json/v1.json -d "tmp/examples/*.json"

check: validate
	@echo "Checking generated types are up to date..."
	@ts_bak=$$(mktemp) && cp src/v1.ts "$$ts_bak" && \
		$(MAKE) generate-ts && \
		diff -q src/v1.ts "$$ts_bak" > /dev/null 2>&1 || (echo "TypeScript types are out of date. Run 'make generate-ts'." && exit 1)
	@go_bak=$$(mktemp) && cp go/v1.go "$$go_bak" && \
		$(MAKE) generate-go && \
		diff -q go/v1.go "$$go_bak" > /dev/null 2>&1 || (echo "Go types are out of date. Run 'make generate-go'." && exit 1)
	@echo "All checks passed."

clean:
	rm -f src/v1.ts go/v1.go
