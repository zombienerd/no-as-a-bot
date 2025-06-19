const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, Events } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { token, clientId } = require('./config.json');

// Load all reason files
const noReasons = JSON.parse(fs.readFileSync('./reasons.json', 'utf-8'));
const yesReasons = JSON.parse(fs.readFileSync('./yesreasons.json', 'utf-8'));
const maybeReasons = JSON.parse(fs.readFileSync('./maybereasons.json', 'utf-8'));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages
  ]
});

// Register slash commands
const commands = [
  new SlashCommandBuilder().setName('no').setDescription('Drop a random rejection reason.'),
  new SlashCommandBuilder().setName('yes').setDescription('Drop a random affirmation.'),
  new SlashCommandBuilder().setName('maybe').setDescription('Drop a random ambiguous maybe.'),
].map(cmd => cmd.toJSON());

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
  const channel = interaction.channel;
  const channelId = channel.id;
  const guild = interaction.guild;

  const commandName = interaction.commandName;
  let pool;

  switch (commandName) {
    case 'no':
      pool = noReasons;
      break;
    case 'yes':
      pool = yesReasons;
      break;
    case 'maybe':
      pool = maybeReasons;
      break;
    default:
      return;
  }

  let webhookData = webhookCache.get(channelId);
  let webhook;

  try {
    if (webhookData) {
      webhook = await client.fetchWebhook(webhookData.id, webhookData.token);
    } else {
      const webhooks = await channel.fetchWebhooks();
      webhook = webhooks.find(wh => wh.owner?.id === client.user.id);

      if (!webhook) {
        webhook = await channel.createWebhook({
          name: 'NoBot Webhook',
          avatar: client.user.displayAvatarURL(),
        });
        console.log(`Created webhook in ${guild.name} / #${channel.name}`);
      }

      webhookData = { id: webhook.id, token: webhook.token };
      webhookCache.set(channelId, webhookData);
      saveCache();
    }

    const reason = pool[Math.floor(Math.random() * pool.length)];

    const avatarURL = interaction.member?.avatar
      ? interaction.member.displayAvatarURL()
      : interaction.user.displayAvatarURL();

    await webhook.send({
      content: reason,
      username: interaction.member?.displayName || interaction.user.username,
      avatarURL
    });

    await interaction.deferReply({ ephemeral: true });
    await interaction.editReply(`✅ ${commandName.charAt(0).toUpperCase() + commandName.slice(1)} delivered.`);

  } catch (err) {
    console.error(`Error handling /${commandName} in ${guild?.name || 'DMs'} / #${channel?.name || 'unknown'}:`, err);
    await interaction.reply({ content: '❌ Could not deliver the message. Check bot permissions.', ephemeral: true });
  }
});

client.login(token);
