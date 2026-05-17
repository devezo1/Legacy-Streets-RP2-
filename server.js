const path = require('path');
// Load decryption key for dotenvx if running locally
require('dotenv').config({ path: '.env.keys' });
require('@dotenvx/dotenvx').config();

const express = require('express');
const session = require('express-session');
const axios = require('axios');
const fs = require('fs');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, InteractionType, MessageFlags, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
const passport = require('passport');
const SteamStrategy = require('passport-steam').Strategy;
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Discord & App Configuration ───────────────────────────────────────────
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const CHANNEL_ID = process.env.WHITELIST_CHANNEL_ID;
const ACCEPT_ROLE_ID = process.env.WHITELIST_ROLE_ID;
const REJECT_ROLE_ID = process.env.REJECT_ROLE_ID;
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const STEAM_API_KEY = process.env.STEAM_API_KEY;

// Robust environment variable validation
const requiredEnvVars = {
    DISCORD_BOT_TOKEN: 'Discord Bot Token (DISCORD_BOT_TOKEN)',
    GUILD_ID: 'Discord Guild/Server ID (GUILD_ID)',
    WHITELIST_CHANNEL_ID: 'Discord Whitelist Channel ID (WHITELIST_CHANNEL_ID)',
    WHITELIST_ROLE_ID: 'Discord Whitelist Accepted Role ID (WHITELIST_ROLE_ID)',
    REJECT_ROLE_ID: 'Discord Whitelist Rejected Role ID (REJECT_ROLE_ID)',
    DISCORD_CLIENT_ID: 'Discord Client ID for OAuth2 (DISCORD_CLIENT_ID)',
    DISCORD_CLIENT_SECRET: 'Discord Client Secret for OAuth2 (DISCORD_CLIENT_SECRET)',
    STEAM_API_KEY: 'Steam API Key (STEAM_API_KEY)'
};

const missingEnvVars = Object.entries(requiredEnvVars)
    .filter(([key, _]) => !process.env[key])
    .map(([_, label]) => label);

if (missingEnvVars.length > 0) {
    console.error('\n=============================================');
    console.error('❌ FATAL CONFIGURATION ERROR:');
    console.error('The server could not start because some required environment variables are missing:\n');
    missingEnvVars.forEach(item => console.error(`  - ${item}`));
    console.error('\nPOSSIBLE CAUSES & HOW TO FIX IT:');
    console.error('1. You are running in a production container/hosting platform (e.g. Docker, Railway, Render, Koyeb).');
    console.error('   👉 You MUST add these variables in your hosting provider\'s web dashboard settings / environment variables tab.');
    console.error('2. Your local `.env` file is missing, misnamed, or ignored by Git.');
    console.error('   👉 Ensure a file named `.env` exists in the project root directory with all configuration values.');
    console.error('3. If you are using dotenvx encryption:');
    console.error('   👉 Make sure you have set the `DOTENV_PRIVATE_KEY` variable in your production environment.');
    console.error('=============================================\n');
    process.exit(1);
}

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMembers]
});

// ─── Kick Streamers Logic ───────────────────────────────────────────────────
const STREAMERS_FILE = path.join(__dirname, 'streamers.json');
function loadStreamers() {
    try { if (fs.existsSync(STREAMERS_FILE)) return JSON.parse(fs.readFileSync(STREAMERS_FILE, 'utf8')); }
    catch (err) { console.error('Error loading streamers:', err); }
    return [];
}
function saveStreamers(streamers) {
    try { fs.writeFileSync(STREAMERS_FILE, JSON.stringify(streamers, null, 2)); }
    catch (err) { console.error('Error saving streamers:', err); }
}
let streamersCache = loadStreamers();
let browser;

async function checkKickStatus(username) {
    try {
        if (!browser) browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36');
        await page.goto(`https://kick.com/api/v1/channels/${username}`, { waitUntil: 'networkidle2', timeout: 30000 });
        const content = await page.evaluate(() => { try { return JSON.parse(document.querySelector('body').innerText); } catch (e) { return null; } });
        await page.close();
        if (content) {
            return {
                isLive: content.livestream !== null,
                viewerCount: content.livestream ? content.livestream.viewer_count : 0,
                thumbnail: content.livestream ? content.livestream.thumbnail.url : (content.user ? content.user.profile_pic : null),
                title: content.livestream ? content.livestream.session_title : 'Offline',
                category: content.livestream && content.livestream.categories && content.livestream.categories[0] ? content.livestream.categories[0].name : 'N/A',
                username: content.user ? content.user.username : username,
                avatar: content.user ? content.user.profile_pic : null
            };
        }
    } catch (err) { console.error(`Error checking Kick status for ${username}:`, err.message); }
    return null;
}

