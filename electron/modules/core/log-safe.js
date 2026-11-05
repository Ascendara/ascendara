/**
 * A download link for the log. Debrid and file-host links can carry a token in the
 * path or the query, and support logs get uploaded, so only the host is written.
 */
function linkForLog(link) {
  try {
    const { protocol, host } = new URL(String(link));
    return host ? `${protocol}//${host}/...` : `${protocol}...`;
  } catch {
    return "(not a URL)";
  }
}

module.exports = { linkForLog };
