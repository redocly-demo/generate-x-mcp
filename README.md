# Generate x-mcp

Use this tool to generate and update the OpenAPI specification file with the `x-mcp` vendor extension.

## Usage

```shell
npx @redocly/generate-x-mcp \
  --server-url https://example.com/mcp \
  --openapi-file api-spec/openapi.yaml \
  -H "Auth-Header: <header-value>"
```

### Options:

```
    --version       Show version number                              [boolean]
-f, --openapi-file  Path to the OpenAPI specification file
                                            [string] [default: "openapi.yaml"]
-s, --server-url    URL of the MCP server                  [string] [required]
-H, --header        Headers to pass to the MCP server                  [array]
-h, --help          Show help          
```