async function updateAllStreamers() {
    const updated = [];
    for (const s of streamersCache) {
        const status = await checkKickStatus(s.username);
        updated.push(status ? { ...s, ...status, lastUpdate: new Date() } : s);
    }
    streamersCache = updated;
    saveStreamers(streamersCache);
}
updateAllStreamers();
setInterval(updateAllStreamers, 5 * 60 * 1000);

// ─── Discord Bot Events ──────────────────────────────────────────────────────
client.once('clientReady', async () => {
    console.log(`🤖 Discord Bot logged in as ${client.user.tag}`);
    const guild = await client.guilds.fetch(GUILD_ID);
    await guild.commands.set([{ name: 'kick', description: 'Add or manage Kick streamers' }]);
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;
    const [action, userId] = interaction.customId.split('_');
    const member = await interaction.guild.members.fetch(userId).catch(() => null);
    if (action === 'accept') {
        if (member) {
            await member.roles.add(ACCEPT_ROLE_ID).catch(e => console.error('Role add error:', e));
            await member.send('✅ Your whitelist application for **Legacy Streets RP** has been **ACCEPTED**!').catch(() => { });
        }
        await interaction.update({ content: `✅ **Accepted by ${interaction.user.tag}**`, components: [], embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setColor(0x00ff00)] });
    }
    if (action === 'reject') {
        if (member) {
            await member.roles.add(REJECT_ROLE_ID).catch(e => console.error('Role add error:', e));
            await member.send('❌ Your whitelist application for **Legacy Streets RP** has been **REJECTED**.').catch(() => { });
        }
        await interaction.update({ content: `❌ **Rejected by ${interaction.user.tag}**`, components: [], embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setColor(0xff0000)] });
    }
});

client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand() && interaction.commandName === 'kick') {
        const embed = new EmbedBuilder().setTitle('📺 Kick Streamer Management').setDescription('Manage Kick channels on the website monitor.').setColor(0x53FC18);
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('add_kick_channel').setLabel('Add Channel').setEmoji('➕').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('remove_kick_channel_init').setLabel('Remove Channel').setEmoji('🗑️').setStyle(ButtonStyle.Danger)
        );
        await interaction.reply({ embeds: [embed], components: [row], flags: [MessageFlags.Ephemeral] });
    }

    if (interaction.isButton() && interaction.customId === 'add_kick_channel') {
        const modal = new ModalBuilder().setCustomId('kick_modal').setTitle('Add Kick Channel');
        modal.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('kick_username').setLabel('Kick Username').setPlaceholder('Enter username from kick.com/username').setStyle(TextInputStyle.Short).setRequired(true)
        ));
        await interaction.showModal(modal);
    }

    if (interaction.type === InteractionType.ModalSubmit && interaction.customId === 'kick_modal') {
        let username = interaction.fields.getTextInputValue('kick_username').trim().toLowerCase();
        if (username.includes('kick.com/')) username = username.split('kick.com/').pop().split('/')[0].split('?')[0];
        if (streamersCache.find(s => s.username === username)) return interaction.reply({ content: `❌ **${username}** is already monitored.`, flags: [MessageFlags.Ephemeral] });
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const status = await checkKickStatus(username);
        if (status) {
            streamersCache.push({ username, platform: 'kick', addedBy: interaction.user.tag, ...status });
            saveStreamers(streamersCache);
            await interaction.editReply({ content: `✅ Added **${username}** to the streamers list!` });
        } else {
            await interaction.editReply({ content: `❌ Could not find Kick channel **${username}**.` });
        }
    }

    if (interaction.isButton() && interaction.customId === 'remove_kick_channel_init') {
        if (streamersCache.length === 0) return interaction.reply({ content: '❌ No streamers to remove.', flags: [MessageFlags.Ephemeral] });
        const select = new StringSelectMenuBuilder().setCustomId('remove_kick_select').setPlaceholder('Choose a streamer to remove...').addOptions(
            streamersCache.slice(0, 25).map(s => new StringSelectMenuOptionBuilder().setLabel(s.username).setValue(s.username).setDescription(`Added by ${s.addedBy || 'Unknown'}`))
        );
        await interaction.reply({ content: 'Select the streamer to remove:', components: [new ActionRowBuilder().addComponents(select)], flags: [MessageFlags.Ephemeral] });
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'remove_kick_select') {
        const usernameToRemove = interaction.values[0];
        const index = streamersCache.findIndex(s => s.username === usernameToRemove);
        if (index !== -1) { streamersCache.splice(index, 1); saveStreamers(streamersCache); await interaction.update({ content: `✅ Removed **${usernameToRemove}**.`, components: [] }); }
        else await interaction.update({ content: `❌ Could not find **${usernameToRemove}**.`, components: [] });
    }
});

