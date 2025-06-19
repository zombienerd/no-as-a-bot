const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, Events } = require('discord.js');
const fs = require('fs');
const { token, clientId } = require('./config.json');

const reasons = JSON.parse(fs.readFileSync('./reasons.json', 'utf-8'));
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages
  ]
});

// Register slash command globally
const commands = [
  new SlashCommandBuilder()
    .setName('no')
    .setDescription('Drop a random rejection reason.')
    .toJSON()
];

const rest = new REST({ version: '10' }).setToken(token);
(async () => {
  try {
    console.log('Registering slash commands...');
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    console.log('Commands registered.');
  } catch (err) {
    console.error('Command registration failed:', err);
  }
})();

// Cache: channelId -> webhook
const webhookCache = new Map();

client.once(Events.ClientReady, () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== 'no') return;

  const channel = interaction.channel;
  const channelId = channel.id;

  // Get or create webhook for the current channel
  let webhook = webhookCache.get(channelId);
  try {
    if (!webhook) {
      const webhooks = await channel.fetchWebhooks();
      webhook = webhooks.find(wh => wh.owner?.id === client.user.id);
      if (!webhook) {
        webhook = await channel.createWebhook({
          name: 'NoBot Webhook',
          avatar: client.user.displayAvatarURL()
        });
        console.log(`Created webhook in ${channel.guild.name} / #${channel.name}`);
      }
      webhookCache.set(channelId, webhook);
    }

    // Get random reason
    const reason = reasons[Math.floor(Math.random() * reasons.length)];

    // Send message via webhook "as user"
    await webhook.send({
      content: reason,
      username: interaction.member?.displayName || interaction.user.username,
      avatarURL: interaction.user.displayAvatarURL(),
    });

    await interaction.deferReply({ ephemeral: true });
    await interaction.editReply('Rejection delivered.');

  } catch (err) {
    console.error(`Error handling /no in ${channel.guild.name} / #${channel.name}:`, err);
    await interaction.reply({ content: '❌ Failed to send rejection. Please check permissions.', ephemeral: true });
  }
});

client.login(token);
