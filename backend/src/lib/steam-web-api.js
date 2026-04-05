/**
 * @param {string} apiKey Steam Web API key
 * @param {string} steamId SteamID64
 * @returns {Promise<{ personaname?: string, gameextrainfo?: string|null, gameid?: string|null }|null>}
 */
async function fetchSteamPlayerSummary(apiKey, steamId) {
  if (!apiKey || !steamId) return null;
  const url = new URL("https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("steamids", String(steamId));
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const player = data?.response?.players?.[0];
  if (!player) return null;
  return {
    personaname: player.personaname,
    gameextrainfo: player.gameextrainfo ?? null,
    gameid: player.gameid ?? null,
  };
}

module.exports = { fetchSteamPlayerSummary };
