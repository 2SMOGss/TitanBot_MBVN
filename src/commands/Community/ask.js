import {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    PermissionFlagsBits,
} from 'discord.js';
import { createEmbed, successEmbed, infoEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { memberHasModerationCommandAccess } from '../../utils/permissionGuard.js';
import {
    answerUplandQuestion,
    addCommunityAnswer,
    listCommunityAnswers,
    deleteCommunityAnswer,
} from '../../services/uplandFaqService.js';
import { logger } from '../../utils/logger.js';

export function buildFaqActionRow(guildId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`faq_teach:${guildId}`)
            .setLabel('Teach / Submit Answer')
            .setEmoji('💡')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`faq_list:${guildId}`)
            .setLabel('Community Answers DB')
            .setEmoji('📚')
            .setStyle(ButtonStyle.Secondary),
    );
}

export function buildAskResponseEmbed(question, result) {
    const { answer, sources = [], communityMatches = [] } = result;

    const embed = createEmbed({
        title: `🦙 ${String(question).slice(0, 240)}`,
        description: String(answer || 'No answer found.').slice(0, 3900),
        color: 'primary',
    });

    if (communityMatches.length > 0) {
        const topMatch = communityMatches[0];
        const statusBadge = topMatch.verified ? '✅ Verified Staff/Veteran' : '👥 Community Contributed';
        embed.addFields({
            name: '💾 Community FAQ Database Match',
            value: `Entry **#${topMatch.id}** by **${topMatch.author_tag || 'Member'}** (${statusBadge})`,
            inline: false,
        });
    }

    if (sources.length > 0) {
        const sourceLines = sources
            .slice(0, 3)
            .map((s) => `• [${s.title || 'Official Guide'}](${s.url})`)
            .join('\n');
        embed.addFields({
            name: '📖 Official Upland Sources',
            value: sourceLines.slice(0, 1024),
            inline: false,
        });
    }

    embed.setFooter({
        text: 'Know a better tip? Click "💡 Teach / Submit Answer" to save it to the database!',
    });

    return embed;
}

export async function buildCommunityFaqListEmbed(client, guildId) {
    const entries = await listCommunityAnswers(client, guildId, 10);

    if (!entries.length) {
        return infoEmbed(
            '📚 Community FAQ Database',
            'No user answers have been saved yet!\n\nClick **💡 Teach / Submit Answer** on any `/ask` response or run `/ask question:... teach_answer:...` to add the first community answer.'
        );
    }

    const lines = entries.map((e) => {
        const badge = e.verified ? '✅' : '💡';
        const shortAnswer = String(e.answer || '').replace(/\s+/g, ' ').slice(0, 140);
        return `**#${e.id}** ${badge} **Q:** ${e.question}\n↳ *${shortAnswer}${e.answer.length > 140 ? '...' : ''}* — by \`${e.author_tag || 'Member'}\``;
    });

    return createEmbed({
        title: `📚 Community FAQ Database (${entries.length} Recent)`,
        description: lines.join('\n\n').slice(0, 3900),
        color: 'info',
        footer: 'Use /ask question:<topic> to query both Official Docs & Community Answers',
    });
}

