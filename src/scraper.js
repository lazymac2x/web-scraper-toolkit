const https = require('https');
const http = require('http');
const cheerio = require('cheerio');

// Allow self-signed certs for scraping
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

function fetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const req = proto.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        ...options.headers,
      },
      timeout: 15000,
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetch(res.headers.location, options).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve({ html: data, status: res.statusCode, headers: res.headers }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
  });
}

function extractMetadata(html, url) {
  const $ = cheerio.load(html);
  return {
    title: $('title').text().trim() || null,
    description: $('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || null,
    ogImage: $('meta[property="og:image"]').attr('content') || null,
    ogTitle: $('meta[property="og:title"]').attr('content') || null,
    canonical: $('link[rel="canonical"]').attr('href') || null,
    favicon: $('link[rel="icon"]').attr('href') || $('link[rel="shortcut icon"]').attr('href') || null,
    language: $('html').attr('lang') || null,
    url,
  };
}

function extractLinks(html, baseUrl) {
  const $ = cheerio.load(html);
  const links = [];
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    const text = $(el).text().trim();
    if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
      let fullUrl = href;
      try {
        fullUrl = new URL(href, baseUrl).href;
      } catch {}
      links.push({ url: fullUrl, text: text || null });
    }
  });
  return [...new Map(links.map((l) => [l.url, l])).values()];
}

function extractHeadlines(html) {
  const $ = cheerio.load(html);
  const headlines = [];
  $('h1, h2, h3').each((_, el) => {
    const text = $(el).text().trim();
    if (text) headlines.push({ tag: el.tagName, text });
  });
  return headlines;
}

function extractImages(html, baseUrl) {
  const $ = cheerio.load(html);
  const images = [];
  $('img[src]').each((_, el) => {
    const src = $(el).attr('src');
    const alt = $(el).attr('alt') || null;
    let fullUrl = src;
    try { fullUrl = new URL(src, baseUrl).href; } catch {}
    images.push({ url: fullUrl, alt });
  });
  return images;
}

function extractTables(html) {
  const $ = cheerio.load(html);
  const tables = [];
  $('table').each((i, table) => {
    const headers = [];
    $(table).find('thead th, tr:first-child th').each((_, th) => {
      headers.push($(th).text().trim());
    });
    const rows = [];
    $(table).find('tbody tr, tr').each((_, tr) => {
      const cells = [];
      $(tr).find('td').each((_, td) => cells.push($(td).text().trim()));
      if (cells.length > 0) rows.push(cells);
    });
    if (rows.length > 0) tables.push({ headers, rows, rowCount: rows.length });
  });
  return tables;
}

function extractCustom(html, selector) {
  const $ = cheerio.load(html);
  const results = [];
  $(selector).each((_, el) => {
    const $el = $(el);
    results.push({
      text: $el.text().trim(),
      html: $el.html()?.trim() || null,
      tag: el.tagName,
      attributes: el.attribs || {},
    });
  });
  return results;
}

function extractText(html) {
  const $ = cheerio.load(html);
  $('script, style, nav, footer, header').remove();
  return $('body').text().replace(/\s+/g, ' ').trim();
}

async function scrape(url, options = {}) {
  const { html, status } = await fetch(url, options);
  const result = { url, status, timestamp: Date.now() };

  if (options.mode === 'metadata') {
    result.metadata = extractMetadata(html, url);
  } else if (options.mode === 'links') {
    result.links = extractLinks(html, url);
    result.count = result.links.length;
  } else if (options.mode === 'headlines') {
    result.headlines = extractHeadlines(html);
    result.count = result.headlines.length;
  } else if (options.mode === 'images') {
    result.images = extractImages(html, url);
    result.count = result.images.length;
  } else if (options.mode === 'tables') {
    result.tables = extractTables(html);
    result.count = result.tables.length;
  } else if (options.mode === 'text') {
    result.text = extractText(html);
    result.length = result.text.length;
  } else if (options.mode === 'custom' && options.selector) {
    result.results = extractCustom(html, options.selector);
    result.count = result.results.length;
    result.selector = options.selector;
  } else {
    // full mode
    result.metadata = extractMetadata(html, url);
    result.headlines = extractHeadlines(html);
    result.links = extractLinks(html, url).slice(0, 50);
    result.images = extractImages(html, url).slice(0, 20);
    result.tables = extractTables(html);
  }

  return result;
}

module.exports = { scrape, fetch };
