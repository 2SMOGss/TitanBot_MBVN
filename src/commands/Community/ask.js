import {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
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
    registerPendingQuestion,
    memberHasVeteranAccess,
    postFaqAuditReview,
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
        const statusBadge = topMatch.verified ? '✅ Verified Staff/Veteran' : '👥 Community Answer';
        embed.addFields({
            name: '💾 Community FAQ Database',
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

    return embed;
}

export async function buildCommunityFaqListEmbed(client, guildId) {
    const entries = await listCommunityAnswers(client, guildId, 10);

    if (!entries.length) {
        return infoEmbed(
            '📚 Community FAQ Database',
            'No community answers have been learned yet!\n\nWhenever a player asks a question in chat that isn\'t in the official docs and a community member replies with the answer, the bot automatically learns and saves it here.'
        );
    }

    const lines = entries.map((e) => {
        const badge = e.verified ? '✅' : '💡';
        const shortAnswer = String(e.answer || '').replace(/\s+/g, ' ').slice(0, 140);
        return `**#${e.id}** ${badge} **Q:** ${e.question}\n↳ *${shortAnswer}${e.answer.length > 140 ? '...' : ''}* — by \`${e.author_tag || 'Member'}\``;
    });

    return createEmbed({
        title: `📚 Learned Community FAQ Database (${entries.length} Recent)`,
        description: lines.join('\n\n').slice(0, 3900),
        color: 'info',
        footer: 'Self-healing FAQ database • Admins can remove an entry with /ask question: delete #<id>',
    });
}

export default {
    data: new SlashCommandBuilder()
        .setName('ask')
        .setDescription('Ask any question about Upland (searches Official Docs & Self-Healing Community FAQ DB)')
        .addStringOption((option) =>
            option
                .setName('question')
                .setDescription('Your question about Upland (or "list" to view learned community answers)')
                .setMaxLength(300)
                .setRequired(true)
        )
        .addStringOption((option) =>
            option
                .setName('teach_answer')
                .setDescription('Optional: Directly save an answer for this question into the FAQ Database')
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
        const channelId = interaction.channel?.id || interaction.channelId;

        if (!rawQuestion) {
            await interaction.reply({
                embeds: [
                    infoEmbed(
                        '🦙 Upland FAQ Assistant',
                        'Ask any question about **Upland** right in chat, or use:\n• `/ask question: What is UPX used for?`\n• `!ask How do FSA properties work?`'
                    ),
                ],
            });
            return;
        }

        if (rawQuestion.toLowerCase() === 'list') {
            const listEmbed = await buildCommunityFaqListEmbed(interaction.client, guildId);
            await interaction.reply({
                embeds: [listEmbed],
            });
            return;
        }

        const result = await answerUplandQuestion(interaction.client, guildId, rawQuestion);
        const embed = buildAskResponseEmbed(rawQuestion, result);

        const sentMsg = await interaction.reply({
            embeds: [embed],
        });

        if (!result.answered && channelId) {
            registerPendingQuestion({
                guildId,
                channelId,
                question: rawQuestion,
                askerId: interaction.user?.id || interaction.author?.id,
                askerTag: interaction.user?.tag || interaction.author?.tag,
                messageId: interaction.id,
                questionMessageId: interaction.id,
                botReplyId: sentMsg?.id || null,
            });
        }
    },

    async execute(interaction, guildConfig, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) return;

        const guildId = interaction.guildId || 'global';
        const question = interaction.options.getString('question', true).trim();
        const teachAnswer = interaction.options.getString('teach_answer', false)?.trim();

        if (teachAnswer) {
            const isStaffOrVeteran = memberHasVeteranAccess(interaction.member, guildConfig);

            const result = await addCommunityAnswer(client, {
                guildId,
                question,
                answer: teachAnswer,
                authorId: interaction.user.id,
                authorTag: interaction.user.tag,
                verified: isStaffOrVeteran,
                isStaffOrVeteran,
            });

            if (result?.blocked) {
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        createEmbed({
                            title: '🔒 Verified FAQ Entry Protected',
                            description: `This question already has a verified **Staff / Veteran** answer (Entry **#${result.entry?.id || '?'}**) and cannot be overwritten by non-staff members.`,
                            color: 'warning',
                        }),
                    ],
                });
                return;
            }

            const { entry, updated } = result;
            logger.info(`Community FAQ entry #${entry.id} ${updated ? 'updated' : 'created'} by ${interaction.user.tag} (status=${entry.status})`);

            if (entry.status === 'pending' && interaction.guild) {
                await postFaqAuditReview({
                    client,
                    guild: interaction.guild,
                    guildConfig,
                    entry,
                    answerer: interaction.user,
                    channelId: interaction.channelId,
                    updated,
                    sourceLabel: '/ask teach_answer',
                });
            }

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    successEmbed(
                        updated ? `Updated Community FAQ #${entry.id}` : `Saved to Community FAQ Database (#${entry.id})`,
                        `**Question:** ${entry.question}\n\n**Answer:**\n${entry.answer}\n\n*Contributed by <@${interaction.user.id}>${isStaffOrVeteran ? ' (✅ Verified Staff/Veteran)' : ' (⏳ Pending Moderator/Veteran Approval)'}*`
                    ),
                ],
            });
            return;
        }

        if (question.toLowerCase() === 'list') {
            const listEmbed = await buildCommunityFaqListEmbed(client, guildId);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [listEmbed],
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

        const result = await answerUplandQuestion(client, guildId, question);
        const embed = buildAskResponseEmbed(question, result);

        const sentReply = await InteractionHelper.safeEditReply(interaction, {
            embeds: [embed],
        });

        if (!result.answered && interaction.channelId) {
            registerPendingQuestion({
                guildId,
                channelId: interaction.channelId,
                question,
                askerId: interaction.user.id,
                askerTag: interaction.user.tag,
                messageId: sentReply?.id || interaction.id,
                botReplyId: sentReply?.id || null,
            });
        }
    },
};
