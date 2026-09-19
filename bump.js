require('dotenv').config();

const WebSocket = require('ws');
const https = require('https');

const DISBOARD_ID = '302050872383242240';

const ACCOUNTS = [
  { token: process.env.DISCORD_TOKEN_1, tokenName: 'DISCORD_TOKEN_1', channelId: '1489983999110549644', label: 'Account 1', startDelay: 0 },
  { token: process.env.DISCORD_TOKEN_2, tokenName: 'DISCORD_TOKEN_2', channelId: '1476925009388896271', label: 'Account 2', startDelay: 1 },
  { token: process.env.DISCORD_TOKEN_3, tokenName: 'DISCORD_TOKEN_3', channelId: '1469248063699816557', label: 'Account 3', startDelay: 2 },
  { token: process.env.DISCORD_TOKEN_4, tokenName: 'DISCORD_TOKEN_4', channelId: '1473023210093281420', label: 'Account 4', startDelay: 3 },
  { token: process.env.DISCORD_TOKEN_5, tokenName: 'DISCORD_TOKEN_5', channelId: '1492047136303611934', label: 'Account 5', startDelay: 4 },
  { token: process.env.DISCORD_TOKEN_6, tokenName: 'DISCORD_TOKEN_6', channelId: '1491651646542057478', label: 'Account 6', startDelay: 5 },
  { token: process.env.DISCORD_TOKEN_7, tokenName: 'DISCORD_TOKEN_7', channelId: '1491766523193200827', label: 'Account 7', startDelay: 6 },
  { token: process.env.DISCORD_TOKEN_8, tokenName: 'DISCORD_TOKEN_8', channelId: '1491718454208893096', label: 'Account 8', startDelay: 7 },
  { token: process.env.DISCORD_TOKEN_9, tokenName: 'DISCORD_TOKEN_9', channelId: '1491382781291401242', label: 'Account 9', startDelay: 8 },
  { token: process.env.DISCORD_TOKEN_10, tokenName: 'DISCORD_TOKEN_10', channelId: '1479476252992733368', label: 'Account 10', startDelay: 9 },
  { token: process.env.DISCORD_TOKEN_11, tokenName: 'DISCORD_TOKEN_11', channelId: '1484808248791007376', label: 'Account 11', startDelay: 10 },
  { token: process.env.DISCORD_TOKEN_12, tokenName: 'DISCORD_TOKEN_12', channelId: '1483428677797548205', label: 'Account 12', startDelay: 11 },
  { token: process.env.DISCORD_TOKEN_13, tokenName: 'DISCORD_TOKEN_13', channelId: '1463929516710826170', label: 'Account 13', startDelay: 12 },
  { token: process.env.DISCORD_TOKEN_14, tokenName: 'DISCORD_TOKEN_14', channelId: '1474360829691302069', label: 'Account 14', startDelay: 13 },
];

const WEBHOOK_URL = process.env.DISCORD_ALERT_WEBHOOK_URL;
const alertedTokens = new Set();

function sendWebhookAlert(message) {
  if (!WEBHOOK_URL) {
    console.error(`⚠️ DISCORD_ALERT_WEBHOOK_URL not set — cannot send alert: ${message}`);
    return;
  }
  try {
    const url = new URL(WEBHOOK_URL);
    const body = JSON.stringify({ content: message });
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, res => {
      res.on('data', () => {});
      res.on('end', () => {
        if (res.statusCode >= 300) {
          console.error(`⚠️ Webhook alert failed with status ${res.statusCode}`);
        }
      });
    });
    req.on('error', err => console.error(`⚠️ Webhook alert error: ${err.message}`));
    req.write(body);
    req.end();
  } catch (err) {
    console.error(`⚠️ Webhook alert error: ${err.message}`);
  }
}

function alertExpiredToken(tokenName) {
  if (alertedTokens.has(tokenName)) return;
  alertedTokens.add(tokenName);
  sendWebhookAlert(`⚠️ ${tokenName} expired or invalid`);
}

const validAccounts = ACCOUNTS.filter(a => a.token && a.channelId);
if (validAccounts.length === 0) {
  console.error('No valid accounts found. Set DISCORD_TOKEN_1..14 with matching channel IDs.');
  process.exit(1);
}
console.log(`🚀 Starting ${validAccounts.length} Disboard Auto Bumper(s)...`);