export default {
    data: new SlashCommandBuilder()
        .setName('ask')
        .setDescription('Ask any question about Upland or add an answer to the Community FAQ Database')
        .addStringOption((option) =>
            option
                .setName('question')
                .setDescription('Your question about Upland (or "list" to view saved community answers)')
                .setMaxLength(300)
                .setRequired(true)
        )
        .addStringOption((option) =>
            option
                .setName('teach_answer')
                .setDescription('Optional: Save your own answer for this question into the Community FAQ Database')
                .setMaxLength(1500)
                .setRequired(false)
        ),
    category: 'Community',

    async prefixExecute(interaction, argsOrConfig) {
        let rawQuestion = '';
        if (Array.isArray(argsOrConfig)) {
            rawQuestion = argsOrConfig.join(' ').trim();
        } else if (Array.isArray(interaction?.options?._hoistedOptions)) {
            rawQuestion = interaction.options._hoistedOptions
                .map((opt) => opt.value)
                .join(' ')
                .trim();
        } else if (typeof interaction?.options?.getString === 'function') {
            rawQuestion = (interaction.options.getString('question') || '').trim();
        }

        const guildId = interaction.guildId || interaction.guild?.id || 'global';

        if (!rawQuestion) {
            await interaction.reply({
                embeds: [
                    infoEmbed(
                        '🦙 Upland FAQ Assistant',
                        'Ask anything about **Upland** using:\n• `/ask question: What is UPX used for?`\n• `!ask What is UPX used for?`\n• `@titanbot-mbvn How do FSA properties work?`'
                    ),
                ],
                components: [buildFaqActionRow(guildId)],
            });
            return;
        }

        if (rawQuestion.toLowerCase() === 'list') {
            const listEmbed = await buildCommunityFaqListEmbed(interaction.client, guildId);
            await interaction.reply({
                embeds: [listEmbed],
                components: [buildFaqActionRow(guildId)],
            });
            return;
        }

        const result = await answerUplandQuestion(interaction.client, guildId, rawQuestion);
        const embed = buildAskResponseEmbed(rawQuestion, result);

        await interaction.reply({
            embeds: [embed],
            components: [buildFaqActionRow(guildId)],
        });
    },

    async execute(interaction, guildConfig, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) return;

        const guildId = interaction.guildId || 'global';
        const question = interaction.options.getString('question', true).trim();
        const teachAnswer = interaction.options.getString('teach_answer', false)?.trim();

        // 1. Direct Teach / Save Answer mode via optional parameter
        if (teachAnswer) {
            const isVerifiedStaff = memberHasModerationCommandAccess(
                interaction.member,
                guildConfig,
                PermissionFlagsBits.ManageMessages
            );

            const { entry, updated } = await addCommunityAnswer(client, {
                guildId,
                question,
                answer: teachAnswer,
                authorId: interaction.user.id,
                authorTag: interaction.user.tag,
                verified: isVerifiedStaff,
            });

            logger.info(`Community FAQ entry #${entry.id} ${updated ? 'updated' : 'created'} by ${interaction.user.tag}`);

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    successEmbed(
                        updated ? `Updated Community FAQ #${entry.id}` : `Saved to Community FAQ Database (#${entry.id})`,
                        `**Question:** ${entry.question}\n\n**Answer:**\n${entry.answer}\n\n*Contributed by <@${interaction.user.id}>${isVerifiedStaff ? ' (✅ Verified Staff)' : ''}*`
                    ),
                ],
                components: [buildFaqActionRow(guildId)],
            });
            return;
        }

        // 2. Quick commands: "list" or "delete #<id>"
        if (question.toLowerCase() === 'list') {
            const listEmbed = await buildCommunityFaqListEmbed(client, guildId);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [listEmbed],
                components: [buildFaqActionRow(guildId)],
            });
            return;
        }

        const deleteMatch = question.match(/^delete\s+#?(\d+)$/i);
        if (deleteMatch) {
            const isStaff = memberHasModerationCommandAccess(
                interaction.member,
                guildConfig,
                PermissionFlagsBits.ManageMessages
            );
            if (!isStaff) {
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        createEmbed({
                            title: 'Permission Denied',
                            description: 'Only Moderators or Admins can delete Community FAQ entries.',
                            color: 'error',
                        }),
                    ],
                });
                return;
            }

            const removed = await deleteCommunityAnswer(client, guildId, Number(deleteMatch[1]));
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    removed
                        ? successEmbed('Deleted Community FAQ Entry', `Removed entry **#${removed.id}** (*${removed.question}*).`)
                        : infoEmbed('Entry Not Found', `No Community FAQ entry with ID **#${deleteMatch[1]}** was found.`),
                ],
            });
            return;
        }

        // 3. Standard RAG + Community DB Question Answering
        const result = await answerUplandQuestion(client, guildId, question);
        const embed = buildAskResponseEmbed(question, result);

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [embed],
            components: [buildFaqActionRow(guildId)],
        });
    },
};
