#!/usr/bin/env node

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import yaml from 'js-yaml';
import fs from 'fs';
import path from 'path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const argv = yargs(hideBin(process.argv))
  .option('openapi-file', {
    alias: 'f',
    type: 'string',
    description: 'Path to the OpenAPI specification file',
    default: 'openapi.yaml',
  })
  .option('server-url', {
    alias: 's',
    type: 'string',
    description: 'URL of the MCP server',
    demandOption: true,
  })
  .option('header', {
    alias: 'H',
    type: 'array',
    description: 'Headers to pass to the MCP server',
  })
  .help()
  .alias('help', 'h')
  .parseSync();

async function main() {
  const headers: Record<string, string> = {};
  if (argv.header) {
    argv.header.forEach(header => {
      if (typeof header === 'string') {
        const [key, value] = header.split(': ');
        if (key && value) {
          headers[key] = value;
        }
      }
    });
  }

  const mcp = new Client({
    name: 'generate-x-mcp',
    version: '1.0.0',
    capabilities: {
      tools: {
        listChanged: true,
      },
    },
    clientInfo: {
      name: 'generate-x-mcp',
      version: '1.0.0',
    },
  });

  const transport = new StreamableHTTPClientTransport(new URL(argv.serverUrl), {
    fetch: (input: RequestInfo | URL, init?: RequestInit) => {
      const requestHeaders: Record<string, any> = {
        ...init?.headers,
        ...headers,
      };

      if (!('Accept' in requestHeaders)) {
        requestHeaders['Accept'] = 'application/json, text/event-stream';
      }
      if (!('Content-Type' in requestHeaders)) {
        requestHeaders['Content-Type'] = 'application/json';
      }

      return fetch(input, {
        ...init,
        headers: requestHeaders,
      });
    },
  });

  mcp.connect(transport);

  try {
    // Wait for connection to be established
    await new Promise(resolve => setTimeout(resolve, 1000));

    const { tools } = await mcp.listTools();
    const capabilities = await mcp.getServerCapabilities();

    const openapiFilePath = path.resolve(argv.openapiFile);
    const openapiFileExists = fs.existsSync(openapiFilePath);

    let openapi: any = {};

    if (openapiFileExists) {
      const fileContents = fs.readFileSync(openapiFilePath, 'utf8');
      openapi = yaml.load(fileContents);
    } else {
      openapi = {
        openapi: '3.1.0',
        info: {
          title: 'Example MCP API',
          description: 'Example MCP API description',
          version: '1.0.0',
          termsOfService: 'https://redocly.com/subscription-agreement/',
          contact: {
            email: 'example@example.com',
            url: 'https://example.com',
          },
        },
        paths: {},
        components: {
          securitySchemes: {},
        },
        security: [],
      };
    }

    if (!openapi.servers) {
      openapi.servers = [];
    }

    const serverUrlExists = openapi.servers.some((server: any) => server.url === argv.serverUrl);
    if (!serverUrlExists) {
      openapi.servers.push({ url: argv.serverUrl });
    }

    if (!openapi['x-mcp']) {
      openapi['x-mcp'] = {};
    }

    const existingTools = openapi['x-mcp'].tools || [];
    const existingToolsMap = new Map(existingTools.map((tool: any) => [tool.name, tool]));

    const mergedTools = tools.map(tool => {
      const existingTool = existingToolsMap.get(tool.name) as any;
      if (existingTool) {
        return {
          ...tool,
          tags: existingTool.tags,
          security: existingTool.security,
        };
      }
      return tool;
    });

    openapi['x-mcp'].capabilities = capabilities;
    openapi['x-mcp'].tools = mergedTools;

    console.log('capabilities', capabilities);

    fs.writeFileSync(openapiFilePath, yaml.dump(openapi));

    if (openapiFileExists) {
      console.log(`Successfully updated ${openapiFilePath}`);
    } else {
      console.log(`Successfully created ${openapiFilePath}`);
      console.log('⚠️ Please update the file with more information.');
    }
  } finally {
    mcp.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
