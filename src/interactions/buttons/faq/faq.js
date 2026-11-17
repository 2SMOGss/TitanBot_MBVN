import {
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    MessageFlags,
} from 'discord.js';
import { buildCommunityFaqListEmbed, buildFaqActionRow } from '../../../commands/Community/ask.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';

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

export default [faqTeachButton, faqListButton];
