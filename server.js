const express = require('express');
const path = require('path');
const app = express();

const PORT = process.env.PORT || 8080;

// Serve static assets from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// JSON Parser for any backend APIs we might add later
app.use(express.json());

// Health check endpoint for GCP Cloud Run probing
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Fallback to index.html for Single Page Application routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`EcoTrace server listening on port ${PORT}`);
});
