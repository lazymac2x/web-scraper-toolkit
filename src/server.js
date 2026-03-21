const express = require('express');
const cors = require('cors');
const { scrape } = require('./scraper');

const app = express();
const PORT = process.env.PORT || 3200;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({
    name: 'web-scraper-toolkit',
    version: '1.0.0',
    endpoints: [
      'POST /api/v1/scrape',
      'GET  /api/v1/scrape?url=...&mode=...',
      'POST /api/v1/batch',
    ],
    modes: ['full', 'metadata', 'links', 'headlines', 'images', 'tables', 'text', 'custom'],
  });
});

// GET scrape
app.get('/api/v1/scrape', async (req, res) => {
  try {
    const { url, mode, selector } = req.query;
    if (!url) return res.status(400).json({ error: 'url parameter required' });
    const result = await scrape(url, { mode: mode || 'full', selector });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST scrape
app.post('/api/v1/scrape', async (req, res) => {
  try {
    const { url, mode, selector } = req.body;
    if (!url) return res.status(400).json({ error: 'url field required' });
    const result = await scrape(url, { mode: mode || 'full', selector });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Batch scrape
app.post('/api/v1/batch', async (req, res) => {
  try {
    const { urls, mode, selector } = req.body;
    if (!urls || !Array.isArray(urls)) return res.status(400).json({ error: 'urls array required' });
    const limited = urls.slice(0, 10);
    const results = await Promise.allSettled(
      limited.map((url) => scrape(url, { mode: mode || 'metadata', selector }))
    );
    res.json({
      count: results.length,
      results: results.map((r, i) =>
        r.status === 'fulfilled' ? r.value : { url: limited[i], error: r.reason?.message }
      ),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`web-scraper-toolkit running on http://localhost:${PORT}`);
});
