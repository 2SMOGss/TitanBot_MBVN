import {
    MessageFlags,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
} from 'discord.js';
import { getGuildConfig } from '../services/config/guildConfig.js';
import { handleInteractionError, replyUserError, ErrorTypes } from '../utils/errorHandler.js';
import { logger } from '../utils/logger.js';

export async function handleVerificationButton(interaction, client) {
    try {
        if (!interaction.guild) {
            return await replyUserError(interaction, {
                type: ErrorTypes.UNKNOWN,
                message: 'This button can only be used in a server.',
            });
        }

        const guild = interaction.guild;
        const guildConfig = await getGuildConfig(client, guild.id);

        if (!guildConfig?.verification?.enabled || !guildConfig?.verification?.roleId) {
            return await replyUserError(interaction, {
                type: ErrorTypes.CONFIGURATION,
                message: 'The verification system is not currently configured on this server.',
            });
        }

        if (interaction.member?.roles?.cache?.has(guildConfig.verification.roleId)) {
            return await replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message: 'You are already verified and have access to all server channels.',
            });
        }

        const modal = new ModalBuilder()
            .setCustomId(`verify_upland_modal:${guild.id}`)
            .setTitle('🦙 Upland Server Verification');

        const usernameInput = new TextInputBuilder()
            .setCustomId('upland_username')
            .setLabel('Your In-Game Upland Username')
            .setPlaceholder('Enter your exact Upland IGN (so members know who you are in-game)')
            .setStyle(TextInputStyle.Short)
            .setMinLength(2)
            .setMaxLength(32)
            .setRequired(true);

        const homeCityInput = new TextInputBuilder()
            .setCustomId('upland_home_city')
            .setLabel('Home City / How You Found Us (Optional)')
            .setPlaceholder('e.g., Miami Beach, Manhattan, or Referred by...')
            .setStyle(TextInputStyle.Short)
            .setMaxLength(80)
            .setRequired(false);

        modal.addComponents(
            new ActionRowBuilder().addComponents(usernameInput),
            new ActionRowBuilder().addComponents(homeCityInput),
        );

        await interaction.showModal(modal);
    } catch (error) {
        logger.error('Error in verification button handler', {
            error: error.message,
            guildId: interaction.guild?.id,
            userId: interaction.user.id,
        });

        await handleInteractionError(
            interaction,
            error,
            { command: 'verify_button', action: 'verification' }
        );
    }
}

export default {
    customId: 'verify_user',
    execute: handleVerificationButton,
};
