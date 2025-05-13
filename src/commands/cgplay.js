
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, StringSelectMenuBuilder } = require('discord.js');
const User = require('../database/userModel');

const pitchTypes = ['Dry', 'Dusty', 'Green'];
const weatherTypes = ['Sunny', 'Rainy', 'Foggy'];
const stadiums = ['Lords', 'MCG', 'Wankhede'];
const ballSpeeds = ['Inswing', 'Outswing', 'Slower', 'Quick'];
const ballLines = ['Bouncer', 'Good Length', 'Full', 'Yorker'];
const shotTypes = ['Pull', 'Scoop', 'Flick', 'Drive', 'Cut', 'Defend', 'Sweep', 'Switch Hit', 'Loft'];

module.exports = {
  name: 'cmplay',
  description: 'Start a full cricket match against another user',
  async execute(message, args) {
    const overs = parseInt(args[0]);
    const opponent = message.mentions.users.first();

    if (![1, 5, 10, 20, 50].includes(overs)) return message.reply('❌ Choose 1, 5, 10, 20, or 50 overs.');
    if (!opponent || opponent.bot || opponent.id === message.author.id) return message.reply('❌ Mention a valid opponent.');

    const [user1, user2] = await Promise.all([
      User.findOne({ userId: message.author.id }),
      User.findOne({ userId: opponent.id })
    ]);

    if (!user1 || !user2 || user1.players.length < 2 || user2.players.length < 1)
      return message.reply('❌ Both players must have at least 2 players in their team.');

    const pitch = pitchTypes[Math.floor(Math.random() * pitchTypes.length)];
    const weather = weatherTypes[Math.floor(Math.random() * weatherTypes.length)];
    const stadium = stadiums[Math.floor(Math.random() * stadiums.length)];

    const matchEmbed = new EmbedBuilder()
      .setTitle('🏏 Match Invite')
      .setDescription(`**${message.author.username}** vs **${opponent.username}**
${overs}-Over Match`)
      .addFields(
        { name: '🏟️ Stadium', value: stadium, inline: true },
        { name: '🌤️ Weather', value: weather, inline: true },
        { name: '🧱 Pitch', value: pitch, inline: true }
      )
      .setColor('#1D9BF0')
      .setFooter({ text: 'Waiting for opponent to accept...' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('accept_match').setLabel('✅ Accept Match').setStyle(ButtonStyle.Success)
    );

    const sent = await message.channel.send({ content: `${opponent}`, embeds: [matchEmbed], components: [row] });

    const collector = sent.createMessageComponentCollector({ componentType: ComponentType.Button, time: 30000 });

    collector.on('collect', async i => {
      if (i.user.id !== opponent.id)
        return i.reply({ content: '❌ This match is not for you.', ephemeral: true });

      await i.deferUpdate();
      await message.channel.send('✅ Match accepted!');
      await handleToss(message, message.author, opponent, overs);
    });
  }
};

async function handleToss(message, user1, user2, overs) {
  const tossWinner = Math.random() > 0.5 ? user1 : user2;
  const tossLoser = tossWinner.id === user1.id ? user2 : user1;

  const tossEmbed = new EmbedBuilder()
    .setTitle('🪙 Toss Result')
    .setDescription(`🎉 **${tossWinner.username}** won the toss!
Choose to bat or bowl.`)
    .setColor('#FEE75C');

  const tossRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('bat_first').setLabel('🏏 Bat First').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('bowl_first').setLabel('🎯 Bowl First').setStyle(ButtonStyle.Secondary)
  );

  const tossMsg = await message.channel.send({ content: `${tossWinner}`, embeds: [tossEmbed], components: [tossRow] });

  const tossCollector = tossMsg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 30000 });

  tossCollector.on('collect', async i => {
    if (i.user.id !== tossWinner.id)
      return i.reply({ content: '❌ Only toss winner can decide.', ephemeral: true });

    await i.deferUpdate();

    const battingUser = i.customId === 'bat_first' ? tossWinner : tossLoser;
    const bowlingUser = i.customId === 'bat_first' ? tossLoser : tossWinner;

    await message.channel.send(`📢 **${battingUser.username}** will bat first.`);
    await setupInnings(message, battingUser, bowlingUser, overs, 'firstInnings');
  });
}

