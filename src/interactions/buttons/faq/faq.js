import {
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    MessageFlags,
    PermissionFlagsBits,
} from 'discord.js';
import { buildCommunityFaqListEmbed, buildFaqActionRow } from '../../../commands/Community/ask.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { getGuildConfig } from '../../../services/config/guildConfig.js';
import { memberHasModerationCommandAccess } from '../../../utils/permissionGuard.js';
import { createEmbed, successEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import {
    addCommunityAnswer,
    memberHasVeteranAccess,
    reviewCommunityAnswer,
    deleteCommunityAnswer,
    getCommunityAnswerById,
    buildFaqReviewRow,
    buildModReviewRow,
    postFaqAuditReview,
    syncContributorVeteranStatus,
    VETERAN_ANSWER_THRESHOLD,
} from '../../../services/uplandFaqService.js';

export function isValidFaqEntryId(entryId) {
    return Number.isInteger(entryId) && entryId > 0;
}

export async function handleFaqTeachModalSubmit(modalInteraction, client, guildIdArg = null) {
    const guildId = guildIdArg || modalInteraction.guildId || 'global';
    const deferSuccess = await InteractionHelper.safeDefer(modalInteraction, { flags: MessageFlags.Ephemeral });
    if (!deferSuccess) return;

    const question = modalInteraction.fields.getTextInputValue('faq_question')?.trim();
    const answer = modalInteraction.fields.getTextInputValue('faq_answer')?.trim();

    const guildConfig = modalInteraction.guild
        ? await getGuildConfig(client, modalInteraction.guild.id)
        : null;

    const isStaffOrVeteran = memberHasVeteranAccess(modalInteraction.member, guildConfig);

    const result = await addCommunityAnswer(client, {
        guildId,
        question,
        answer,
        authorId: modalInteraction.user.id,
        authorTag: modalInteraction.user.tag,
        verified: isStaffOrVeteran,
        isStaffOrVeteran,
    });

    if (result?.blocked) {
        await InteractionHelper.safeEditReply(modalInteraction, {
            embeds: [
                createEmbed({
                    title: '🔒 Verified FAQ Entry Protected',
                    description: `This question already has a verified **Staff / Veteran** answer (Entry **#${result.entry?.id || '?'}**) and cannot be overwritten by non-staff members.`,
                    color: 'warning',
                }),
            ],
            components: [buildFaqActionRow(guildId)],
        });
        return;
    }

    const { entry, updated } = result;
    logger.info(`Community FAQ entry #${entry.id} ${updated ? 'updated' : 'saved'} via modal by ${modalInteraction.user.tag} (status=${entry.status})`);

    if (entry.status === 'approved' && modalInteraction.guild) {
        await syncContributorVeteranStatus(client, modalInteraction.guild, modalInteraction.user.id, guildConfig);
    } else if (entry.status === 'pending' && modalInteraction.guild) {
        await postFaqAuditReview({
            client,
            guild: modalInteraction.guild,
            guildConfig,
            entry,
            answerer: modalInteraction.user,
            channelId: modalInteraction.channelId,
            updated,
            sourceLabel: 'Teach / Submit Modal',
        });
    }

    await InteractionHelper.safeEditReply(modalInteraction, {
        embeds: [
            successEmbed(
                updated ? `Updated Community FAQ #${entry.id}` : `Saved to Community FAQ Database (#${entry.id})`,
                `**Question:** ${entry.question}\n\n**Answer:**\n${entry.answer}\n\n*Submitted by <@${modalInteraction.user.id}>${isStaffOrVeteran ? ' (✅ Verified Staff/Veteran)' : ' (⏳ Pending Moderator/Veteran Approval)'}.*`
            ),
        ],
        components: [buildFaqActionRow(guildId)],
    });
}

const faqTeachButton = {
    name: 'faq_teach',
    async execute(interaction, client, args) {
        const guildId = args?.[0] || interaction.guildId || 'global';
        const embedTitle = interaction.message?.embeds?.[0]?.title || '';
        const prefillQuestion = embedTitle.replace(/^🦙\s*/, '').replace(/^📚.*$/, '').trim();
        const modalCustomId = `faq_teach_inline:${guildId}:${interaction.id}`;

        const modal = new ModalBuilder()
            .setCustomId(modalCustomId)
            .setTitle('💡 Teach / Submit Upland Answer');

        const questionInput = new TextInputBuilder()
            .setCustomId('faq_question')
            .setLabel('Question about Upland')
            .setPlaceholder('e.g., How do FSA properties work in Miami Beach?')
            .setStyle(TextInputStyle.Short)
            .setMaxLength(300)
            .setRequired(true);

        if (prefillQuestion && prefillQuestion.length <= 300) {
            questionInput.setValue(prefillQuestion);
        }

        const answerInput = new TextInputBuilder()
            .setCustomId('faq_answer')
            .setLabel('Your Answer / Veteran Tip')
            .setPlaceholder('Write a clear, helpful answer that will be saved to the Community FAQ Database...')
            .setStyle(TextInputStyle.Paragraph)
            .setMinLength(10)
            .setMaxLength(1500)
            .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(questionInput),
            new ActionRowBuilder().addComponents(answerInput),
        );

        await interaction.showModal(modal);

        if (typeof interaction.awaitModalSubmit === 'function') {
            const submitted = await interaction
                .awaitModalSubmit({
                    time: 5 * 60 * 1000,
                    filter: (i) => i.customId === modalCustomId && i.user.id === interaction.user.id,
                })
                .catch(() => null);

            if (submitted) {
                await handleFaqTeachModalSubmit(submitted, client, guildId);
            }
        }
    },
};

