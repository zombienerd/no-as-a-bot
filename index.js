const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, Events } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { token, clientId } = require('./config.json');

const reasons = JSON.parse(fs.readFileSync('./reasons.json', 'utf-8'));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages
  ]
});

// Command registration
const commands = [
  new SlashCommandBuilder()
    .setName('no')
    .setDescription('Drop a random rejection reason.')
    .toJSON()
];

const rest = new REST({ version: '10' }).setToken(token);
(async () => {
  try {
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    console.log('Slash commands registered.');
  } catch (err) {
    console.error('Command registration failed:', err);
  }
})();

// Persistent webhook cache
const CACHE_FILE = path.join(__dirname, 'webhooks.json');
let webhookCache = new Map();

// Load webhook cache from file
function loadCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
      for (const [channelId, webhookData] of Object.entries(data)) {
        webhookCache.set(channelId, webhookData);
      }
      console.log('Webhook cache loaded.');
    }
  } catch (err) {
    console.warn('Could not load cache:', err);
  }
}

// Save webhook cache to file
function saveCache() {
  const data = Object.fromEntries(webhookCache);
  fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2));
}

loadCache();

client.once(Events.ClientReady, () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== 'no') return;

  const channel = interaction.channel;
  const channelId = channel.id;
  const guild = interaction.guild;

  let webhookData = webhookCache.get(channelId);
  let webhook;

  try {
    if (webhookData) {
      // Reconstruct the webhook
      webhook = await client.fetchWebhook(webhookData.id, webhookData.token);
    } else {
      // Create or reuse an existing one in this channel
      const webhooks = await channel.fetchWebhooks();
      webhook = webhooks.find(wh => wh.owner?.id === client.user.id);

      if (!webhook) {
        webhook = await channel.createWebhook({
          name: 'NoBot Webhook',
          avatar: client.user.displayAvatarURL(),
        });
        console.log(`Created webhook in ${guild.name} / #${channel.name}`);
      }

      // Save to cache
      webhookData = { id: webhook.id, token: webhook.token };
      webhookCache.set(channelId, webhookData);
      saveCache();
    }

    // Pick a reason
    const reason = reasons[Math.floor(Math.random() * reasons.length)];

    // Choose the appropriate avatar URL
    const avatarURL = interaction.member?.avatar
      ? interaction.member.displayAvatarURL()
      : interaction.user.displayAvatarURL();

    // Post as user
    await webhook.send({
      content: reason,
      username: interaction.member?.displayName || interaction.user.username,
      avatarURL
    });

    // Defer and reply with modern flags usage
    await interaction.deferReply({ ephemeral: true });
    await interaction.editReply('✅ Rejection delivered.');

  } catch (err) {
    console.error(`Error handling /no in ${guild?.name || 'DMs'} / #${channel?.name || 'unknown'}:`, err);
    await interaction.reply({ content: '❌ Could not deliver the rejection. Check bot permissions.', ephemeral: true });
  }
});

client.login(token);
