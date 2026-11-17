import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import { addCommunityAnswer } from '../../../services/uplandFaqService.js';
import { getGuildConfig } from '../../../services/config/guildConfig.js';
import { memberHasModerationCommandAccess } from '../../../utils/permissionGuard.js';
import { successEmbed } from '../../../utils/embeds.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { buildFaqActionRow } from '../../../commands/Community/ask.js';
import { logger } from '../../../utils/logger.js';

export default {
    name: 'faq_teach_modal',
    async execute(interaction, client, args) {
        const guildId = args?.[0] || interaction.guildId || 'global';
        const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        if (!deferSuccess) return;

        const question = interaction.fields.getTextInputValue('faq_question')?.trim();
        const answer = interaction.fields.getTextInputValue('faq_answer')?.trim();

        const guildConfig = interaction.guild
            ? await getGuildConfig(client, interaction.guild.id)
            : null;

        const isVerifiedStaff = memberHasModerationCommandAccess(
            interaction.member,
            guildConfig,
            PermissionFlagsBits.ManageMessages
        );

        const { entry, updated } = await addCommunityAnswer(client, {
            guildId,
            question,
            answer,
            authorId: interaction.user.id,
            authorTag: interaction.user.tag,
            verified: isVerifiedStaff,
        });

        logger.info(`Community FAQ entry #${entry.id} ${updated ? 'updated' : 'saved'} via modal by ${interaction.user.tag}`);

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                successEmbed(
                    updated ? `Updated Community FAQ #${entry.id}` : `Saved to Community FAQ Database (#${entry.id})`,
                    `**Question:** ${entry.question}\n\n**Answer:**\n${entry.answer}\n\n*Saved to PostgreSQL by <@${interaction.user.id}>${isVerifiedStaff ? ' (✅ Verified Staff)' : ''}. Future \`/ask\` queries will automatically use this answer!*`
                ),
            ],
            components: [buildFaqActionRow(guildId)],
        });
    },
};
