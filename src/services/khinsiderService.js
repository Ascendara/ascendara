// KHInsider scraping/search service for Node.js/Electron
// Requires: axios, cheerio
import axios from "axios";
import * as cheerio from "cheerio";

// Always use proxy to avoid CORS issues (works in both dev and production)
const BASE_URL = "/api/khinsider";

/**
 * Search for albums by keyword (returns array of {id, name})
 * @param {string} term
 * @returns {Promise<Array<{id: string, name: string}>>}
 */
export async function searchAlbums(term) {
  const url = `${BASE_URL}/search?search=${encodeURIComponent(term)}`;
  const res = await axios.get(url);
  const $ = cheerio.load(res.data);
  const tables = $("table.albumList");
  if (!tables.length) return [];
  // Album results are in the first table
  const albums = [];
  tables
    .first()
    .find("tr")
    .slice(1) // skip header
    .each((_, tr) => {
      const a = $(tr).find("td").eq(1).find("a");
      if (a.length) {
        const href = a.attr("href");
        const id = href.split("/").pop();
        const name = a.text().trim();
        albums.push({ id, name });
      }
    });
  return albums;
}

/**
 * Fetch all tracks for a given album ID (from /game-soundtracks/album/:id)
 * @param {string} albumId
 * @returns {Promise<Array<{title: string, url: string}>>}
 */
export async function getAlbumTracks(albumId) {
  const url = `${BASE_URL}/game-soundtracks/album/${albumId}`;
  const res = await axios.get(url);
  const $ = cheerio.load(res.data);
  const table = $("#songlist");
  const headerTds = table.find("tr").first().find("th, td");
  let titleColIdx = -1;
  let pageColIdx = -1;
  headerTds.each((i, th) => {
    const txt = $(th).text().trim().toLowerCase();
    if (txt === "song name" || txt === "title") titleColIdx = i;
    if (txt === "download") pageColIdx = i;
  });
  if (titleColIdx === -1) titleColIdx = 3; // fallback to old default
  if (pageColIdx === -1) pageColIdx = 4; // fallback to old default

  const rows = table.find("tr").slice(1); // skip header
  const tracks = [];
  rows.each((_, tr) => {
    const tds = $(tr).find("td");
    const title = tds.eq(titleColIdx).text().trim();
    const pageLink = tds.eq(pageColIdx).find("a").attr("href");
    if (title && pageLink) {
      tracks.push({ title, page: BASE_URL + pageLink });
    }
  });
  // For each track, fetch the download URL (mp3)
  for (let track of tracks) {
    try {
      const pageRes = await axios.get(track.page);
      const $track = cheerio.load(pageRes.data);
      // The download link is in <a href="...mp3"> in the center tag
      const mp3Link = $track('a[href$=".mp3"]').attr("href");
      if (mp3Link) track.url = mp3Link.startsWith("http") ? mp3Link : BASE_URL + mp3Link;
    } catch (e) {
      track.url = null;
    }
    delete track.page;
  }
  return tracks.filter(t => t.url);
}

/**
 * High-level: search by keyword and get tracks for the best-matching album.
 * Prefers exact or near-exact matches to the search term.
 * @param {string} term
 * @returns {Promise<Array<{title: string, url: string}>>}
 */
export async function getGameSoundtrack(term) {
  const albums = await searchAlbums(term);
  if (!albums.length) return [];
  // Try to find the best match (case-insensitive)
  const lowerTerm = term.trim().toLowerCase();
  // Prefer exact match
  let best = albums.find(a => a.name.trim().toLowerCase() === lowerTerm);
  // If not, prefer startsWith
  if (!best) best = albums.find(a => a.name.trim().toLowerCase().startsWith(lowerTerm));
  // If not, prefer includes
  if (!best) best = albums.find(a => a.name.trim().toLowerCase().includes(lowerTerm));
  // Fall back to first result
  if (!best) best = albums[0];
  return getAlbumTracks(best.id);
}