async function setupInnings(message, battingUser, bowlingUser, overs, inningsKey) {
  const battingDoc = await User.findOne({ userId: battingUser.id });
  const bowlingDoc = await User.findOne({ userId: bowlingUser.id });

  const batOptions = battingDoc.players.slice(0, 25).map(p => ({ label: p.Name || p.name, value: p.Name || p.name }));
  const bowlOptions = bowlingDoc.players.slice(0, 25).map(p => ({ label: p.Name || p.name, value: p.Name || p.name }));

  const selectOpeners = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId('select_openers').setMinValues(2).setMaxValues(2).setPlaceholder('Pick 2 Openers').addOptions(batOptions)
  );

  const selectBowler = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId('select_bowler').setMinValues(1).setMaxValues(1).setPlaceholder('Pick Opening Bowler').addOptions(bowlOptions)
  );

  await message.channel.send({ content: `${battingUser}, choose your 2 openers:`, components: [selectOpeners] });
  setTimeout(() => message.channel.send({ content: `${bowlingUser}, choose your opening bowler:`, components: [selectBowler] }), 5000);

  const matchState = {
    [inningsKey]: {
      score: 0, wickets: 0, balls: 0, overs,
      battingUser, bowlingUser,
      openers: [], bowler: '', runLog: []
    },
    phase: inningsKey
  };

  const collector = message.channel.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 60000 });
  const ready = { openers: false, bowler: false };

  collector.on('collect', async i => {
    if (i.customId === 'select_openers' && i.user.id === battingUser.id) {
      matchState[inningsKey].openers = i.values;
      ready.openers = true;
      await i.update({ content: `✅ Openers: ${i.values.join(', ')}`, components: [] });
    }
    if (i.customId === 'select_bowler' && i.user.id === bowlingUser.id) {
      matchState[inningsKey].bowler = i.values[0];
      ready.bowler = true;
      await i.update({ content: `🎯 Bowler: ${i.values[0]}`, components: [] });
    }

    if (ready.openers && ready.bowler) {
      collector.stop();
      await message.channel.send(`🚨 First over begins!`);
      await startBallByBall(message, matchState, inningsKey);
    }
  });
}

