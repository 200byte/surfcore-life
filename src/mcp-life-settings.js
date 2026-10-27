// Opt-in stdio service. Never starts a life, platform, web server or model.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerLifeTools } from './life-settings/tools.js';

const server=new McpServer({name:'surfcore-life',version:'1.0.0'});
registerLifeTools(server);
await server.connect(new StdioServerTransport());
