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
import { createEmbed } from '../../../utils/embeds.js';
import {
    memberHasVeteranAccess,
    reviewCommunityAnswer,
    deleteCommunityAnswer,
    getCommunityAnswerById,
    buildFaqReviewRow,
    buildModReviewRow,
} from '../../../services/uplandFaqService.js';

const faqTeachButton = {
    name: 'faq_teach',
    async execute(interaction, client, args) {
        const guildId = args?.[0] || interaction.guildId || 'global';
        const embedTitle = interaction.message?.embeds?.[0]?.title || '';
        const prefillQuestion = embedTitle.replace(/^🦙\s*/, '').replace(/^📚.*$/, '').trim();

        const modal = new ModalBuilder()
            .setCustomId(`faq_teach_modal:${guildId}`)
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

const faqReviewApproveButton = {
    name: 'faq_review_approve',
    async execute(interaction, client, args) {
        const guildId = args?.[0] || interaction.guildId;
        const entryId = Number(args?.[1]);
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

export default [
    faqTeachButton,
    faqListButton,
    faqReviewApproveButton,
    faqReviewDisapproveButton,
    faqModApproveButton,
    faqModDeleteButton,
];