client.login(DISCORD_BOT_TOKEN);

// ─── Auth DB ─────────────────────────────────────────────────────────────────
// Structure: { users: { [discordId]: { ...userData } }, byUsername: { [username]: discordId }, byEmail: { [email]: discordId } }
const AUTH_DB_FILE = path.join(__dirname, 'auth_database.json');
function loadAuthDB() {
    try { if (fs.existsSync(AUTH_DB_FILE)) return JSON.parse(fs.readFileSync(AUTH_DB_FILE, 'utf8')); }
    catch (e) { }
    return { users: {}, byUsername: {}, byEmail: {} };
}
function saveAuthDB() {
    try { fs.writeFileSync(AUTH_DB_FILE, JSON.stringify(authDB, null, 2)); }
    catch (e) { console.error('DB Save Error:', e); }
}
function getUserByDiscordId(discordId) { return authDB.users[discordId] || null; }
function getUserByUsername(username) { const id = authDB.byUsername[username?.toLowerCase()]; return id ? authDB.users[id] : null; }
function getUserByEmail(email) { const id = authDB.byEmail[email?.toLowerCase()]; return id ? authDB.users[id] : null; }
function saveUser(userData) {
    if (!userData.discordId) return;
    authDB.users[userData.discordId] = userData;
    if (userData.username) authDB.byUsername[userData.username.toLowerCase()] = userData.discordId;
    if (userData.email) authDB.byEmail[userData.email.toLowerCase()] = userData.discordId;
    saveAuthDB();
}

let authDB = loadAuthDB();
// Migrate old format
if (!authDB.users) { authDB = { users: {}, byUsername: {}, byEmail: {} }; saveAuthDB(); }

// ─── Hot-reload: watch for external edits to auth_database.json ──────────────
let fsWatchDebounce = null;
fs.watch(AUTH_DB_FILE, { persistent: false }, () => {
    // Debounce so rapid writes (like our own saveAuthDB) don't cause infinite loops
    clearTimeout(fsWatchDebounce);
    fsWatchDebounce = setTimeout(() => {
        try {
            const fresh = loadAuthDB();
            if (fresh && fresh.users) {
                authDB = fresh;
                console.log('[AuthDB] 🔄 Reloaded from disk (external edit detected)');
            }
        } catch (e) { console.error('[AuthDB] Reload error:', e.message); }
    }, 300);
});

// ─── Discord OAuth Credentials ───────────────────────────────────────────────
const DISCORD_REDIRECT_URI = `http://localhost:${PORT}/auth/discord/callback`;
const DISCORD_SCOPES = 'identify email';

// ─── Middleware ──────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: process.env.SESSION_SECRET || 'legacy-streets-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 1000 * 60 * 60 * 24 * 30 } // 30 days
}));
app.use(express.static(path.join(__dirname, 'public')));

// ─── Passport Setup ──────────────────────────────────────────────────────────
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));
passport.use(new SteamStrategy({
    returnURL: `http://localhost:${PORT}/auth/steam/callback`,
    realm: `http://localhost:${PORT}/`,
    apiKey: STEAM_API_KEY
}, (identifier, profile, done) => done(null, profile)));
app.use(passport.initialize());
app.use(passport.session());

// Helper to get session user
function getSessionUser(req) {
    if (req.session.discordId) return getUserByDiscordId(req.session.discordId);
    return null;
}

function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

// ─── Discord OAuth ───────────────────────────────────────────────────────────
app.get('/auth/discord', (req, res) => {
    const isEn = req.headers.referer && req.headers.referer.includes('/en/') ? 'en' : 'ar';
    req.session.lastLang = isEn;
    req.session.authMode = req.query.mode || 'link';
    const params = new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        redirect_uri: DISCORD_REDIRECT_URI,
        response_type: 'code',
        scope: DISCORD_SCOPES
    });
    req.session.save(() => res.redirect(`https://discord.com/oauth2/authorize?${params}`));
});

