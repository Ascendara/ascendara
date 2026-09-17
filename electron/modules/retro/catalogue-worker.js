const { parentPort, workerData } = require("worker_threads");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { pipeline } = require("stream/promises");
const { Transform, Writable } = require("stream");
const { StringDecoder } = require("string_decoder");
const axios = require("axios");
const unzipper = require("unzipper");
const sax = require("sax");
const { platforms } = require("./platforms");

async function parseCatalogue(stream) {
  const platformIds = new Map(Object.values(platforms).map(p => [p.catalogue.toLowerCase(), p.id]));
  const games = new Map(), images = new Map(), aliases = new Map();
  const parser = sax.parser(true, { trim: true });
  let record = null, tag = null, kind = null, count = 0;
  parser.onopentag = node => {
    if (["Game", "GameImage", "GameAlternateName"].includes(node.name)) { record = {}; kind = node.name; }
    tag = node.name;
  };
  const append = text => { if (record && tag && text.length < 100000) record[tag] = (record[tag] || "") + text; };
  parser.ontext = append;
  parser.oncdata = append;
  parser.onclosetag = name => {
    if (record && name === kind) {
      const id = String(record.DatabaseID || record.DatabaseId || "");
      if (kind === "Game") {
        const platform = platformIds.get((record.Platform || "").toLowerCase());
        if (platform && /^\d+$/.test(id) && record.Name) games.set(id, { id, platform, title: record.Name, year: (record.ReleaseDate || "").slice(0, 4), genres: record.Genres || "", description: record.Overview || "", developer: record.Developer || "" });
      } else if (kind === "GameImage" && record.Type === "Box - Front" && /^[a-zA-Z0-9_.-]+$/.test(record.FileName || "")) {
        if (!images.has(id) || record.Region === "North America") images.set(id, `https://images.launchbox-app.com/${record.FileName}`);
      } else if (kind === "GameAlternateName" && record.AlternateName) {
        if (!aliases.has(id)) aliases.set(id, []);
        aliases.get(id).push(record.AlternateName);
      }
      record = null; kind = null;
      if (++count % 25000 === 0) parentPort?.postMessage({ progress: { phase: "catalogue", records: count } });
    }
    tag = null;
  };
  let bytes = 0;
  const limit = new Transform({ transform(chunk, encoding, callback) { bytes += chunk.length; callback(bytes > 2 * 1024 ** 3 ? new Error("Catalogue is too large") : null, chunk); } });
  const decoder = new StringDecoder("utf8");
  const sink = new Writable({
    write(chunk, encoding, callback) { try { parser.write(decoder.write(chunk)); callback(); } catch (error) { callback(error); } },
    final(callback) { try { parser.write(decoder.end()).close(); callback(); } catch (error) { callback(error); } },
  });
  await pipeline(stream, limit, sink);
  const result = [...games.values()].map(game => ({ ...game, cover: images.get(game.id) || null, aliases: aliases.get(game.id) || [] }));
  if (!result.length) throw new Error("No supported games found in LaunchBox Metadata.xml");
  return result;
}

async function run() {
  await fsp.mkdir(workerData.directory, { recursive: true });
  let filename = workerData.source;
  const temporary = path.join(workerData.directory, "catalogue-download.zip");
  try {
    if (!filename) {
      const response = await axios.get("https://gamesdb.launchbox-app.com/Metadata.zip", { responseType: "stream", timeout: 120000, maxRedirects: 3 });
      let bytes = 0;
      const meter = new Transform({ transform(chunk, encoding, callback) {
        bytes += chunk.length;
        if (bytes > 512 * 1024 ** 2) return callback(new Error("Catalogue download exceeds 512 MB"));
        parentPort.postMessage({ progress: { phase: "downloading catalogue", bytes } });
        callback(null, chunk);
      } });
      await pipeline(response.data, meter, fs.createWriteStream(temporary));
      filename = temporary;
    }
    let games;
    if (path.extname(filename).toLowerCase() === ".zip") {
      const archive = await unzipper.Open.file(filename);
      const entry = archive.files.find(file => /(^|\/)Metadata\.xml$/i.test(file.path));
      if (!entry) throw new Error("Metadata.xml was not found in the archive");
      games = await parseCatalogue(entry.stream());
    } else games = await parseCatalogue(fs.createReadStream(filename));
    const output = path.join(workerData.directory, "catalogue.json");
    await fsp.writeFile(`${output}.tmp`, JSON.stringify({ updatedAt: new Date().toISOString(), games }));
    await fsp.rename(`${output}.tmp`, output);
    parentPort.postMessage({ done: true, count: games.length });
  } finally { await fsp.unlink(temporary).catch(() => {}); }
}
if (parentPort) run().catch(error => parentPort.postMessage({ error: error.message }));
module.exports = { parseCatalogue };
