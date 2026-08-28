const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 7000;

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Credentials', 'true');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

const CONFIG = {
    PROVIDER_NAME: 'PlayviaTV',
    CATALOG_SIZE: 100,
    CACHE_TIMEOUT: 300
};

const XTREAM_SERVERS = [
    { url: 'http://auth.dnskode.com', username: 'ander0545', password: 'ander132', name: 'Server 1' },
    { url: 'http://auth.dnskode.com', username: 'MarcusFatima', password: '22032020', name: 'Server 2' },
    { url: 'http://auth.dnskode.com', username: 'RAFAELNEGRELLO20', password: '6h6idpmk9mg', name: 'Server 3' },
    { url: 'http://auth.dnskode.com', username: 'felipaosoares', password: 'o73e6f2vqb5', name: 'Server 4' }
];

const cache = {};

function getCache(key, timeout) {
    if (cache[key]) {
        const age = (Date.now() - cache[key].timestamp) / 1000;
        if (age < timeout) return cache[key].data;
    }
    return null;
}

function setCache(key, data) {
    cache[key] = { data, timestamp: Date.now() };
}

function buildUrl(baseUrl, params) {
    const parts = [];
    for (const key in params) {
        if (params.hasOwnProperty(key)) {
            parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(params[key]));
        }
    }
    return baseUrl + '?' + parts.join('&');
}

const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
];
let currentUserAgentIndex = 0;

function getNextUserAgent() {
    const ua = USER_AGENTS[currentUserAgentIndex];
    currentUserAgentIndex = (currentUserAgentIndex + 1) % USER_AGENTS.length;
    return ua;
}

function getDefaultHeaders() {
    return {
        'User-Agent': getNextUserAgent(),
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'pt-BR,en-US;q=0.9,en;q=0.8',
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache'
    };
}

async function fetchJson(url) {
    try {
        const response = await axios.get(url, {
            headers: getDefaultHeaders(),
            timeout: 300000,
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
            responseType: 'text'
        });
        let rawData = response.data;
        try {
            const parsed = JSON.parse(rawData);
            return parsed;
        } catch (e) {
            return null;
        }
    } catch (error) {
        console.error('HTTP Error:', error.message);
        return null;
    }
}

async function getLiveChannelsFromServer(server) {    const url = buildUrl(server.url + '/player_api.php', {
        username: server.username,
        password: server.password,
        action: 'get_live_streams'
    });
    const data = await fetchJson(url);
    if (!Array.isArray(data)) return [];
    return data.map(ch => ({
        name: ch.name || '',
        stream_id: ch.stream_id,
        stream_icon: ch.stream_icon || '',
        epg_channel_id: ch.epg_channel_id || '',
        category_id: ch.category_id || '',
        serverIndex: XTREAM_SERVERS.indexOf(server)
    }));
}

async function getAllChannels() {
    const cacheKey = 'all_channels';
    const cached = getCache(cacheKey, 300);
    if (cached) return cached;

    const results = await Promise.all(
        XTREAM_SERVERS.map(s => getLiveChannelsFromServer(s).catch(() => []))
    );

    const seen = new Set();
    const all = [];
    for (const channels of results) {
        for (const ch of channels) {
            const key = ch.name.toLowerCase().trim();
            if (!seen.has(key)) {
                seen.add(key);
                all.push(ch);
            }
        }
    }

    all.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    setCache(cacheKey, all);
    console.log(`Canais carregados: ${all.length} (dedup de ${results.reduce((a,b) => a + b.length, 0)})`);
    return all;
}

async function resolveStreamUrl(serverIndex, streamId) {
    const cacheKey = 'stream_url_' + serverIndex + '_' + streamId;
    const cached = getCache(cacheKey, 90);
    if (cached) return cached;

    const server = XTREAM_SERVERS[serverIndex];
    const baseUrl = server.url + '/live/' + server.username + '/' + server.password + '/' + streamId + '.ts';

    try {
        const resp = await axios.head(baseUrl, {
            headers: getDefaultHeaders(),
            maxRedirects: 0,
            timeout: 20000,
            validateStatus: () => true
        });
        if (resp.status === 302 && resp.headers.location) {
            const finalUrl = resp.headers.location;
            setCache(cacheKey, finalUrl);
            return finalUrl;
        }
    } catch (e) {
        console.error('Resolve stream error:', e.message);
    }
    return baseUrl;
}

function channelToMeta(ch) {
    const id = `playviatv_${ch.serverIndex}_${ch.stream_id}`;
    return {
        id,
        type: 'channel',
        name: ch.name,
        poster: ch.stream_icon || undefined,
        posterShape: 'square',
        logo: ch.stream_icon || undefined
    };
}