async function startBallByBall(message, matchState, inningsKey) {
  const innings = matchState[inningsKey];
  const { battingUser, bowlingUser } = innings;

  const speedButtons = new ActionRowBuilder().addComponents(
    ballSpeeds.map(b => new ButtonBuilder().setCustomId(`speed_${b.toLowerCase()}`).setLabel(b).setStyle(ButtonStyle.Secondary))
  );

  await message.channel.send({ content: `${bowlingUser}, choose your **speed type**:`, components: [speedButtons] });

  const speedCollector = message.channel.createMessageComponentCollector({ componentType: ComponentType.Button, time: 30000 });
  speedCollector.on('collect', async speedInt => {
    if (speedInt.user.id !== bowlingUser.id)
      return speedInt.reply({ content: '❌ Only the bowler can choose speed.', ephemeral: true });

    const speed = speedInt.customId.split('_')[1];
    await speedInt.deferUpdate();

    const lineButtons = new ActionRowBuilder().addComponents(
      ballLines.map(b => new ButtonBuilder().setCustomId(`line_${b.toLowerCase().replace(/ /g, '_')}`).setLabel(b).setStyle(ButtonStyle.Secondary))
    );

    await message.channel.send({ content: `${bowlingUser}, choose your **line/length**:`, components: [lineButtons] });

    const lineCollector = message.channel.createMessageComponentCollector({ componentType: ComponentType.Button, time: 30000 });
    lineCollector.on('collect', async lineInt => {
      if (lineInt.user.id !== bowlingUser.id)
        return lineInt.reply({ content: '❌ Not your choice.', ephemeral: true });

      const line = lineInt.customId.split('_')[1];
      await lineInt.deferUpdate();
      await message.channel.send(`🧤 **Bowling:** ${speed} + ${line}`);

      setTimeout(async () => {
        const rows = [];
        for (let i = 0; i < shotTypes.length; i += 5) {
          rows.push(new ActionRowBuilder().addComponents(
            shotTypes.slice(i, i + 5).map(s =>
              new ButtonBuilder().setCustomId(`shot_${s.toLowerCase().replace(/ /g, '_')}`).setLabel(s).setStyle(ButtonStyle.Primary)
            )
          ));
      const shotCollector = message.channel.createMessageComponentCollector({ componentType: ComponentType.Button, time: 30000 });

      shotCollector.on('collect', async sInt => {
        if (sInt.user.id !== battingUser.id)
          return sInt.reply({ content: 'Only the batsman can play.', ephemeral: true });

        const shot = sInt.customId.split('_')[1];
        const outcome = Math.random();
        let result;

        if (outcome < 0.1) {
          result = '🟥 OUT';
          innings.wickets++;
        } else if (outcome < 0.3) {
          result = '⚪ Dot';
        } else if (outcome < 0.6) {
          result = ' one Run';
          innings.score += 1;
        } else if (outcome < 0.85) {
          result = '🏏 FOUR!';
          innings.score += 4;
        } else {
          result = '🎉 SIX!';
          innings.score += 6;

        }

        await message.channel.send({ content: `${battingUser}, play your shot:`, components: rows });

        const shotCollector = message.channel.createMessageComponentCollector({ componentType: ComponentType.Button, time: 30000 });

        shotCollector.on('collect', async sInt => {
          if (sInt.user.id !== battingUser.id) return sInt.reply({ content: '❌ Not your shot.', ephemeral: true });

          const outcome = Math.random();
          let result;

          if (outcome < 0.1) result = '🟥 OUT', innings.wickets++;
          else if (outcome < 0.3) result = '⚪ Dot';
          else if (outcome < 0.6) result = '➕ 1 Run', innings.score += 1;
          else if (outcome < 0.85) result = '🏏 FOUR!', innings.score += 4;
          else result = '🎉 SIX!', innings.score += 6;

          innings.balls++;
          innings.runLog.push(result);

          await sInt.deferUpdate();
          await message.channel.send({
            embeds: [new EmbedBuilder()
              .setTitle('📊 Scorecard')
              .addFields(
                { name: '🏏 Score', value: `${innings.score}/${innings.wickets}`, inline: true },
                { name: '⏱ Overs', value: `${Math.floor(innings.balls / 6)}.${innings.balls % 6}`, inline: true },
                { name: '📈 Run Tracker', value: innings.runLog.slice(-6).join(' | ') }
              )
              .setColor('#32CD32')]
          });

          if (innings.balls >= innings.overs * 6 || innings.wickets >= 10 || (inningsKey === 'secondInnings' && innings.score >= matchState.firstInnings.score + 1)) {
            await handleInningsEnd(message, matchState, inningsKey);
          } else {
            await startBallByBall(message, matchState, inningsKey);
          }
        });
      }, 2000);
    }
  });
}
  )

async function handleInningsEnd(message, matchState, inningsKey) {
  const innings = matchState[inningsKey];

  if (inningsKey === 'secondInnings') {
    const first = matchState.firstInnings;
    const second = matchState.secondInnings;
    let result;

    if (second.score > first.score) result = `🎉 ${second.battingUser.username} wins by ${10 - second.wickets} wickets!`;
    else if (second.score < first.score) result = `🏆 ${first.battingUser.username} wins by ${first.score - second.score} runs!`;
    else result = `🤝 It's a tie!`;

    await message.channel.send(`📢 **Match Result:** ${result}`);
  } else {
    const secondBat = innings.bowlingUser;
    const secondBowl = innings.battingUser;

    matchState.secondInnings = {
      score: 0, wickets: 0, balls: 0, overs: innings.overs,
      battingUser: secondBat,
      bowlingUser: secondBowl,
      openers: [], bowler: '', runLog: [],
      target: innings.score + 1
    };

    await setupInnings(message, secondBat, secondBowl, innings.overs, 'secondInnings');
  }
}})}