const faqTeachModalHandler = {
    name: 'faq_teach_modal',
    async execute(interaction, client, args) {
        const guildId = args?.[0] || interaction.guildId || 'global';
        await handleFaqTeachModalSubmit(interaction, client, guildId);
    },
};

const faqListButton = {
    name: 'faq_list',
    async execute(interaction, client, args) {
        const guildId = args?.[0] || interaction.guildId || 'global';
        const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        if (!deferSuccess) return;

        const listEmbed = await buildCommunityFaqListEmbed(client, guildId);
        await InteractionHelper.safeEditReply(interaction, {
            embeds: [listEmbed],
            components: [buildFaqActionRow(guildId)],
        });
    },
};

function buildUpdatedReviewEmbed(entry, statusLabel, color, footerText) {
    return createEmbed({
        title: `🧠 Community FAQ #${entry.id} — ${statusLabel}`,
        color,
        fields: [
            {
                name: '❓ Question',
                value: String(entry.question).slice(0, 1024),
                inline: false,
            },
            {
                name: '💡 Answer',
                value: String(entry.answer).slice(0, 1024),
                inline: false,
            },
            {
                name: '🎓 Original Author',
                value: entry.author_id ? `<@${entry.author_id}>` : (entry.author_tag || 'Community Member'),
                inline: true,
            },
            {
                name: '📋 Status',
                value: statusLabel,
                inline: true,
            },
        ],
        footer: footerText,
    });
}

function replyInvalidEntryId(interaction) {
    return interaction.reply({
        embeds: [createEmbed({
            title: 'Invalid Entry ID',
            description: 'The FAQ entry ID must be a positive integer.',
            color: 'error',
        })],
        flags: MessageFlags.Ephemeral,
    });
}

