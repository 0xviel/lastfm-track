require("dotenv").config();

const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

const LASTFM_USERNAME = process.env.LASTFM_USERNAME;
const LASTFM_API_KEY = process.env.LASTFM_API_KEY;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "*";

const LASTFM_BASE_URL = "https://ws.audioscrobbler.com/2.0/";

app.use(cors({ origin: FRONTEND_ORIGIN }));
app.use(express.json());

function getImage(track) {
  const images = track.image || [];
  const extraLarge = images.find((img) => img.size === "extralarge");
  const large = images.find((img) => img.size === "large");
  const medium = images.find((img) => img.size === "medium");

  return extraLarge?.["#text"] || large?.["#text"] || medium?.["#text"] || null;
}

function formatDuration(ms) {
  if (!ms || Number(ms) <= 0) return null;

  const totalSeconds = Math.floor(Number(ms) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

async function getTrackDuration(artistName, trackName) {
  try {
    if (!artistName || !trackName) return null;

    const response = await axios.get(LASTFM_BASE_URL, {
      params: {
        method: "track.getInfo",
        api_key: LASTFM_API_KEY,
        artist: artistName,
        track: trackName,
        format: "json",
      },
    });

    const duration = response.data?.track?.duration;

    if (!duration || Number(duration) <= 0) {
      return null;
    }

    return Number(duration);
  } catch (err) {
    console.error(
      "Failed to fetch duration:",
      artistName,
      "-",
      trackName,
      err.response?.data || err.message
    );

    return null;
  }
}

async function normalizeTrack(track) {
  const isNowPlaying = track["@attr"]?.nowplaying === "true";

  const artistName = track.artist?.["#text"] || track.artist?.name || null;
  const trackName = track.name || null;

  const duration = await getTrackDuration(artistName, trackName);

  return {
    now_playing: isNowPlaying,
    played_at: track.date?.uts
      ? new Date(Number(track.date.uts) * 1000).toISOString()
      : null,
    track_name: trackName,
    artist: {
      name: artistName,
      mbid: track.artist?.mbid || null,
    },
    album: {
      name: track.album?.["#text"] || null,
      mbid: track.album?.mbid || null,
      image: getImage(track),
    },
    url: track.url,
    mbid: track.mbid || null,

    duration,
    duration_text: formatDuration(duration),
  };
}

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Last.fm API is running",
    routes: {
      recent_tracks: "/recent-tracks",
      now_playing: "/now-playing",
    },
  });
});

app.get("/recent-tracks", async (req, res) => {
  try {
    const limit = req.query.limit || 10;

    const response = await axios.get(LASTFM_BASE_URL, {
      params: {
        method: "user.getrecenttracks",
        user: LASTFM_USERNAME,
        api_key: LASTFM_API_KEY,
        format: "json",
        limit,
      },
    });

    const rawTracks = response.data?.recenttracks?.track || [];
    const tracks = Array.isArray(rawTracks) ? rawTracks : [rawTracks];

    const normalizedTracks = await Promise.all(
      tracks.map((track) => normalizeTrack(track))
    );

    res.json({
      success: true,
      username: LASTFM_USERNAME,
      total: normalizedTracks.length,
      tracks: normalizedTracks,
    });
  } catch (err) {
    console.error(err.response?.data || err.message);

    res.status(500).json({
      success: false,
      error: "Failed to fetch Last.fm recent tracks",
    });
  }
});

app.get("/now-playing", async (req, res) => {
  try {
    const response = await axios.get(LASTFM_BASE_URL, {
      params: {
        method: "user.getrecenttracks",
        user: LASTFM_USERNAME,
        api_key: LASTFM_API_KEY,
        format: "json",
        limit: 1,
      },
    });

    const rawTracks = response.data?.recenttracks?.track || [];
    const tracks = Array.isArray(rawTracks) ? rawTracks : [rawTracks];

    if (!tracks.length) {
      return res.json({
        success: true,
        playing: false,
        track: null,
      });
    }

    const track = await normalizeTrack(tracks[0]);

    res.json({
      success: true,
      playing: track.now_playing,
      track,
    });
  } catch (err) {
    console.error(err.response?.data || err.message);

    res.status(500).json({
      success: false,
      error: "Failed to fetch Last.fm now playing",
    });
  }
});

app.listen(PORT, () => {
  console.log(`http://localhost:${PORT}`);
});
