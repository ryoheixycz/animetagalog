// Import required modules
const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const bodyParser = require('body-parser');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Set up middleware
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const animeId = req.params.animeId;
        const uploadDir = path.join(__dirname, 'uploads', animeId);
        
        // Create directory if it doesn't exist
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const episodeNumber = req.body.episodeNumber;
        const fileExt = path.extname(file.originalname);
        cb(null, `episode_${episodeNumber}${fileExt}`);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 500 * 1024 * 1024 }, // 500MB limit
    fileFilter: function (req, file, cb) {
        // Accept only video files
        if (file.mimetype.startsWith('video/')) {
            cb(null, true);
        } else {
            cb(new Error('Only video files are allowed!'));
        }
    }
});

// Data storage paths
const DATA_DIR = path.join(__dirname, 'data');
const ANIMES_FILE = path.join(DATA_DIR, 'animes.json');
const EPISODES_DIR = path.join(DATA_DIR, 'episodes');
const TRENDING_FILE = path.join(DATA_DIR, 'trending.json');
const SCHEDULE_FILE = path.join(DATA_DIR, 'schedule.json');

// Ensure data directories exist
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

if (!fs.existsSync(EPISODES_DIR)) {
    fs.mkdirSync(EPISODES_DIR, { recursive: true });
}

// Create empty files if they don't exist
if (!fs.existsSync(ANIMES_FILE)) {
    fs.writeFileSync(ANIMES_FILE, JSON.stringify([]), 'utf8');
}

if (!fs.existsSync(TRENDING_FILE)) {
    fs.writeFileSync(TRENDING_FILE, JSON.stringify({
        mode: 'auto',
        maxItems: 10,
        manualTrending: []
    }), 'utf8');
}

if (!fs.existsSync(SCHEDULE_FILE)) {
    fs.writeFileSync(SCHEDULE_FILE, JSON.stringify([]), 'utf8');
}

