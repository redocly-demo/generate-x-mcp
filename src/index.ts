#!/usr/bin/env node

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import yaml from 'js-yaml';
import fs from 'fs';
import path from 'path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { randomUUID } from 'crypto';

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

      if (!('Mcp-Session-Id' in requestHeaders) && mcp.transport?.sessionId) {
        requestHeaders['Mcp-Session-Id'] = mcp.transport?.sessionId;
      }

      return fetch(input, {
        ...init,
        headers: requestHeaders,
      });
    },
  });

  console.log('Connecting to MCP server...');
  await mcp.connect(transport);
  console.log('Connected');

  try {
    // Wait for connection to be established
    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log('Getting server capabilities...');
    const capabilities = await mcp.getServerCapabilities();

    let tools: Awaited<ReturnType<typeof mcp.listTools>>['tools'] = [];
    let prompts: Awaited<ReturnType<typeof mcp.listPrompts>>['prompts'] = [];
    let resources: Awaited<ReturnType<typeof mcp.listResources>>['resources'] = [];

    if (capabilities?.tools) {
      console.log('Getting tools...');
      tools = await mcp.listTools().then(result => result.tools);
    }
    if (capabilities?.prompts) {
      console.log('Getting prompts...');
      prompts = await mcp.listPrompts().then(result => result.prompts);
    }
    if (capabilities?.resources) {
      console.log('Getting resources...');
      resources = await mcp.listResources().then(result => result.resources);
    }
    console.log('Done.');

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
    const existingPrompts = openapi['x-mcp'].prompts || [];
    const existingPromptsMap = new Map(existingPrompts.map((prompt: any) => [prompt.name, prompt]));
    const existingResources = openapi['x-mcp'].resources || [];
    const existingResourcesMap = new Map(existingResources.map((resource: any) => [resource.name, resource]));

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

    const mergedPrompts = prompts.map(prompt => {
      const existingPrompt = existingPromptsMap.get(prompt.name) as any;
      const existingArguments = existingPrompt?.arguments || [];
      const existingArgumentsMap = new Map(existingArguments.map((argument: any) => [argument.name, argument]));
      const mergedArguments = prompt.arguments?.map(argument => {
        const existingArgument = existingArgumentsMap.get(argument.name) as any;
        if (existingArgument) {
          return {
            ...argument,
            example: existingArgument.example,
          };
        } else {
          return argument;
        }
      });
      if (existingPrompt) {
        return {
          ...prompt,
          tags: existingPrompt.tags,
          security: existingPrompt.security,
          arguments: mergedArguments,
        };
      }
      return prompt;
    });
    const mergedResources = resources.map(resource => {
      const existingResource = existingResourcesMap.get(resource.name) as any;
      if (existingResource) {
        return {
          ...resource,
          tags: existingResource.tags,
          security: existingResource.security,
        };
      }
      return resource;
    });

    openapi['x-mcp'].capabilities = capabilities;
    if (mergedTools.length > 0) {
      openapi['x-mcp'].tools = mergedTools;
    }
    if (mergedPrompts.length > 0) {
      openapi['x-mcp'].prompts = mergedPrompts;
    }
    if (mergedResources.length > 0) {
      openapi['x-mcp'].resources = mergedResources;
    }

    fs.writeFileSync(openapiFilePath, yaml.dump(openapi));

    if (openapiFileExists) {
      console.log(`Successfully updated ${openapiFilePath}`);
    } else {
      console.log(`Successfully created ${openapiFilePath}`);
      console.log('⚠️ Please update the file with more information.');
    }
  } finally {
    await mcp.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