const faqReviewApproveButton = {
    name: 'faq_review_approve',
    async execute(interaction, client, args) {
        const guildId = args?.[0] || interaction.guildId;
        const entryId = Number(args?.[1]);
        if (!Number.isInteger(entryId) || entryId <= 0) {
            return replyInvalidEntryId(interaction);
        }

        const guildConfig = await getGuildConfig(client, guildId);

        if (!memberHasVeteranAccess(interaction.member, guildConfig)) {
            return interaction.reply({
                embeds: [createEmbed({
                    title: 'Veteran or Staff Role Required',
                    description: 'Only **Veterans** (25+ answered questions), **Moderators**, or **Admins** can approve FAQ entries.',
                    color: 'error',
                })],
                flags: MessageFlags.Ephemeral,
            });
        }

        const updated = await reviewCommunityAnswer(client, guildId, entryId, 'approved', interaction.user.id);
        if (!updated) {
            return interaction.reply({
                embeds: [createEmbed({ title: 'Not Found', description: `FAQ entry #${entryId} no longer exists.`, color: 'warning' })],
                flags: MessageFlags.Ephemeral,
            });
        }

        if (updated.author_id && interaction.guild) {
            const vetStatus = await syncContributorVeteranStatus(client, interaction.guild, updated.author_id, guildConfig);
            if (vetStatus.newlyAwarded && vetStatus.veteranRole) {
                await interaction.channel?.send?.({
                    embeds: [
                        createEmbed({
                            title: '🏅 New Veteran Unlocked!',
                            description: `<@${updated.author_id}> just reached **${VETERAN_ANSWER_THRESHOLD}** approved community answers and earned the ${vetStatus.veteranRole} role!`,
                            color: 'success',
                        }),
                    ],
                }).catch(() => {});
            }
        }

        const embed = buildUpdatedReviewEmbed(
            updated,
            `✅ Approved by ${interaction.user.tag}`,
            'success',
            `Entry #${updated.id} • Active in FAQ Database`
        );

        await interaction.update({
            content: null,
            embeds: [embed],
            components: [buildFaqReviewRow(guildId, entryId)],
        });
    },
};

const faqReviewDisapproveButton = {
    name: 'faq_review_disapprove',
    async execute(interaction, client, args) {
        const guildId = args?.[0] || interaction.guildId;
        const entryId = Number(args?.[1]);
        if (!Number.isInteger(entryId) || entryId <= 0) {
            return replyInvalidEntryId(interaction);
        }

        const guildConfig = await getGuildConfig(client, guildId);

        if (!memberHasVeteranAccess(interaction.member, guildConfig)) {
            return interaction.reply({
                embeds: [createEmbed({
                    title: 'Veteran or Staff Role Required',
                    description: 'Only **Veterans** (25+ answered questions), **Moderators**, or **Admins** can disapprove FAQ entries.',
                    color: 'error',
                })],
                flags: MessageFlags.Ephemeral,
            });
        }

        const updated = await reviewCommunityAnswer(client, guildId, entryId, 'disapproved', interaction.user.id);
        if (!updated) {
            return interaction.reply({
                embeds: [createEmbed({ title: 'Not Found', description: `FAQ entry #${entryId} no longer exists.`, color: 'warning' })],
                flags: MessageFlags.Ephemeral,
            });
        }

        if (updated.author_id && interaction.guild) {
            await syncContributorVeteranStatus(client, interaction.guild, updated.author_id, guildConfig);
        }

        const modPing = guildConfig?.modRole ? `<@&${guildConfig.modRole}> ` : '';
        const embed = buildUpdatedReviewEmbed(
            updated,
            `⚠️ Disapproved by ${interaction.user.tag} — Needs Admin/Mod Review`,
            'warning',
            `Entry #${updated.id} paused from FAQ replies • Only Admins/Mods can Restore or Delete`
        );

        await interaction.update({
            content: `${modPing}⚠️ **FAQ #${updated.id}** was disapproved by <@${interaction.user.id}> and requires **Admin / Moderator** review:`,
            embeds: [embed],
            components: [buildModReviewRow(guildId, entryId)],
        });
    },
};

