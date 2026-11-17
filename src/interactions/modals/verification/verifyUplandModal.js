import { MessageFlags } from 'discord.js';
import { successEmbed } from '../../../utils/embeds.js';
import { verifyUser } from '../../../services/verificationService.js';
import { handleInteractionError, replyUserError, ErrorTypes } from '../../../utils/errorHandler.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { logger } from '../../../utils/logger.js';

export default {
    name: 'verify_upland_modal',
    async execute(interaction, client, args) {
        try {
            const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
            if (!deferSuccess) return;

            const guild = interaction.guild;
            if (!guild) {
                return await replyUserError(interaction, {
                    type: ErrorTypes.UNKNOWN,
                    message: 'Verification can only be completed inside a server.',
                });
            }

            const rawUsername = interaction.fields.getTextInputValue('upland_username')?.trim() || '';
            const rawHomeCity = interaction.fields.getTextInputValue('upland_home_city')?.trim() || '';

            // Reject empty, mention-spam, or URL payloads
            if (rawUsername.length < 2 || rawUsername.length > 32 || /[@<>]|https?:\/\//i.test(rawUsername)) {
                return await replyUserError(interaction, {
                    type: ErrorTypes.VALIDATION,
                    message: 'Please enter a valid in-game **Upland username** (2–32 characters, no links or mentions).',
                });
            }

            const result = await verifyUser(client, guild.id, interaction.user.id, {
                source: 'upland_modal',
                uplandUsername: rawUsername,
                homeCity: rawHomeCity || null,
            });

            if (result.status === 'already_verified') {
                return await replyUserError(interaction, {
                    type: ErrorTypes.VALIDATION,
                    message: 'You are already verified and have access to all server channels.',
                });
            }

            logger.info('User verified via Upland username modal', {
                guildId: guild.id,
                userId: interaction.user.id,
                uplandUsername: rawUsername,
                roleName: result.roleName,
            });

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    successEmbed(
                        '✅ Verification Successful!',
                        `Welcome to **${guild.name}**, **${rawUsername}**!\n\nYou have been verified and given the **${result.roleName}** role. You now have access to all server channels. 🎉`
                    ),
                ],
            });
        } catch (error) {
            logger.error('Error in verify_upland_modal handler', {
                error: error.message,
                guildId: interaction.guild?.id,
                userId: interaction.user.id,
            });

            await handleInteractionError(
                interaction,
                error,
                { command: 'verify_upland_modal', action: 'verification' }
            );
        }
    },
};