// Parse time remaining from Disboard's response message
function parseDisboardDelay(text) {
  if (!text) return null;
  let totalMs = 0;
  const hourMatch = text.match(/(\d+)\s*hour/i);
  const minuteMatch = text.match(/(\d+)\s*min/i);
  const secondMatch = text.match(/(\d+)\s*sec/i);
  if (hourMatch) totalMs += parseInt(hourMatch[1]) * 3600000;
  if (minuteMatch) totalMs += parseInt(minuteMatch[1]) * 60000;
  if (secondMatch) totalMs += parseInt(secondMatch[1]) * 1000;
  return totalMs > 0 ? totalMs : null;
}

// Extract text from a Discord message (content or embeds)
function extractMessageText(msg) {
  const parts = [];
  if (msg.content) parts.push(msg.content);
  if (msg.embeds) {
    for (const e of msg.embeds) {
      if (e.title) parts.push(e.title);
      if (e.description) parts.push(e.description);
    }
  }
  return parts.join(' ');
}

function makeApi(token) {
  return function api(method, path, body, apiVersion = 'v10') {
    const opts = {
      hostname: 'discord.com',
      path: `/api/${apiVersion}` + path,
      method,
      headers: {
        'Authorization': token,
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    };
    return new Promise((resolve, reject) => {
      const req = https.request(opts, res => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          if (res.statusCode === 204) return resolve(null);
          if (res.statusCode < 300) {
            try { resolve(JSON.parse(data)); } catch { resolve(data); }
          } else {
            reject(new Error(`${res.statusCode}: ${data}`));
          }
        });
      });
      req.on('error', reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  };
}

async function getBumpCommand(api, channelId, guildId) {
  try {
    const result = await api('GET', `/guilds/${guildId}/application-command-index`);
    const cmds = result.application_commands || [];
    const bumpCmd = cmds.find(c => c.application_id === DISBOARD_ID && c.name === 'bump');
    if (bumpCmd) return bumpCmd;
  } catch (e) {}

  try {
    const result = await api('GET', `/channels/${channelId}/application-commands/search?type=1&query=bump&limit=25`);
    const cmds = result.application_commands || [];
    const bumpCmd = cmds.find(c => c.application_id === DISBOARD_ID && c.name === 'bump');
    if (bumpCmd) return bumpCmd;
  } catch (e) {}

  return {
    id: '947088344167366698',
    version: '1051151064008769576',
    application_id: DISBOARD_ID,
    name: 'bump',
    type: 1
  };
}

async function sendBump(api, label, channelId, guildId, sid, cmdInfo) {
  try {
    const nonce = ((BigInt(Date.now()) - 1420070400000n) << 22n).toString();
    await api('POST', '/interactions', {
      type: 2,
      application_id: DISBOARD_ID,
      guild_id: guildId,
      channel_id: channelId,
      session_id: sid,
      nonce,
      data: {
        version: cmdInfo.version,
        id: cmdInfo.id,
        name: 'bump',
        type: 1,
        options: [],
        application_command: {
          id: cmdInfo.id,
          application_id: DISBOARD_ID,
          version: cmdInfo.version,
          default_member_permissions: null,
          type: 1,
          name: 'bump',
          description: 'Bumps your server on DISBOARD',
          dm_permission: true,
          contexts: null,
          integration_types: [0]
        },
        attachments: []
      }
    }, 'v9');
    console.log(`[${label}] [${new Date().toLocaleString()}] ✅ Bump sent!`);
    return true;
  } catch (e) {
    console.error(`[${label}] [${new Date().toLocaleString()}] ❌ Bump failed: ${e.message}`);
    return false;
  }
}

function startBumper({ token, tokenName, channelId, label, startDelay }) {
  const api = makeApi(token);
  let sid = null;
  // Holds the resolve function waiting for Disboard's reply
  let pendingResponse = null;

  function waitForDisboardReply() {
    return new Promise(resolve => {
      pendingResponse = resolve;
      // Fallback: if no reply in 20 seconds, resolve with null
      setTimeout(() => {
        if (pendingResponse) {
          pendingResponse = null;
          resolve(null);
        }
      }, 20000);
    });
  }

  function connect() {
    const ws = new WebSocket('wss://gateway.discord.gg/?v=10&encoding=json');
    let seq = null;
    let hb = null;
    let guildId = null;
    let cmdInfo = null;
    let scheduled = false;
    let serverName = label; // will be replaced with actual server name

    const tag = () => `[${serverName}]`;

    ws.on('open', () => console.log(`${tag()} 🔌 WebSocket connected`));

    ws.on('message', async raw => {
      const p = JSON.parse(raw);
      if (p.s) seq = p.s;

      if (p.op === 10) {
        ws.send(JSON.stringify({
          op: 2,
          d: {
            token,
            properties: { os: 'Windows', browser: 'Chrome', device: '' },
            compress: false,
            presence: { status: 'online', afk: false }
          }
        }));
        hb = setInterval(() => ws.send(JSON.stringify({ op: 1, d: seq })), p.d.heartbeat_interval);
      }

      if (p.op === 9) {
        console.error(`${tag()} ❌ Invalid session — token may be expired`);
        alertExpiredToken(tokenName);
      }

      // Listen for Disboard's reply messages in the bump channel
      if (p.op === 0 && (p.t === 'MESSAGE_CREATE' || p.t === 'MESSAGE_UPDATE')) {
        const msg = p.d;
        const fromDisboard = msg.application_id === DISBOARD_ID || msg.author?.id === DISBOARD_ID;
        if (fromDisboard && msg.channel_id === channelId && pendingResponse) {
          const text = extractMessageText(msg);
          const resolver = pendingResponse;
          pendingResponse = null;
          resolver(text);
        }
      }

      if (p.op === 0 && p.t === 'READY') {
        sid = p.d.session_id;

        let channelName = channelId;
        try {
          const channel = await api('GET', `/channels/${channelId}`);
          guildId = channel.guild_id;
          channelName = channel.name;
        } catch (e) {
          console.error(`${tag()} Could not fetch channel: ${e.message}`);
        }

        try {
          const guild = await api('GET', `/guilds/${guildId}`);
          serverName = guild.name;
        } catch (e) {
          serverName = label;
        }

        console.log(`${tag()} ✅ Logged in as ${p.d.user.username}#${p.d.user.discriminator} → #${channelName}`);
        cmdInfo = await getBumpCommand(api, channelId, guildId);

        if (!scheduled) {
          scheduled = true;
          const firstDelay = 5000 + (startDelay * 2000);
          console.log(`📋 [${startDelay + 1}] ${serverName} → #${channelName} (bumps in ${Math.round(firstDelay / 1000)}s)`);
          setTimeout(() => bumpAndSchedule(), firstDelay);
        }
      }
    });

    async function bumpAndSchedule() {
      await sendBump(api, serverName, channelId, guildId, sid, cmdInfo);

      console.log(`${tag()} ⏳ Waiting for Disboard's response...`);
      const replyText = await waitForDisboardReply();

      let delay = 7200000;

      if (replyText) {
        const parsed = parseDisboardDelay(replyText);
        if (parsed) {
          delay = parsed + 5000;
          console.log(`${tag()} ⏰ Next bump in ${Math.round(delay / 60000)} minutes (from Disboard)`);
        } else if (/bump done|bumped/i.test(replyText)) {
          delay = 7200000;
          console.log(`${tag()} ⏰ Bump done! Next bump in 120 minutes`);
        } else {
          console.log(`${tag()} ⏰ Could not parse reply, defaulting to 120 minutes`);
        }
      } else {
        console.log(`${tag()} ⏰ No reply received, defaulting to 120 minutes`);
      }

      setTimeout(() => bumpAndSchedule(), delay);
    }

    ws.on('close', (code, reason) => {
      if (hb) clearInterval(hb);
      if (code === 4004) {
        console.error(`${tag()} ❌ Invalid token — skipping. Update DISCORD_TOKEN for ${label}.`);
        alertExpiredToken(tokenName);
        return;
      }
      console.log(`${tag()} 🔴 Disconnected: code=${code} — reconnecting in 5s`);
      setTimeout(connect, 5000);
    });

    ws.on('error', err => console.error(`${tag()} ⚠️ WS error: ${err.message}`));
  }

  connect();
}

validAccounts.forEach(account => startBumper(account));