const faqModApproveButton = {
    name: 'faq_mod_approve',
    async execute(interaction, client, args) {
        const guildId = args?.[0] || interaction.guildId;
        const entryId = Number(args?.[1]);
        if (!Number.isInteger(entryId) || entryId <= 0) {
            return replyInvalidEntryId(interaction);
        }

        const guildConfig = await getGuildConfig(client, guildId);

        if (!memberHasModerationCommandAccess(interaction.member, guildConfig, PermissionFlagsBits.ManageMessages)) {
            return interaction.reply({
                embeds: [createEmbed({
                    title: 'Moderator / Admin Only',
                    description: 'Disapproved entries are locked for **Admin / Moderator** review. Veterans cannot override or delete them.',
                    color: 'error',
                })],
                flags: MessageFlags.Ephemeral,
            });
        }

        const updated = await reviewCommunityAnswer(client, guildId, entryId, 'approved', interaction.user.id);
        if (!updated) {
            return interaction.reply({
                embeds: [createEmbed({ title: 'Not Found', description: `FAQ entry #${entryId} no longer exists.`, color: 'warning' })],
                flags: MessageFlags.Ephemeral,
            });
        }

        if (updated.author_id && interaction.guild) {
            await syncContributorVeteranStatus(client, interaction.guild, updated.author_id, guildConfig);
        }

        const embed = buildUpdatedReviewEmbed(
            updated,
            `✅ Restored & Approved by ${interaction.user.tag}`,
            'success',
            `Entry #${updated.id} • Active in FAQ Database`
        );

        await interaction.update({
            content: null,
            embeds: [embed],
            components: [buildFaqReviewRow(guildId, entryId)],
        });
    },
};

const faqModDeleteButton = {
    name: 'faq_mod_delete',
    async execute(interaction, client, args) {
        const guildId = args?.[0] || interaction.guildId;
        const entryId = Number(args?.[1]);
        if (!Number.isInteger(entryId) || entryId <= 0) {
            return replyInvalidEntryId(interaction);
        }

        const guildConfig = await getGuildConfig(client, guildId);

        if (!memberHasModerationCommandAccess(interaction.member, guildConfig, PermissionFlagsBits.ManageMessages)) {
            return interaction.reply({
                embeds: [createEmbed({
                    title: 'Moderator / Admin Only',
                    description: 'Only **Moderators** or **Admins** can delete FAQ entries. Veterans can only Approve or Disapprove.',
                    color: 'error',
                })],
                flags: MessageFlags.Ephemeral,
            });
        }

        const existing = await getCommunityAnswerById(client, guildId, entryId);
        const removed = await deleteCommunityAnswer(client, guildId, entryId);
        const target = removed || existing;

        if (!target) {
            return interaction.reply({
                embeds: [createEmbed({ title: 'Already Deleted', description: `FAQ entry #${entryId} was already removed.`, color: 'info' })],
                flags: MessageFlags.Ephemeral,
            });
        }

        if (target.author_id && interaction.guild) {
            await syncContributorVeteranStatus(client, interaction.guild, target.author_id, guildConfig);
        }

        const embed = buildUpdatedReviewEmbed(
            target,
            `🗑️ Deleted by ${interaction.user.tag}`,
            'error',
            `Entry #${entryId} permanently removed from PostgreSQL`
        );

        await interaction.update({
            content: null,
            embeds: [embed],
            components: [],
        });
    },
};

const faqApproveAliasButton = {
    name: 'faq_approve',
    execute: faqReviewApproveButton.execute,
};

const faqDisapproveAliasButton = {
    name: 'faq_disapprove',
    execute: faqReviewDisapproveButton.execute,
};

const faqDeleteAliasButton = {
    name: 'faq_delete',
    execute: faqModDeleteButton.execute,
};

export default [
    faqTeachButton,
    faqTeachModalHandler,
    faqListButton,
    faqReviewApproveButton,
    faqReviewDisapproveButton,
    faqModApproveButton,
    faqModDeleteButton,
    faqApproveAliasButton,
    faqDisapproveAliasButton,
    faqDeleteAliasButton,
];