// Helper functions
function readAnimes() {
    try {
        const data = fs.readFileSync(ANIMES_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading animes file:', error);
        return [];
    }
}

function writeAnimes(animes) {
    try {
        fs.writeFileSync(ANIMES_FILE, JSON.stringify(animes, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error('Error writing animes file:', error);
        return false;
    }
}

function getEpisodesFile(animeId) {
    return path.join(EPISODES_DIR, `${animeId}.json`);
}

function readEpisodes(animeId) {
    const episodesFile = getEpisodesFile(animeId);
    
    if (!fs.existsSync(episodesFile)) {
        fs.writeFileSync(episodesFile, JSON.stringify([]), 'utf8');
        return [];
    }
    
    try {
        const data = fs.readFileSync(episodesFile, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error(`Error reading episodes for anime ${animeId}:`, error);
        return [];
    }
}

function writeEpisodes(animeId, episodes) {
    const episodesFile = getEpisodesFile(animeId);
    
    try {
        fs.writeFileSync(episodesFile, JSON.stringify(episodes, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error(`Error writing episodes for anime ${animeId}:`, error);
        return false;
    }
}

function readTrending() {
    try {
        const data = fs.readFileSync(TRENDING_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading trending file:', error);
        return { mode: 'auto', maxItems: 10, manualTrending: [] };
    }
}

function writeTrending(trending) {
    try {
        fs.writeFileSync(TRENDING_FILE, JSON.stringify(trending, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error('Error writing trending file:', error);
        return false;
    }
}

function readSchedule() {
    try {
        const data = fs.readFileSync(SCHEDULE_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading schedule file:', error);
        return [];
    }
}

function writeSchedule(schedule) {
    try {
        fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(schedule, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error('Error writing schedule file:', error);
        return false;
    }
}

// Get trending animes based on current settings
function getTrendingAnimes() {
    const trending = readTrending();
    const animes = readAnimes();
    
    if (trending.mode === 'manual') {
        // Use manually selected trending animes
        const trendingIds = trending.manualTrending;
        return animes
            .filter(anime => trendingIds.includes(anime.id))
            .map(anime => ({
                ...anime,
                isTrending: true
            }))
            .slice(0, trending.maxItems);
    } else {
        // Auto mode - use views and rating
        return animes
            .map(anime => ({
                ...anime,
                trendingScore: (anime.views || 0) + (anime.rating || 0) * 100,
                isTrending: Boolean(anime.isTrending)
            }))
            .sort((a, b) => b.trendingScore - a.trendingScore)
            .slice(0, trending.maxItems);
    }
}

// Define API routes
// Get all animes
app.get('/api/animes', (req, res) => {
    const animes = readAnimes();
    // Add defaults for views and type if they don't exist
    const animesWithDefaults = animes.map(anime => ({
        ...anime,
        views: anime.views || Math.floor(Math.random() * 1000),
        type: anime.type || 'TV',
        currentEpisode: anime.currentEpisode || anime.episodes || 0,
        hasSubs: anime.hasSubs !== undefined ? anime.hasSubs : true,
        hasAudio: anime.hasAudio !== undefined ? anime.hasAudio : true,
        isTrending: anime.isTrending || false
    }));
    res.json(animesWithDefaults);
});

// Get anime by ID
app.get('/api/animes/:id', (req, res) => {
    const animeId = parseInt(req.params.id);
    const animes = readAnimes();
    const anime = animes.find(a => a.id === animeId);
    
    if (!anime) {
        return res.status(404).json({ error: 'Anime not found' });
    }
    
    // Add defaults if they don't exist
    const animeWithDefaults = {
        ...anime,
        views: anime.views || Math.floor(Math.random() * 1000),
        type: anime.type || 'TV',
        currentEpisode: anime.currentEpisode || anime.episodes || 0,
        hasSubs: anime.hasSubs !== undefined ? anime.hasSubs : true,
        hasAudio: anime.hasAudio !== undefined ? anime.hasAudio : true,
        isTrending: anime.isTrending || false
    };
    
    res.json(animeWithDefaults);
});

// Create new anime
app.post('/api/animes', (req, res) => {
    const animes = readAnimes();
    
    // Generate new ID
    const newId = animes.length > 0 ? Math.max(...animes.map(a => a.id)) + 1 : 1;
    
    const newAnime = {
        id: newId,
        ...req.body,
        dateAdded: new Date().toISOString(),
        views: req.body.views || Math.floor(Math.random() * 1000),
        type: req.body.type || 'TV',
        currentEpisode: 0
    };
    
    animes.push(newAnime);
    
    if (writeAnimes(animes)) {
        // If anime is set as trending, update trending list
        if (newAnime.isTrending) {
            const trending = readTrending();
            if (trending.mode === 'manual' && !trending.manualTrending.includes(newId)) {
                trending.manualTrending.push(newId);
                writeTrending(trending);
            }
        }
        
        res.status(201).json(newAnime);
    } else {
        res.status(500).json({ error: 'Failed to create anime' });
    }
});

// Update anime
app.put('/api/animes/:id', (req, res) => {
    const animeId = parseInt(req.params.id);
    const animes = readAnimes();
    const animeIndex = animes.findIndex(a => a.id === animeId);
    
    if (animeIndex === -1) {
        return res.status(404).json({ error: 'Anime not found' });
    }
    
    // Keep the original dateAdded, views, and currentEpisode
    const dateAdded = animes[animeIndex].dateAdded;
    const views = animes[animeIndex].views || Math.floor(Math.random() * 1000);
    const currentEpisode = animes[animeIndex].currentEpisode || 0;
    
    animes[animeIndex] = {
        ...req.body,
        id: animeId,
        dateAdded: dateAdded,
        views: views,
        currentEpisode: currentEpisode
    };
    
    if (writeAnimes(animes)) {
        // Update trending status
        const trending = readTrending();
        if (trending.mode === 'manual') {
            const trendingIndex = trending.manualTrending.indexOf(animeId);
            
            if (animes[animeIndex].isTrending && trendingIndex === -1) {
                trending.manualTrending.push(animeId);
                writeTrending(trending);
            } else if (!animes[animeIndex].isTrending && trendingIndex !== -1) {
                trending.manualTrending.splice(trendingIndex, 1);
                writeTrending(trending);
            }
        }
        
        res.json(animes[animeIndex]);
    } else {
        res.status(500).json({ error: 'Failed to update anime' });
    }
});

// Delete anime
app.delete('/api/animes/:id', (req, res) => {
    const animeId = parseInt(req.params.id);
    const animes = readAnimes();
    const animeIndex = animes.findIndex(a => a.id === animeId);
    
    if (animeIndex === -1) {
        return res.status(404).json({ error: 'Anime not found' });
    }
    
    const deletedAnime = animes.splice(animeIndex, 1)[0];
    
    // Delete episodes file
    const episodesFile = getEpisodesFile(animeId);
    if (fs.existsSync(episodesFile)) {
        fs.unlinkSync(episodesFile);
    }
    
    if (writeAnimes(animes)) {
        // Remove from trending if present
        const trending = readTrending();
        const trendingIndex = trending.manualTrending.indexOf(animeId);
        if (trendingIndex !== -1) {
            trending.manualTrending.splice(trendingIndex, 1);
            writeTrending(trending);
        }
        
        // Remove from schedule if present
        const schedule = readSchedule();
        const updatedSchedule = schedule.filter(item => item.animeId !== animeId);
        if (updatedSchedule.length !== schedule.length) {
            writeSchedule(updatedSchedule);
        }
        
        res.json(deletedAnime);
    } else {
        res.status(500).json({ error: 'Failed to delete anime' });
    }
});

// Search animes
app.get('/api/animes/search', (req, res) => {
    const searchTerm = req.query.q?.toLowerCase() || '';
    const animes = readAnimes();
    
    const results = animes.filter(anime => 
        anime.title?.toLowerCase().includes(searchTerm) ||
        (anime.synopsis && anime.synopsis.toLowerCase().includes(searchTerm)) ||
        (anime.genres && anime.genres.some(genre => genre.toLowerCase().includes(searchTerm)))
    );
    
    // Add defaults for views and type if they don't exist
    const resultsWithDefaults = results.map(anime => ({
        ...anime,
        views: anime.views || Math.floor(Math.random() * 1000),
        type: anime.type || 'TV',
        currentEpisode: anime.currentEpisode || anime.episodes || 0,
        hasSubs: anime.hasSubs !== undefined ? anime.hasSubs : true,
        hasAudio: anime.hasAudio !== undefined ? anime.hasAudio : true,
        isTrending: anime.isTrending || false
    }));
    
    res.json(resultsWithDefaults);
});

// Get all episodes for an anime
app.get('/api/animes/:id/episodes', (req, res) => {
    const animeId = parseInt(req.params.id);
    const episodes = readEpisodes(animeId);
    
    res.json(episodes);
});

// Get specific episode for an anime
app.get('/api/animes/:id/episodes/:episode', (req, res) => {
    const animeId = parseInt(req.params.id);
    const episodeNumber = parseInt(req.params.episode);
    const episodes = readEpisodes(animeId);
    
    const episode = episodes.find(ep => ep.episodeNumber === episodeNumber);
    
    if (!episode) {
        return res.status(404).json({ error: 'Episode not found' });
    }
    
    res.json(episode);
});

// Get video source for an episode
app.get('/api/animes/:id/episodes/:episode/server/:server', (req, res) => {
    const animeId = parseInt(req.params.id);
    const episodeNumber = parseInt(req.params.episode);
    const serverNumber = parseInt(req.params.server);
    
    const episodes = readEpisodes(animeId);
    const episode = episodes.find(ep => ep.episodeNumber === episodeNumber);
    
    if (!episode) {
        return res.status(404).json({ error: 'Episode not found' });
    }
    
    const serverKey = `server${serverNumber}`;
    
    if (!episode.sources || !episode.sources[serverKey]) {
        return res.status(404).json({ error: 'Video source not found' });
    }
    
    // Check if it's a local file or external URL
    const videoPath = episode.sources[serverKey];
    
    if (videoPath.startsWith('http')) {
        // Redirect to external URL
        return res.redirect(videoPath);
    } else {
        // Serve local file
        const localPath = path.join(__dirname, videoPath);
        
        if (!fs.existsSync(localPath)) {
            return res.status(404).json({ error: 'Video file not found' });
        }
        
        // Stream the video file
        const stat = fs.statSync(localPath);
        const fileSize = stat.size;
        const range = req.headers.range;
        
        if (range) {
            const parts = range.replace(/bytes=/, '').split('-');
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunksize = (end - start) + 1;
            const file = fs.createReadStream(localPath, { start, end });
            
            res.writeHead(206, {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunksize,
                'Content-Type': 'video/mp4'
            });
            
            file.pipe(res);
        } else {
            res.writeHead(200, {
                'Content-Length': fileSize,
                'Content-Type': 'video/mp4'
            });
            
            fs.createReadStream(localPath).pipe(res);
        }
    }
});

// Add new episode
app.post('/api/animes/:id/episodes', (req, res) => {
    const animeId = parseInt(req.params.id);
    const animes = readAnimes();
    
    // Check if anime exists
    const animeIndex = animes.findIndex(a => a.id === animeId);
    if (animeIndex === -1) {
        return res.status(404).json({ error: 'Anime not found' });
    }
    
    const episodes = readEpisodes(animeId);
    
    // Check if episode already exists
    const episodeNumber = parseInt(req.body.episodeNumber);
    if (episodes.find(ep => ep.episodeNumber === episodeNumber)) {
        return res.status(400).json({ error: 'Episode number already exists' });
    }
    
    const newEpisode = {
        ...req.body,
        episodeNumber: episodeNumber,
        dateAdded: new Date().toISOString()
    };
    
    episodes.push(newEpisode);
    
    if (writeEpisodes(animeId, episodes)) {
        // Update the episodes count and current episode in the anime record
        animes[animeIndex].episodes = Math.max(animes[animeIndex].episodes || 0, episodes.length);
        animes[animeIndex].currentEpisode = episodes.length;
        writeAnimes(animes);
        
        res.status(201).json(newEpisode);
    } else {
        res.status(500).json({ error: 'Failed to add episode' });
    }
});

// Upload episode video
app.post('/api/animes/:id/episodes/upload', upload.single('video'), (req, res) => {
    const animeId = parseInt(req.params.id);
    const animes = readAnimes();
    
    // Check if anime exists
    const animeIndex = animes.findIndex(a => a.id === animeId);
    if (animeIndex === -1) {
        return res.status(404).json({ error: 'Anime not found' });
    }
    
    if (!req.file) {
        return res.status(400).json({ error: 'No video file uploaded' });
    }
    
    const episodes = readEpisodes(animeId);
    
    // Check if episode already exists
    const episodeNumber = parseInt(req.body.episodeNumber);
    const episodeIndex = episodes.findIndex(ep => ep.episodeNumber === episodeNumber);
    
    // Relative path to the uploaded file
    const videoPath = path.relative(__dirname, req.file.path);
    
    // Create or update episode
    if (episodeIndex === -1) {
        // Create new episode
        const newEpisode = {
            episodeNumber: episodeNumber,
            title: req.body.title || `Episode ${episodeNumber}`,
            description: req.body.description || '',
            sources: {
                server1: videoPath
            },
            dateAdded: new Date().toISOString()
        };
        
        episodes.push(newEpisode);
    } else {
        // Update existing episode
        episodes[episodeIndex].sources = {
            ...episodes[episodeIndex].sources,
            server1: videoPath
        };
    }
    
    if (writeEpisodes(animeId, episodes)) {
        // Update the episodes count and current episode in the anime record
        animes[animeIndex].episodes = Math.max(animes[animeIndex].episodes || 0, episodes.length);
        animes[animeIndex].currentEpisode = episodes.length;
        writeAnimes(animes);
        
        res.status(201).json({ success: true, message: 'Episode video uploaded' });
    } else {
        res.status(500).json({ error: 'Failed to save episode data' });
    }
});

// Batch add episodes
app.post('/api/animes/:id/episodes/batch', (req, res) => {
    const animeId = parseInt(req.params.id);
    const animes = readAnimes();
    
    // Check if anime exists
    const animeIndex = animes.findIndex(a => a.id === animeId);
    if (animeIndex === -1) {
        return res.status(404).json({ error: 'Anime not found' });
    }
    
    const episodes = readEpisodes(animeId);
    const { episodeLinks, basePattern, startEpisode, totalEpisodes, server } = req.body;
    const addedEpisodes = [];
    const serverKey = server || 'server1';
    
    if (episodeLinks && episodeLinks.trim()) {
        // Process a list of links
        const links = episodeLinks.split('\n')
            .map(link => link.trim())
            .filter(link => link);
        
        for (let i = 0; i < links.length; i++) {
            const episodeNumber = startEpisode + i;
            
            // Check if episode already exists
            const existingEpisodeIndex = episodes.findIndex(ep => ep.episodeNumber === episodeNumber);
            
            if (existingEpisodeIndex !== -1) {
                // Update existing episode
                episodes[existingEpisodeIndex].sources = {
                    ...episodes[existingEpisodeIndex].sources,
                    [serverKey]: links[i]
                };
                addedEpisodes.push(episodes[existingEpisodeIndex]);
            } else {
                // Create new episode
                const newEpisode = {
                    episodeNumber: episodeNumber,
                    title: `Episode ${episodeNumber}`,
                    description: '',
                    sources: {
                        [serverKey]: links[i]
                    },
                    dateAdded: new Date().toISOString()
                };
                
                episodes.push(newEpisode);
                addedEpisodes.push(newEpisode);
            }
        }
    } else if (basePattern && totalEpisodes) {
        // Process a pattern-based batch
        for (let i = 0; i < totalEpisodes; i++) {
            const episodeNumber = startEpisode + i;
            const episodeLink = basePattern.replace('{episode}', episodeNumber);
            
            // Check if episode already exists
            const existingEpisodeIndex = episodes.findIndex(ep => ep.episodeNumber === episodeNumber);
            
            if (existingEpisodeIndex !== -1) {
                // Update existing episode
                episodes[existingEpisodeIndex].sources = {
                    ...episodes[existingEpisodeIndex].sources,
                    [serverKey]: episodeLink
                };
                addedEpisodes.push(episodes[existingEpisodeIndex]);
            } else {
                // Create new episode
                const newEpisode = {
                    episodeNumber: episodeNumber,
                    title: `Episode ${episodeNumber}`,
                    description: '',
                    sources: {
                        [serverKey]: episodeLink
                    },
                    dateAdded: new Date().toISOString()
                };
                
                episodes.push(newEpisode);
                addedEpisodes.push(newEpisode);
            }
        }
    } else {
        return res.status(400).json({ error: 'Invalid input for batch episode addition' });
    }
    
    // Sort episodes by episodeNumber
    episodes.sort((a, b) => a.episodeNumber - b.episodeNumber);
    
    if (writeEpisodes(animeId, episodes)) {
        // Update the episodes count and current episode in the anime record
        animes[animeIndex].episodes = Math.max(animes[animeIndex].episodes || 0, episodes.length);
        animes[animeIndex].currentEpisode = episodes.length;
        writeAnimes(animes);
        
        res.status(201).json({ 
            success: true, 
            message: `Added/updated ${addedEpisodes.length} episodes`,
            episodes: addedEpisodes
        });
    } else {
        res.status(500).json({ error: 'Failed to add batch episodes' });
    }
});

// Parse and add episodes from HTML select
app.post('/api/animes/:id/episodes/parse-select', (req, res) => {
    const animeId = parseInt(req.params.id);
    const animes = readAnimes();
    
    // Check if anime exists
    const animeIndex = animes.findIndex(a => a.id === animeId);
    if (animeIndex === -1) {
        return res.status(404).json({ error: 'Anime not found' });
    }
    
    const episodes = readEpisodes(animeId);
    const { selectHtml } = req.body;
    
    if (!selectHtml || !selectHtml.trim()) {
        return res.status(400).json({ error: 'Select HTML content is required' });
    }
    
    try {
        // Basic parsing of the select HTML to extract options
        const optionRegex = /<option[^>]*value="(\d+)"[^>]*data-server1="([^"]*)"[^>]*data-server2="([^"]*)"[^>]*>[^<]*<\/option>/g;
        const parsedEpisodes = [];
        let match;
        
        while ((match = optionRegex.exec(selectHtml)) !== null) {
            const episodeNumber = parseInt(match[1]);
            const server1Url = match[2] === "LINK1" ? "" : match[2];
            const server2Url = match[3].replace(/\*\*/g, ""); // Remove ** if present
            
            parsedEpisodes.push({
                episodeNumber,
                server1: server1Url,
                server2: server2Url
            });
        }
        
        if (parsedEpisodes.length === 0) {
            return res.status(400).json({ error: 'No valid episodes found in the provided HTML' });
        }
        
        // Add or update episodes
        const addedEpisodes = [];
        
        for (const parsedEp of parsedEpisodes) {
            const existingEpisodeIndex = episodes.findIndex(ep => ep.episodeNumber === parsedEp.episodeNumber);
            
            if (existingEpisodeIndex !== -1) {
                // Update existing episode
                episodes[existingEpisodeIndex].sources = {
                    ...episodes[existingEpisodeIndex].sources
                };
                if (parsedEp.server1) {
                    episodes[existingEpisodeIndex].sources.server1 = parsedEp.server1;
                }
                if (parsedEp.server2) {
                    episodes[existingEpisodeIndex].sources.server2 = parsedEp.server2;
                }
                addedEpisodes.push(episodes[existingEpisodeIndex]);
            } else {
                // Create new episode
                const sources = {};
                if (parsedEp.server1) sources.server1 = parsedEp.server1;
                if (parsedEp.server2) sources.server2 = parsedEp.server2;
                
                const newEpisode = {
                    episodeNumber: parsedEp.episodeNumber,
                    title: `Episode ${parsedEp.episodeNumber}`,
                    description: '',
                    sources,
                    dateAdded: new Date().toISOString()
                };
                
                episodes.push(newEpisode);
                addedEpisodes.push(newEpisode);
            }
        }
        
        // Sort episodes by episodeNumber
        episodes.sort((a, b) => a.episodeNumber - b.episodeNumber);
        
        if (writeEpisodes(animeId, episodes)) {
            // Update the episodes count and current episode in the anime record
            animes[animeIndex].episodes = Math.max(animes[animeIndex].episodes || 0, episodes.length);
            animes[animeIndex].currentEpisode = episodes.length;
            writeAnimes(animes);
            
            res.status(201).json({ 
                success: true, 
                message: `Added/updated ${addedEpisodes.length} episodes`,
                episodes: addedEpisodes
            });
        } else {
            res.status(500).json({ error: 'Failed to add parsed episodes' });
        }
    } catch (error) {
        console.error('Error parsing select HTML:', error);
        res.status(500).json({ error: 'Failed to parse select HTML' });
    }
});

// Get related anime
app.get('/api/animes/:id/related', (req, res) => {
    const animeId = parseInt(req.params.id);
    const animes = readAnimes();
    
    const currentAnime = animes.find(a => a.id === animeId);
    
    if (!currentAnime) {
        return res.status(404).json({ error: 'Anime not found' });
    }
    
    // Find related anime based on genres
    let relatedAnime = [];
    
    if (currentAnime.genres && currentAnime.genres.length > 0) {
        relatedAnime = animes
            .filter(anime => 
                anime.id !== animeId && // Exclude current anime
                anime.genres && 
                anime.genres.some(genre => currentAnime.genres.includes(genre))
            )
            .sort((a, b) => {
    // Count matching genres
    const aMatches = a.genres.filter(genre => currentAnime.genres.includes(genre)).length;
    const bMatches = b.genres.filter(genre => currentAnime.genres.includes(genre)).length;
    
    return bMatches - aMatches;
})
.slice(0, 5); // Get top 5 related
    }
    
    // Add defaults for views and type if they don't exist
    const relatedWithDefaults = relatedAnime.map(anime => ({
        ...anime,
        views: anime.views || Math.floor(Math.random() * 1000),
        type: anime.type || 'TV',
        currentEpisode: anime.currentEpisode || anime.episodes || 0,
        hasSubs: anime.hasSubs !== undefined ? anime.hasSubs : true,
        hasAudio: anime.hasAudio !== undefined ? anime.hasAudio : true,
        isTrending: anime.isTrending || false
    }));
    
    res.json(relatedWithDefaults);
});

// TRENDING ENDPOINTS
// Get trending anime
app.get('/api/trending', (req, res) => {
    const trending = readTrending();
    const trendingAnimes = getTrendingAnimes();
    
    res.json({
        mode: trending.mode,
        maxItems: trending.maxItems,
        animes: trendingAnimes
    });
});

// Update trending settings
app.post('/api/trending/settings', (req, res) => {
    const trending = readTrending();
    
    trending.mode = req.body.mode || trending.mode;
    trending.maxItems = parseInt(req.body.maxItems) || trending.maxItems;
    
    if (writeTrending(trending)) {
        res.json({ success: true, message: 'Trending settings updated' });
    } else {
        res.status(500).json({ error: 'Failed to update trending settings' });
    }
});

// Toggle anime trending status
app.put('/api/trending/:id', (req, res) => {
    const animeId = parseInt(req.params.id);
    const isTrending = req.body.isTrending === true;
    
    // Update anime trending status
    const animes = readAnimes();
    const animeIndex = animes.findIndex(a => a.id === animeId);
    
    if (animeIndex === -1) {
        return res.status(404).json({ error: 'Anime not found' });
    }
    
    animes[animeIndex].isTrending = isTrending;
    
    // Update manual trending list
    const trending = readTrending();
    const trendingIndex = trending.manualTrending.indexOf(animeId);
    
    if (isTrending && trendingIndex === -1) {
        trending.manualTrending.push(animeId);
    } else if (!isTrending && trendingIndex !== -1) {
        trending.manualTrending.splice(trendingIndex, 1);
    }
    
    if (writeAnimes(animes) && writeTrending(trending)) {
        res.json({ success: true, message: 'Trending status updated' });
    } else {
        res.status(500).json({ error: 'Failed to update trending status' });
    }
});

// SCHEDULE ENDPOINTS
// Get schedule
app.get('/api/schedule', (req, res) => {
    const schedule = readSchedule();
    const animes = readAnimes();
    
    // Attach anime data to schedule items
    const scheduleWithAnimeData = schedule.map(item => {
        const anime = animes.find(a => a.id === item.animeId);
        return {
            ...item,
            anime: anime ? {
                id: anime.id,
                title: anime.title,
                poster: anime.poster,
                status: anime.status,
                currentEpisode: anime.currentEpisode || 0,
                episodes: anime.episodes || 0
            } : null
        };
    });
    
    res.json(scheduleWithAnimeData);
});

// Add schedule
app.post('/api/schedule', (req, res) => {
    const animeId = parseInt(req.body.animeId);
    const dayOfWeek = req.body.dayOfWeek;
    const releaseTime = req.body.releaseTime;
    
    // Validate inputs
    if (!animeId || !dayOfWeek || !releaseTime) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Check if anime exists
    const animes = readAnimes();
    if (!animes.find(a => a.id === animeId)) {
        return res.status(404).json({ error: 'Anime not found' });
    }
    
    // Check if schedule already exists for this anime on this day
    const schedule = readSchedule();
    if (schedule.find(item => item.animeId === animeId && item.dayOfWeek === dayOfWeek)) {
        return res.status(400).json({ error: 'Schedule already exists for this anime on this day' });
    }
    
    // Generate ID for the schedule
    const scheduleId = schedule.length > 0 ? Math.max(...schedule.map(s => s.id)) + 1 : 1;
    
    const newSchedule = {
        id: scheduleId,
        animeId,
        dayOfWeek,
        releaseTime
    };
    
    schedule.push(newSchedule);
    
    if (writeSchedule(schedule)) {
        // Get anime data for response
        const anime = animes.find(a => a.id === animeId);
        
        res.status(201).json({
            ...newSchedule,
            anime: anime ? {
                id: anime.id,
                title: anime.title,
                poster: anime.poster,
                status: anime.status,
                currentEpisode: anime.currentEpisode || 0,
                episodes: anime.episodes || 0
            } : null
        });
    } else {
        res.status(500).json({ error: 'Failed to add schedule' });
    }
});

// Delete schedule
app.delete('/api/schedule/:id', (req, res) => {
    const scheduleId = parseInt(req.params.id);
    const schedule = readSchedule();
    const scheduleIndex = schedule.findIndex(s => s.id === scheduleId);
    
    if (scheduleIndex === -1) {
        return res.status(404).json({ error: 'Schedule not found' });
    }
    
    const deletedSchedule = schedule.splice(scheduleIndex, 1)[0];
    
    if (writeSchedule(schedule)) {
        res.json(deletedSchedule);
    } else {
        res.status(500).json({ error: 'Failed to delete schedule' });
    }
});

// API endpoint for placeholder images
app.get('/api/placeholder/:width/:height', (req, res) => {
    const width = req.params.width;
    const height = req.params.height;
    
    res.redirect(`https://via.placeholder.com/${width}x${height}`);
});

// Serve HTML files
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/watch', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'watch.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Catch-all route for HTML files
app.get('/:page.html', (req, res) => {
    const page = req.params.page;
    const filePath = path.join(__dirname, 'public', `${page}.html`);
    
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'));
    }
});

// Error handling for 404
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Open http://localhost:${PORT} in your browser`);
});

// Handle errors
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
