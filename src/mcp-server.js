#!/usr/bin/env node
const { scrape } = require('./scraper');

const TOOLS = [
  {
    name: 'scrape_website',
    description: 'Scrape a website and extract structured data (metadata, links, headlines, images, tables, or full page)',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to scrape' },
        mode: { type: 'string', enum: ['full', 'metadata', 'links', 'headlines', 'images', 'tables', 'text', 'custom'], default: 'full' },
        selector: { type: 'string', description: 'CSS selector (only for custom mode)' },
      },
      required: ['url'],
    },
  },
  {
    name: 'extract_text',
    description: 'Extract clean text content from a webpage (removes scripts, styles, navigation)',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to extract text from' },
      },
      required: ['url'],
    },
  },
  {
    name: 'batch_scrape',
    description: 'Scrape multiple URLs at once and return metadata for each (max 10)',
    inputSchema: {
      type: 'object',
      properties: {
        urls: { type: 'array', items: { type: 'string' }, description: 'Array of URLs (max 10)' },
        mode: { type: 'string', default: 'metadata' },
      },
      required: ['urls'],
    },
  },
];

async function handleToolCall(name, args) {
  switch (name) {
    case 'scrape_website':
      return await scrape(args.url, { mode: args.mode || 'full', selector: args.selector });
    case 'extract_text':
      return await scrape(args.url, { mode: 'text' });
    case 'batch_scrape': {
      const urls = (args.urls || []).slice(0, 10);
      const results = await Promise.allSettled(
        urls.map((url) => scrape(url, { mode: args.mode || 'metadata' }))
      );
      return {
        count: results.length,
        results: results.map((r, i) =>
          r.status === 'fulfilled' ? r.value : { url: urls[i], error: r.reason?.message }
        ),
      };
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  const lines = buffer.split('\n');
  buffer = lines.pop();
  for (const line of lines) {
    if (line.trim()) handleMessage(line.trim());
  }
});

async function handleMessage(raw) {
  let msg;
  try { msg = JSON.parse(raw); } catch { return; }
  const { id, method, params } = msg;

  switch (method) {
    case 'initialize':
      send({ id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'web-scraper-toolkit', version: '1.0.0' } } });
      break;
    case 'notifications/initialized': break;
    case 'tools/list':
      send({ id, result: { tools: TOOLS } });
      break;
    case 'tools/call':
      try {
        const result = await handleToolCall(params.name, params.arguments || {});
        send({ id, result: { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] } });
      } catch (err) {
        send({ id, result: { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true } });
      }
      break;
    default:
      send({ id, error: { code: -32601, message: `Method not found: ${method}` } });
  }
}

function send(obj) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...obj }) + '\n'); }
process.stderr.write('web-scraper-toolkit MCP server started (stdio)\n');
