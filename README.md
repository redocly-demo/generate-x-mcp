# Generate x-mcp

Use this tool to generate and update the OpenAPI specification file with the `x-mcp` vendor extension.

## Usage

```shell
npm exec generate-x-mcp \\
  --openapi-file api-spec/openapi.yaml \\
  --server-url https://example.com/mcp \\
  -H "Auth-Header: <header-value>"
```

If the file provided in the `--openapi-file` parameter does not exist, the tool will create it with the default values.
If it exists, the tool will update `x-mcp.tools` with the corresponding values received from the MCP server.

You can provide as many extra headers as you need by adding the `-H` flag multiple times.
