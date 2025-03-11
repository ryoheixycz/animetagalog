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

// Ensure data directories exist
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

if (!fs.existsSync(EPISODES_DIR)) {
    fs.mkdirSync(EPISODES_DIR, { recursive: true });
}

// Create empty animes.json if it doesn't exist
if (!fs.existsSync(ANIMES_FILE)) {
    fs.writeFileSync(ANIMES_FILE, JSON.stringify([]), 'utf8');
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

// Define API routes
// Get all animes
app.get('/api/animes', (req, res) => {
    const animes = readAnimes();
    res.json(animes);
});

// Get anime by ID
app.get('/api/animes/:id', (req, res) => {
    const animeId = parseInt(req.params.id);
    const animes = readAnimes();
    const anime = animes.find(a => a.id === animeId);
    
    if (!anime) {
        return res.status(404).json({ error: 'Anime not found' });
    }
    
    res.json(anime);
});

// Create new anime
app.post('/api/animes', (req, res) => {
    const animes = readAnimes();
    
    // Generate new ID
    const newId = animes.length > 0 ? Math.max(...animes.map(a => a.id)) + 1 : 1;
    
    const newAnime = {
        id: newId,
        ...req.body,
        dateAdded: new Date().toISOString()
    };
    
    animes.push(newAnime);
    
    if (writeAnimes(animes)) {
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
    
    // Keep the original dateAdded
    const dateAdded = animes[animeIndex].dateAdded;
    
    animes[animeIndex] = {
        ...req.body,
        id: animeId,
        dateAdded: dateAdded
    };
    
    if (writeAnimes(animes)) {
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
        res.json(deletedAnime);
    } else {
        res.status(500).json({ error: 'Failed to delete anime' });
    }
});

// Search animes
app.get('/api/animes/search', (req, res) => {
    const searchTerm = req.query.q.toLowerCase();
    const animes = readAnimes();
    
    const results = animes.filter(anime => 
        anime.title.toLowerCase().includes(searchTerm) ||
        (anime.synopsis && anime.synopsis.toLowerCase().includes(searchTerm)) ||
        (anime.genres && anime.genres.some(genre => genre.toLowerCase().includes(searchTerm)))
    );
    
    res.json(results);
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
    if (!animes.find(a => a.id === animeId)) {
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
        // Update the episodes count in the anime record
        const animeIndex = animes.findIndex(a => a.id === animeId);
        if (animeIndex !== -1) {
            animes[animeIndex].episodes = Math.max(episodes.length, animes[animeIndex].episodes || 0);
            writeAnimes(animes);
        }
        
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
    if (!animes.find(a => a.id === animeId)) {
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
        // Update the episodes count in the anime record
        const animeIndex = animes.findIndex(a => a.id === animeId);
        if (animeIndex !== -1) {
            animes[animeIndex].episodes = Math.max(episodes.length, animes[animeIndex].episodes || 0);
            writeAnimes(animes);
        }
        
        res.status(201).json({ success: true, message: 'Episode video uploaded' });
    } else {
        res.status(500).json({ error: 'Failed to save episode data' });
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
    
    res.json(relatedAnime);
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