const manifest = {
    id: 'com.playviatv.addon',
    version: '1.0.0',
    name: 'PlayviaTV',
    description: '📺 Canais ao vivo via IPTV',
    resources: ['catalog', 'meta', 'stream'],
    types: ['channel'],
    catalogs: [{
        type: 'channel',
        id: 'playviatv-live',
        name: 'Canais Ao Vivo',
        extra: [
            { name: 'search', isRequired: false },
            { name: 'skip', isRequired: false }
        ]
    }],
    idPrefixes: ['playviatv_'],
    background: '#0c0b11',
    logo: '',
    contactEmail: 'support@playviatv.com',
    behaviorHints: {
        configurable: false,
        configurationRequired: false
    }
};

app.get('/manifest.json', (req, res) => {
    res.json(manifest);
});

app.get('/catalog/:type/:id.json', async (req, res) => {
    const { type, id } = req.params;
    if (type !== 'channel' || id !== 'playviatv-live') {
        return res.json({ metas: [] });
    }

    const search = req.query.search || '';
    const skip = parseInt(req.query.skip) || 0;

    try {
        let channels = await getAllChannels();

        if (search) {
            const q = search.toLowerCase().trim();
            channels = channels.filter(ch => ch.name.toLowerCase().includes(q));
        }

        const total = channels.length;
        const page = channels.slice(skip, skip + CONFIG.CATALOG_SIZE);
        const metas = page.map(channelToMeta);

        res.json({ metas, total });
    } catch (e) {
        console.error('Catalog error:', e.message);
        res.json({ metas: [] });
    }
});

app.get('/catalog/:type/:id/:extra.json', async (req, res) => {
    const { type, id, extra } = req.params;
    if (type !== 'channel' || id !== 'playviatv-live') {
        return res.json({ metas: [] });
    }

    const params = new URLSearchParams(extra);
    const search = params.get('search') || '';
    const skip = parseInt(params.get('skip')) || 0;

    try {
        let channels = await getAllChannels();

        if (search) {
            const q = search.toLowerCase().trim();
            channels = channels.filter(ch => ch.name.toLowerCase().includes(q));
        }

        const total = channels.length;
        const page = channels.slice(skip, skip + CONFIG.CATALOG_SIZE);
        const metas = page.map(channelToMeta);

        res.json({ metas, total });
    } catch (e) {
        console.error('Catalog error:', e.message);
        res.json({ metas: [] });
    }
});

app.get('/meta/:type/:id.json', async (req, res) => {
    const { type, id } = req.params;
    if (type !== 'channel' || !id.startsWith('playviatv_')) {
        return res.json({ meta: null });
    }

    const parts = id.split('_');
    const serverIndex = parseInt(parts[1]);
    const streamId = parseInt(parts.slice(2).join('_'));

    try {
        const channels = await getAllChannels();
        const ch = channels.find(c => c.serverIndex === serverIndex && c.stream_id === streamId);
        if (!ch) return res.json({ meta: null });

        res.json({ meta: channelToMeta(ch) });
    } catch (e) {
        res.json({ meta: null });
    }
});

app.get('/stream/:type/:id.json', async (req, res) => {
    const { type, id } = req.params;
    if (type !== 'channel' || !id.startsWith('playviatv_')) {
        return res.json({ streams: [] });
    }

    const parts = id.split('_');
    const serverIndex = parseInt(parts[1]);
    const streamId = parseInt(parts.slice(2).join('_'));

    const server = XTREAM_SERVERS[serverIndex];
    if (!server) return res.json({ streams: [] });

    const streamUrl = await resolveStreamUrl(serverIndex, streamId);

    res.json({
        streams: [{
            url: streamUrl,
            title: CONFIG.PROVIDER_NAME,
            behaviorHints: { notWebReady: true }
        }]
    });
});

app.get('/test-cors', (req, res) => {
    res.json({
        status: 'ok',
        message: 'CORS funcionando!',
        timestamp: new Date().toISOString()
    });
});

app.use(express.static('public'));

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

app.listen(PORT, () => {
    console.log('========================================');
    console.log('🎬 PlayviaTV Addon Rodando!');
    console.log('========================================');
    console.log('📡 URL: http://localhost:' + PORT);
    console.log('📄 Manifest: http://localhost:' + PORT + '/manifest.json');
    console.log('📺 Catálogo: http://localhost:' + PORT + '/catalog/channel/playviatv-live.json');
    console.log('🧪 CORS: http://localhost:' + PORT + '/test-cors');
    console.log('========================================');

    getAllChannels().then(ch => {
        console.log('Pré-carga concluída: ' + ch.length + ' canais');
    }).catch(err => {
        console.error('Pré-carga falhou:', err.message);
    });
});