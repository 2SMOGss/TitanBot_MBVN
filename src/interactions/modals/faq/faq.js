import { handleFaqTeachModalSubmit } from '../../buttons/faq/faq.js';

export default {
    name: 'faq_teach_modal',
    async execute(interaction, client, args) {
        const guildId = args?.[0] || interaction.guildId || 'global';
        await handleFaqTeachModalSubmit(interaction, client, guildId);
    },
};