app.get('/auth/discord/callback', async (req, res) => {
    const { code, error } = req.query;
    const isEn = req.session.lastLang === 'en';
    const loginUrl = isEn ? '/en/login.html' : '/login.html';
    const setupUrl = isEn ? '/en/setup.html' : '/setup.html';
    const indexUrl = isEn ? '/en/index.html' : '/index.html';

    if (error || !code) return res.redirect(`${loginUrl}?error=discord_denied`);

    try {
        const tokenRes = await axios.post('https://discord.com/api/oauth2/token', new URLSearchParams({
            client_id: DISCORD_CLIENT_ID,
            client_secret: DISCORD_CLIENT_SECRET,
            grant_type: 'authorization_code',
            code,
            redirect_uri: DISCORD_REDIRECT_URI
        }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

        const { access_token, token_type } = tokenRes.data;
        const discordUser = (await axios.get('https://discord.com/api/users/@me', { headers: { Authorization: `${token_type} ${access_token}` } })).data;

        const discordId = discordUser.id;

        // Load or create user record
        let user = getUserByDiscordId(discordId) || {};
        user.discordId = discordId;
        user.discordUsername = discordUser.username;
        user.discordGlobalName = discordUser.global_name || discordUser.username;
        user.avatar = 'https://0utlawrp.com/assets/landing/img/logo.png';
        if (!user.email && discordUser.email) user.email = discordUser.email;
        if (!user.username) user.username = discordUser.global_name || discordUser.username;

        saveUser(user);
        req.session.discordId = discordId;

        const isFullyRegistered = !!(user.discordId && user.steam && user.password);

        req.session.save(() => {
            if (isFullyRegistered) res.redirect(`${indexUrl}?login=success`);
            else res.redirect(`${setupUrl}?login=success&provider=discord`);
        });
    } catch (err) {
        console.error('Discord Auth Error:', err.response?.data || err.message);
        res.redirect(`${loginUrl}?error=oauth_failed`);
    }
});

// ─── Steam Auth ───────────────────────────────────────────────────────────────
app.get('/auth/steam', (req, res, next) => {
    req.session.lastLang = req.headers.referer && req.headers.referer.includes('/en/') ? 'en' : 'ar';
    req.session.authMode = req.query.mode || 'link';
    // Save discordId as pendingDiscordId BEFORE Steam redirects (session may be touched by passport)
    req.session.pendingDiscordId = req.session.discordId || null;
    req.session.save(() => next());
    // session:false → Passport will NOT call req.logIn() / session.regenerate(), keeping our session intact
}, passport.authenticate('steam', { session: false }));

app.get('/auth/steam/callback',
    passport.authenticate('steam', { failureRedirect: '/en/login.html?error=steam_failed', session: false }),
    (req, res) => {
        // Because session:false, our session data (discordId, pendingDiscordId) is fully intact
        const isEn = req.session.lastLang === 'en';
        const loginUrl = isEn ? '/en/login.html' : '/login.html';
        const setupUrl = isEn ? '/en/setup.html' : '/setup.html';
        const indexUrl = isEn ? '/en/index.html' : '/index.html';

        const steamData = { id: req.user.id, displayName: req.user.displayName, avatar: 'https://0utlawrp.com/assets/landing/img/logo.png' };

        // Read discordId - try both locations in case of session edge cases
        const discordId = req.session.discordId || req.session.pendingDiscordId;
        if (!discordId) {
            // No Discord session at all — user must link Discord first
            return res.redirect(`${loginUrl}?error=discord_first`);
        }

        // Ensure discordId is always set back in session (in case it came from pendingDiscordId)
        req.session.discordId = discordId;

        // Merge Steam into existing user record (never overwrites Discord data)
        let user = getUserByDiscordId(discordId) || { discordId };
        user.steam = steamData;
        if (!user.username) user.username = steamData.displayName;
        saveUser(user);

        const isFullyRegistered = !!(user.discordId && user.steam && user.password);

        req.session.save(() => {
            if (isFullyRegistered) res.redirect(`${indexUrl}?login=success`);
            else res.redirect(`${setupUrl}?login=success&provider=steam`);
        });
    }
);

// ─── API: /api/me ─────────────────────────────────────────────────────────────
app.get('/api/me', async (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.json({ loggedIn: false });

    let isProcessed = false;
    try {
        if (user.discordId) {
            const guild = await client.guilds.fetch(GUILD_ID);
            const member = await guild.members.fetch(user.discordId).catch(() => null);
            if (member) isProcessed = member.roles.cache.has(ACCEPT_ROLE_ID) || member.roles.cache.has(REJECT_ROLE_ID);
        }
    } catch (err) { console.error('Role check error:', err.message); }

    res.json({
        loggedIn: true,
        user: {
            ...user,
            password: undefined, // never expose password hash
            discordConnected: !!user.discordId,
            steamConnected: !!user.steam,
            isFullyRegistered: !!(user.discordId && user.steam && user.password),
            isProcessed
        }
    });
});

// ─── API: Register (complete setup) ──────────────────────────────────────────
app.post('/api/register', (req, res) => {
    const { email, password, username } = req.body;
    const discordId = req.session.discordId;

    if (!discordId) return res.json({ success: false, message: 'Not authenticated. Please connect Discord first.' });

    let user = getUserByDiscordId(discordId);
    if (!user) return res.json({ success: false, message: 'User session not found. Please login again.' });
    if (!user.steam) return res.json({ success: false, message: 'Please connect Steam first.' });
    if (!email || !password || !username) return res.json({ success: false, message: 'All fields are required.' });

    // Check username/email not taken by another user
    const existingByUsername = getUserByUsername(username);
    if (existingByUsername && existingByUsername.discordId !== discordId) return res.json({ success: false, message: 'Username already taken.' });
    const existingByEmail = getUserByEmail(email);
    if (existingByEmail && existingByEmail.discordId !== discordId) return res.json({ success: false, message: 'Email already registered.' });

    user.email = email;
    user.username = username;
    user.password = hashPassword(password);
    saveUser(user);

    req.session.save(() => res.json({ success: true }));
});

// ─── API: Login ───────────────────────────────────────────────────────────────
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.json({ success: false, message: 'Username/email and password are required.' });

    // Always reload from disk first to catch any manual edits
    try { const fresh = loadAuthDB(); if (fresh && fresh.users) authDB = fresh; } catch (e) { }

    // Find user by username or email (case-insensitive)
    let user = getUserByUsername(username) || getUserByEmail(username);
    if (!user) return res.json({ success: false, message: 'Account not found.' });
    if (!user.password) return res.json({ success: false, message: 'This account has not completed registration yet.' });

    // Detect plain-text password (not a 64-char hex SHA256 hash)
    const isHashedPassword = /^[a-f0-9]{64}$/.test(user.password);
    let passwordCorrect = false;

    if (isHashedPassword) {
        // Normal hashed comparison
        passwordCorrect = (user.password === hashPassword(password));
    } else {
        // Plain-text password stored manually — compare directly
        passwordCorrect = (user.password === password);
        if (passwordCorrect) {
            // Silently upgrade plain-text to secure hash
            user.password = hashPassword(password);
            saveUser(user);
            console.log(`[Auth] Upgraded plain-text password to hash for user: ${user.username}`);
        }
    }

    if (!passwordCorrect) return res.json({ success: false, message: 'Incorrect password.' });

    req.session.discordId = user.discordId;
    req.session.save(() => res.json({ success: true }));
});

