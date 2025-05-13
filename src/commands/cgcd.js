const User = require('../database/userModel');
const { EmbedBuilder } = require('discord.js');

const cooldowns = {
  cgdrop: 60 * 60 * 1000,                  // 1 hour
  cgdaily: 12 * 60 * 60 * 1000,            // 12 hours
  cgweekly: 7 * 24 * 60 * 60 * 1000,       // 7 days
  cmmonthly: 30 * 24 * 60 * 60 * 1000      // 30 days
};
 

module.exports = {
  name: 'cmcd',
  description: 'Check your cooldowns',
  async execute(message) {
    const user = await User.findOne({ userId: message.author.id });
    if (!user) return message.reply('❌ Use `cmdebut` to start.');

    if (!user.cooldowns) user.cooldowns = {};

    const now = Date.now();
    const results = [];

    for (const [cmd, duration] of Object.entries(cooldowns)) {
      const lastUsed = user.cooldowns[cmd] ?? 0;
      const timeLeft = lastUsed + duration - now;

      results.push({
        name: cmd,
        value: timeLeft > 0 ? `⏳ ${formatTime(timeLeft)}` : '✅ Ready',
        inline: true
      });
    }

    const embed = new EmbedBuilder()
      .setTitle('🕒 Command Cooldowns')
      .addFields(results)
      .setColor('#1e90ff')
      .setFooter({ text: message.author.username, iconURL: message.author.displayAvatarURL() });

    return message.channel.send({ embeds: [embed] });
  }
};

function formatTime(ms) {
  const seconds = Math.floor(ms / 1000);
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  return [
    d ? `${d}d` : '',
    h ? `${h}h` : '',
    m ? `${m}m` : '',
    s ? `${s}s` : ''
  ].filter(Boolean).join(' ');
}