// ─── API: Logout ──────────────────────────────────────────────────────────────
app.post('/api/logout', (req, res) => {
    req.session.destroy(() => res.json({ success: true }));
});

// ─── API: Whitelist ───────────────────────────────────────────────────────────
app.post('/api/whitelist/submit', async (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ success: false, message: 'You must be logged in' });

    const { answers } = req.body;
    try {
        const guild = await client.guilds.fetch(GUILD_ID);
        const channel = await guild.channels.fetch(CHANNEL_ID);
        const embed = new EmbedBuilder()
            .setTitle('📝 New Whitelist Application').setColor(0x0099ff)
            .setThumbnail(user.avatar)
            .addFields(
                { name: 'User', value: `<@${user.discordId}> (${user.username})`, inline: true },
                { name: 'Discord ID', value: user.discordId, inline: true }
            ).setTimestamp();

        answers.forEach((ans, i) => {
            embed.addFields({ name: `Question ${i + 1}`, value: `**Q:** ${ans.question}\n**A:** ${ans.answer || 'No answer'}`.substring(0, 1024) });
        });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`accept_${user.discordId}`).setLabel('Accept').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`reject_${user.discordId}`).setLabel('Reject').setStyle(ButtonStyle.Danger)
        );
        await channel.send({ embeds: [embed], components: [row] });
        res.json({ success: true, message: 'Application submitted successfully!' });
    } catch (err) {
        console.error('Submission error:', err);
        res.status(500).json({ success: false, message: 'Failed to send application to Discord' });
    }
});

// ─── API: Streamers ───────────────────────────────────────────────────────────
app.get('/api/streamers', (req, res) => res.json(streamersCache));

// ─── Fallback ─────────────────────────────────────────────────────────────────
app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'en', 'index.html'));
});

app.listen(PORT, () => {
    console.log('=============================================');
    console.log('🚀 Legacy Streets RP - Backend Running!');
    console.log(`📡 Server: http://localhost:${PORT}`);
    console.log('=============================================');
});
